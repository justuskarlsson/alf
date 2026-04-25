/**
 * Shared types for the agents core layer and impl interface.
 */

export type ActivityType = "thinking" | "tool" | "text";

/**
 * Events emitted by an impl during a turn.
 * Core listens to these and writes to DB / forwards to stream subscribers.
 */
export type ActivityEvent =
  | { event: "activity_start"; activityType: ActivityType }
  | { event: "activity_delta"; activityType: ActivityType; content: string }
  | { event: "activity_end";   activityType: ActivityType; content: string }
  | { event: "session_ready";  sdkSessionId: string }
  | { event: "turn_done" };

/** Context passed to an impl on each turn. */
export interface ImplContext {
  sessionId: string;
  sdkSessionId?: string; // absent on first turn; set by impl result, then persisted
  repo: string;          // absolute path to the target repo
  model?: string;        // model override (e.g. "claude-opus-4-6"); impl decides whether to use it
}

/**
 * The impl interface. A lightweight adapter — mostly plumbing.
 * Returns sdkSessionId on first turn so core can persist it.
 */
export type ImplFn = (
  prompt: string,
  ctx: ImplContext,
  emit: (event: ActivityEvent) => void,
  signal?: AbortSignal,
) => Promise<{ sdkSessionId?: string }>;

/** A live delta forwarded to stream subscribers. */
export interface LiveDelta {
  sessionId: string;
  activityType: ActivityType;
  content: string;
  /** 0-based index of this activity within its turn (resets to 0 each turn). */
  idx: number;
}
