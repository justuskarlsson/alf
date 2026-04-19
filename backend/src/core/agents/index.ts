/**
 * Agents core — session lifecycle, turn tracking, impl dispatch.
 * This is the 10% of code that 90% of the agent flow runs through.
 *
 * Core writes to DB and forwards live deltas to the stream sink.
 * It knows nothing about relay, websockets, or specific impls.
 */

import { dbRepos, dbSessions, dbTurns, dbActivities } from "../db/index.js";
import type { ImplFn, ActivityType, LiveDelta } from "./types.js";

export type { LiveDelta };

/** Called by the handler for each delta during a turn. */
export type StreamSink = (delta: LiveDelta) => void;

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/** Create a new session scoped to a repo. Returns the sessionId. */
export function initSession(repoPath: string, impl = "test"): string {
  const repo = dbRepos.upsert(repoPath);
  return dbSessions.create(repo.id, impl).id;
}

// ---------------------------------------------------------------------------
// Turn execution
// ---------------------------------------------------------------------------

/**
 * Run a single turn: call impl, stream deltas through sink, persist to DB.
 * Returns after the turn completes (or throws on error).
 */
export async function runTurn(
  sessionId: string,
  prompt: string,
  impl: ImplFn,
  sink: StreamSink,
): Promise<void> {
  const session = dbSessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const repo = dbRepos.get(session.repo_id);
  if (!repo) throw new Error(`Repo not found for session: ${sessionId}`);

  const turn = dbTurns.create(sessionId, prompt);

  // 0-based within this turn — resets each turn. Replay uses (turn.idx, activity.idx) composite.
  let activityIdx = 0;
  let currentType: ActivityType | null = null;

  const result = await impl(
    prompt,
    { sessionId, sdkSessionId: session.sdk_session_id ?? undefined, repo: repo.path },
    (event) => {
      if (event.event === "activity_start") {
        currentType = event.activityType;

      } else if (event.event === "activity_delta") {
        // Forward to live subscribers immediately
        sink({ sessionId, activityType: event.activityType, content: event.content, idx: activityIdx });

      } else if (event.event === "activity_end") {
        // Persist completed activity
        dbActivities.create(turn.id, sessionId, event.activityType, event.content, activityIdx);
        activityIdx++;
        currentType = null;

      } else if (event.event === "turn_done") {
        dbTurns.complete(turn.id);
        dbSessions.touch(sessionId);
      }
    },
  );

  // Persist sdk_session_id on first turn
  if (result.sdkSessionId && !session.sdk_session_id) {
    dbSessions.setSdkSessionId(sessionId, result.sdkSessionId);
  }

  void currentType; // suppress unused warning — tracked for potential partial-write recovery
}
