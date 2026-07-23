/**
 * Agents core — session lifecycle, turn tracking, Cursor driver dispatch.
 * This is the 10% of code that 90% of the agent flow runs through.
 *
 * Core writes to DB and forwards live activity updates to the stream sink.
 * It knows nothing about relay or websockets.
 */

import { dbRepos, dbSessions, dbTurns, dbActivities } from "../db/index.js";
import { runCursorTurn } from "./cursor.js";
import type { ActivityType, LiveDelta, TurnResult, ContextUsage } from "./types.js";

export type { LiveDelta, TurnResult, ContextUsage };

/** Called by the handler for each live activity update during a turn. */
export type StreamSink = (delta: LiveDelta) => void;

/** Returned by runTurn — two promises the caller can await independently. */
export interface TurnHandle {
  /** Resolves with sdkSessionId as soon as the driver surfaces it, or undefined if N/A. */
  sessionReady: Promise<string | undefined>;
  /** Resolves when the full turn completes (all activities persisted). */
  done: Promise<TurnResult>;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/** Create a new session scoped to a repo. Returns the sessionId. */
export function initSession(repoPath: string, impl = "cursor"): string {
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
  sink: StreamSink,
  model?: string,
  signal?: AbortSignal,
): TurnHandle {
  let resolveSessionReady!: (v: string | undefined) => void;
  const sessionReady = new Promise<string | undefined>(r => { resolveSessionReady = r; });
  let sessionReadyFired = false;

  const done = runTurnInner(sessionId, prompt, sink, model, signal, (sdkSessionId) => {
    if (!sessionReadyFired) {
      sessionReadyFired = true;
      resolveSessionReady(sdkSessionId);
    }
  });

  // Guarantee sessionReady always resolves — even if the turn errors early.
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
  let turnCompleted = false;

  try {
    const result = await runCursorTurn(
      prompt,
      { sessionId, sdkSessionId: session.sdk_session_id ?? undefined, repo: repo.path, model },
      (event) => {
        if (signal?.aborted) return; // suppress events after abort

        if (event.event === "session_ready") {
          if (!session.sdk_session_id) dbSessions.setSdkSessionId(sessionId, event.sdkSessionId);
          onSessionReady(event.sdkSessionId);

        } else if (event.event === "activity_start") {
          currentType = event.activityType;
          // Live placeholder so the UI can show the in-progress activity type.
          sink({ sessionId, activityType: event.activityType, content: "", idx: activityIdx, done: false });

        } else if (event.event === "activity_delta") {
          // Stream chunk into the current activity — same idx, not persisted yet.
          sink({ sessionId, activityType: event.activityType, content: event.content, idx: activityIdx, done: false });

        } else if (event.event === "activity_end") {
          // Persist the full activity, then forward it live (tool content capped).
          dbActivities.create(turn.id, sessionId, event.activityType, event.content, activityIdx);
          const live = event.activityType === "tool" && event.content.length > TOOL_LIVE_CAP
            ? event.content.slice(0, TOOL_LIVE_CAP) + "…"
            : event.content;
          sink({ sessionId, activityType: event.activityType, content: live, idx: activityIdx, done: true });
          activityIdx++;
          currentType = null;

        } else if (event.event === "turn_done") {
          dbTurns.complete(turn.id, event.usage
            ? { inputTokens: event.usage.contextTokens, outputTokens: 0, contextWindow: event.usage.maxContextTokens }
            : undefined);
          turnCompleted = true;
          dbSessions.touch(sessionId);
          if (event.usage) turnUsage = event.usage;
        }
      },
      signal,
    );

    // Fallback: persist sdkSessionId from return value if session_ready was never emitted.
    if (result.sdkSessionId && !session.sdk_session_id) {
      dbSessions.setSdkSessionId(sessionId, result.sdkSessionId);
      onSessionReady(result.sdkSessionId);
    }

    void currentType; // tracked for potential partial-write recovery

    // Safety net: mark the turn complete if the driver returned without turn_done.
    if (!turnCompleted) {
      dbTurns.complete(turn.id);
      turnCompleted = true;
      dbSessions.touch(sessionId);
    }

    return { usage: turnUsage };
  } catch (err) {
    // Ensure the turn is always marked complete, even on crash.
    if (!turnCompleted) {
      dbTurns.complete(turn.id);
      dbSessions.touch(sessionId);
    }
    throw err; // re-throw so the handler can still react to the error
  }
}

/** Live tool content is capped to avoid frontend render thrashing; full text is persisted. */
const TOOL_LIVE_CAP = 200;
