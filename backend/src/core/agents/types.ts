/**
 * Shared types for the agents core layer.
 *
 * There is a single agent backend (the Cursor SDK), so there is no longer an
 * "impl" abstraction — core drives the Cursor driver directly. These types
 * describe the event stream the driver emits and the data core persists.
 */

export type ActivityType = "thinking" | "tool" | "text";

/** Snapshot of context window consumption at end of a turn. */
export interface ContextUsage {
  contextTokens: number;    // tokens currently in context window
  maxContextTokens: number; // model's context window size
}

/**
 * Events emitted by the driver during a turn.
 *
 * Streaming model: `activity_start` opens a slot, `activity_delta` appends
 * chunks live, `activity_end` persists the full content. Tools are emitted as
 * a start/end pair with no deltas (complete when the tool finishes).
 */
export type ActivityEvent =
  | { event: "session_ready"; sdkSessionId: string }
  | { event: "activity_start"; activityType: ActivityType }
  | { event: "activity_delta"; activityType: ActivityType; content: string }
  | { event: "activity_end";   activityType: ActivityType; content: string }
  | { event: "turn_done"; usage?: ContextUsage };

/** Result returned from runTurn's done promise. */
export interface TurnResult {
  usage?: ContextUsage;
}

/** Context passed to the driver on each turn. */
export interface TurnContext {
  sessionId: string;
  sdkSessionId?: string; // absent on first turn; the Cursor agentId, persisted by core
  repo: string;          // repo path relative to REPOS_ROOT
  model?: string;        // Cursor model id override (e.g. "composer-2.5")
}

/** A live update forwarded to stream subscribers, one per activity. */
export interface LiveDelta {
  sessionId: string;
  activityType: ActivityType;
  content: string;
  /** 0-based index of this activity within its turn (resets to 0 each turn). */
  idx: number;
  /** false = activity started (placeholder), true = full content delivered. */
  done: boolean;
}
