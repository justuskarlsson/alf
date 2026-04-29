/**
 * Agents core — session lifecycle, turn tracking, impl dispatch.
 * This is the 10% of code that 90% of the agent flow runs through.
 *
 * Core writes to DB and forwards live deltas to the stream sink.
 * It knows nothing about relay, websockets, or specific impls.
 */

import { dbRepos, dbSessions, dbTurns, dbActivities } from "../db/index.js";
import type { ImplFn, ActivityType, LiveDelta, TurnResult, ContextUsage } from "./types.js";

export type { LiveDelta, TurnResult, ContextUsage };

/** Called by the handler for each delta during a turn. */
export type StreamSink = (delta: LiveDelta) => void;

/** Returned by runTurn — two promises the caller can await independently. */
export interface TurnHandle {
  /** Resolves with sdkSessionId as soon as the impl surfaces it, or undefined if N/A. */
  sessionReady: Promise<string | undefined>;
  /** Resolves when the full turn completes (all activities persisted). */
  done: Promise<TurnResult>;
}

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
 * Start a turn. Returns immediately with two promises:
 *   sessionReady — resolves as soon as the SDK session ID is available
 *   done         — resolves when the turn finishes (or rejects on error)
 *
 * The caller can await sessionReady to reply to the WS request early,
 * while streaming continues through the sink until done resolves.
 */
export function runTurn(
  sessionId: string,
  prompt: string,
  impl: ImplFn,
  sink: StreamSink,
  model?: string,
  signal?: AbortSignal,
): TurnHandle {
  let resolveSessionReady!: (v: string | undefined) => void;
  const sessionReady = new Promise<string | undefined>(r => { resolveSessionReady = r; });
  let sessionReadyFired = false;

  const done = runTurnInner(sessionId, prompt, impl, sink, model, signal, (sdkSessionId) => {
    if (!sessionReadyFired) {
      sessionReadyFired = true;
      resolveSessionReady(sdkSessionId);
    }
  });

  // Guarantee sessionReady always resolves — even if turn errors or impl never emits session_ready.
  done.finally(() => {
    if (!sessionReadyFired) {
      sessionReadyFired = true;
      resolveSessionReady(undefined);
    }
  });

  return { sessionReady, done };
}

// ---------------------------------------------------------------------------
// Inner turn logic
// ---------------------------------------------------------------------------

async function runTurnInner(
  sessionId: string,
  prompt: string,
  impl: ImplFn,
  sink: StreamSink,
  model: string | undefined,
  signal: AbortSignal | undefined,
  onSessionReady: (sdkSessionId: string | undefined) => void,
): Promise<TurnResult> {
  const session = dbSessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const repo = dbRepos.get(session.repo_id);
  if (!repo) throw new Error(`Repo not found for session: ${sessionId}`);

  const turn = dbTurns.create(sessionId, prompt);

  // 0-based within this turn — resets each turn. Replay uses (turn.idx, activity.idx) composite.
  let activityIdx = 0;
  let currentType: ActivityType | null = null;
  let turnUsage: ContextUsage | undefined;

  const result = await impl(
    prompt,
    { sessionId, sdkSessionId: session.sdk_session_id ?? undefined, repo: repo.path, model },
    (event) => {
      if (signal?.aborted) return; // suppress events after abort

      if (event.event === "session_ready") {
        // Persist immediately and notify caller
        if (!session.sdk_session_id) {
          dbSessions.setSdkSessionId(sessionId, event.sdkSessionId);
        }
        onSessionReady(event.sdkSessionId);

      } else if (event.event === "activity_start") {
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
        if (event.usage) turnUsage = event.usage;
      }
    },
    signal,
  );

  // Fallback: persist sdkSessionId from return value if session_ready was never emitted
  if (result.sdkSessionId && !session.sdk_session_id) {
    dbSessions.setSdkSessionId(sessionId, result.sdkSessionId);
    onSessionReady(result.sdkSessionId);
  }

  void currentType; // suppress unused warning — tracked for potential partial-write recovery
  return { usage: turnUsage };
}
