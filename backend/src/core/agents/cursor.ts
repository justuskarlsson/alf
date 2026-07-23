/**
 * Cursor Agent SDK driver — the single agent backend.
 *
 * Maps the Cursor SDK's streaming SDKMessages onto our ActivityEvent stream.
 * Consecutive thinking/assistant stream chunks are coalesced into one activity
 * each (with live `activity_delta`s); each completed tool call is its own
 * activity. Token-level deltas via `send({ onDelta })` are not used — the
 * `stream()` messages already arrive as appendable chunks.
 *
 * Session continuity: each WS session maps to one Cursor agent. On the first
 * turn we `Agent.create` and capture its `agentId`; on later turns we
 * `Agent.resume(agentId)` so the SDK reconstructs the conversation from its own
 * local store (separate from alf.db).
 */

import { Agent } from "@cursor/sdk";
import type { SDKMessage } from "@cursor/sdk";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPOS_ROOT } from "../config.js";
import { createLogger } from "../logger.js";
import type { ActivityEvent, ActivityType, TurnContext } from "./types.js";

const log = createLogger("cursor");

/** Default Cursor model. Override per-turn via the model arg, or globally via env. */
const DEFAULT_MODEL = process.env.CURSOR_MODEL ?? "composer-2.5";

/** Required — pass explicitly to Agent.create/resume (don't rely on SDK env fallback). */
const API_KEY = process.env.CURSOR_API_KEY ?? "";

/**
 * The SDK's native sandbox aborts on some hosts (e.g. WSL2). It's off by default
 * — this is a SWE agent meant to edit the target repo anyway. Set CURSOR_SANDBOX=1
 * to re-enable on hosts that support it.
 */
const SANDBOX_ENABLED = process.env.CURSOR_SANDBOX === "1";

// ---------------------------------------------------------------------------
// System prompt — loaded once at module init, prepended on the first turn.
// The Cursor SDK has no dedicated system-prompt option for local agents, so we
// fold it into the opening user message (and rely on .cursor/rules thereafter).
// ---------------------------------------------------------------------------

const PROMPT_PATH = process.env.SYSTEM_PROMPT_PATH
  ?? resolve(process.cwd(), "../infra/prompts/system.md");

let systemPrompt: string | undefined;
try {
  systemPrompt = readFileSync(PROMPT_PATH, "utf-8").trim() || undefined;
  log.info("Loaded system prompt", { path: PROMPT_PATH });
} catch {
  log.warn("System prompt not found, continuing without it", { path: PROMPT_PATH });
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * Run one turn against the Cursor SDK. Emits ActivityEvents as it streams and
 * returns the agentId so core can persist it for resume.
 */
export async function runCursorTurn(
  prompt: string,
  ctx: TurnContext,
  emit: (event: ActivityEvent) => void,
  signal?: AbortSignal,
): Promise<{ sdkSessionId?: string }> {
  const cwd = resolve(join(REPOS_ROOT, ctx.repo));
  const model = { id: ctx.model ?? DEFAULT_MODEL };

  // First turn gets the system prompt folded in; resumed turns already have context.
  const fullPrompt = (!ctx.sdkSessionId && systemPrompt)
    ? `${systemPrompt}\n\n---\n\n${prompt}`
    : prompt;

  if (!API_KEY) {
    throw new Error("CURSOR_API_KEY is not set — add it to infra/.env.dev and restart the backend");
  }

  const local = { cwd, sandboxOptions: { enabled: SANDBOX_ENABLED } };
  const opts = { model, local, apiKey: API_KEY };
  const agent = ctx.sdkSessionId
    ? await Agent.resume(ctx.sdkSessionId, opts)
    : await Agent.create(opts);

  // agentId is known immediately — surface it so core can persist/reply early.
  emit({ event: "session_ready", sdkSessionId: agent.agentId });

  const acc = new ActivityAccumulator(emit);

  try {
    const run = await agent.send(fullPrompt);

    // Bridge our AbortSignal to the SDK's cooperative cancel.
    const onAbort = () => { void run.cancel().catch(() => {}); };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      for await (const msg of run.stream()) {
        if (signal?.aborted) break;
        handleMessage(msg, acc);
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
      acc.flush();
    }

    emit({ event: "turn_done" });
    return { sdkSessionId: agent.agentId };
  } finally {
    agent.close();
  }
}

// ---------------------------------------------------------------------------
// Message mapping
// ---------------------------------------------------------------------------

/** Live tool content can be huge (file edits); the full text is still persisted. */
const TOOL_CONTENT_CAP = 2000;

/**
 * Coalesces consecutive thinking/text stream chunks into one activity each,
 * emitting live deltas. Tools are discrete complete activities.
 */
class ActivityAccumulator {
  private open: { type: "thinking" | "text"; content: string } | null = null;

  constructor(private readonly emit: (event: ActivityEvent) => void) {}

  /** Append a thinking/text chunk (handles both delta and cumulative SDK styles). */
  append(type: "thinking" | "text", chunk: string): void {
    if (!chunk) return;

    if (this.open && this.open.type !== type) this.flush();

    if (!this.open) {
      this.open = { type, content: "" };
      this.emit({ event: "activity_start", activityType: type });
    }

    // Some SDK messages are cumulative (full text so far); only take the suffix.
    let delta = chunk;
    if (chunk.startsWith(this.open.content) && chunk.length >= this.open.content.length) {
      delta = chunk.slice(this.open.content.length);
      if (!delta) return;
    }

    this.open.content += delta;
    this.emit({ event: "activity_delta", activityType: type, content: delta });
  }

  /** Emit a finished tool (or other discrete) activity. */
  complete(type: ActivityType, content: string): void {
    this.flush();
    this.emit({ event: "activity_start", activityType: type });
    this.emit({ event: "activity_end", activityType: type, content });
  }

  /** Close the open thinking/text activity, if any. */
  flush(): void {
    if (!this.open) return;
    const { type, content } = this.open;
    this.open = null;
    this.emit({ event: "activity_end", activityType: type, content });
  }
}

function handleMessage(msg: SDKMessage, acc: ActivityAccumulator): void {
  switch (msg.type) {
    case "thinking": {
      if (msg.text) acc.append("thinking", msg.text);
      break;
    }

    case "assistant": {
      // Tool uses arrive separately as `tool_call`; here we only surface text.
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) acc.append("text", block.text);
      }
      break;
    }

    case "tool_call": {
      // Emitted twice (running → completed/error). Record only the terminal form.
      if (msg.status === "running") break;
      acc.complete("tool", formatTool(msg));
      break;
    }

    case "status": {
      if (msg.status === "ERROR") {
        throw new Error(`Cursor agent error: ${msg.message ?? "unknown"}`);
      }
      break;
    }

    // system (init), user, task, request — nothing to persist.
    default:
      break;
  }
}

function formatTool(msg: Extract<SDKMessage, { type: "tool_call" }>): string {
  const parts = [msg.name];
  if (msg.args !== undefined) parts.push(cap(stringify(msg.args)));
  if (msg.status === "error") parts.push(`(error)`);
  return parts.join(": ");
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function cap(s: string): string {
  return s.length > TOOL_CONTENT_CAP ? s.slice(0, TOOL_CONTENT_CAP) + "…" : s;
}
