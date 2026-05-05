/**
 * OpenAI Codex SDK adapter — maps Codex streaming events to the impl interface.
 *
 * Uses @openai/codex-sdk to create/resume threads and run prompts. The SDK
 * spawns the Codex CLI binary under the hood and communicates via JSONL events.
 *
 * Session continuity: the thread ID is captured from the thread.started event
 * and emitted as session_ready so the caller can persist it. On subsequent turns
 * the thread is resumed via Codex.resumeThread(id).
 *
 * Event mapping:
 *   - ReasoningItem       → activity thinking
 *   - AgentMessageItem    → activity text
 *   - CommandExecutionItem→ activity tool
 *   - FileChangeItem      → activity tool
 *   - McpToolCallItem     → activity tool
 *   - TurnCompleted       → turn_done (with usage)
 */

import { Codex, type ThreadEvent, type ThreadItem } from "@openai/codex-sdk";
import { join, resolve } from "node:path";
import type { ImplFn, ActivityType, ContextUsage } from "../../../core/agents/types.js";
import { REPOS_ROOT } from "../../../core/config.js";
import { createLogger } from "../../../core/logger.js";

const log = createLogger("codex-impl");

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Model string from the frontend is actually a reasoning effort level.
 * We always use gpt-5.5 and vary the effort.
 */
const MODEL = "gpt-5.5";

const EFFORT_MAP: Record<string, "low" | "medium" | "high" | "xhigh"> = {
  "codex-low": "low",
  "codex-medium": "medium",
  "codex-high": "high",
  "codex-max": "xhigh",
};

function parseEffort(model?: string): "low" | "medium" | "high" | "xhigh" {
  if (!model) return "high";
  return EFFORT_MAP[model] ?? "high";
}

export const codexImpl: ImplFn = async (prompt, ctx, emit, signal) => {
  const repoAbsPath = resolve(join(REPOS_ROOT, ctx.repo));

  const codex = new Codex({
    ...(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {}),
    ...(process.env.OPENAI_BASE_URL ? { baseUrl: process.env.OPENAI_BASE_URL } : {}),
    ...(process.env.CODEX_PATH ? { codexPathOverride: process.env.CODEX_PATH } : {}),
  });

  const effort = parseEffort(ctx.model);

  const threadOptions = {
    model: MODEL,
    modelReasoningEffort: effort,
    workingDirectory: repoAbsPath,
    sandboxMode: "workspace-write" as const,
    approvalPolicy: "never" as const,
    skipGitRepoCheck: true,
  };

  // Resume existing thread, or start fresh. If resume fails (thread not found
  // in ~/.codex/sessions), fall back to a new thread gracefully.
  let thread = ctx.sdkSessionId
    ? codex.resumeThread(ctx.sdkSessionId, threadOptions)
    : codex.startThread(threadOptions);

  let capturedThreadId: string | undefined = ctx.sdkSessionId ?? undefined;

  let streamResult: { events: AsyncGenerator<ThreadEvent> };
  try {
    streamResult = await thread.runStreamed(prompt, { signal });
  } catch (err: unknown) {
    // If resume failed, start a fresh thread
    if (ctx.sdkSessionId) {
      log.warn("Resume failed, starting fresh thread", { error: String(err), oldThreadId: ctx.sdkSessionId });
      thread = codex.startThread(threadOptions);
      capturedThreadId = undefined;
      streamResult = await thread.runStreamed(prompt, { signal });
    } else {
      throw err;
    }
  }

  const { events } = streamResult;

  // Track active items for mapping start/delta/end
  const activeItems = new Map<string, { type: ActivityType; content: string }>();

  for await (const event of events) {
    if (signal?.aborted) break;

    switch (event.type) {
      // -----------------------------------------------------------------
      // Thread lifecycle
      // -----------------------------------------------------------------
      case "thread.started": {
        capturedThreadId = event.thread_id;
        emit({ event: "session_ready", sdkSessionId: event.thread_id });
        break;
      }

      // -----------------------------------------------------------------
      // Item started — emit activity_start
      // -----------------------------------------------------------------
      case "item.started": {
        const actType = itemToActivityType(event.item);
        const label = itemLabel(event.item);
        activeItems.set(event.item.id, { type: actType, content: label });
        emit({ event: "activity_start", activityType: actType });
        if (label) {
          emit({ event: "activity_delta", activityType: actType, content: label });
        }
        break;
      }

      // -----------------------------------------------------------------
      // Item updated — emit activity_delta with new content
      // -----------------------------------------------------------------
      case "item.updated": {
        const active = activeItems.get(event.item.id);
        if (!active) break;
        const newContent = itemContent(event.item);
        if (newContent.length > active.content.length) {
          const delta = newContent.slice(active.content.length);
          active.content = newContent;
          emit({ event: "activity_delta", activityType: active.type, content: delta });
        }
        break;
      }

      // -----------------------------------------------------------------
      // Item completed — emit activity_end
      // -----------------------------------------------------------------
      case "item.completed": {
        const active = activeItems.get(event.item.id);
        if (!active) {
          // Item we never saw start (shouldn't happen, but be defensive)
          const actType = itemToActivityType(event.item);
          const content = itemContent(event.item);
          emit({ event: "activity_start", activityType: actType });
          emit({ event: "activity_end", activityType: actType, content });
        } else {
          // Emit final content
          const finalContent = itemContent(event.item);
          if (finalContent.length > active.content.length) {
            const delta = finalContent.slice(active.content.length);
            emit({ event: "activity_delta", activityType: active.type, content: delta });
          }
          emit({ event: "activity_end", activityType: active.type, content: finalContent });
          activeItems.delete(event.item.id);
        }
        break;
      }

      // -----------------------------------------------------------------
      // Turn completed — emit turn_done with usage
      // -----------------------------------------------------------------
      case "turn.completed": {
        // input_tokens = actual context fill for this turn's API call.
        // output_tokens are generated tokens, NOT part of context window.
        // Codex CLI limits context to 400K for gpt-5.5 (API supports 1M).
        const usage: ContextUsage | undefined = event.usage
          ? {
              contextTokens: event.usage.input_tokens,
              maxContextTokens: 1_000_000,
            }
          : undefined;

        log.info("Turn completed", {
          threadId: capturedThreadId,
          inputTokens: event.usage?.input_tokens,
          outputTokens: event.usage?.output_tokens,
          effort: parseEffort(ctx.model),
        });

        emit({ event: "turn_done", usage });
        break;
      }

      // -----------------------------------------------------------------
      // Turn failed — throw so caller can handle
      // -----------------------------------------------------------------
      case "turn.failed": {
        throw new Error(`Codex turn failed: ${event.error.message}`);
      }

      // -----------------------------------------------------------------
      // Stream error — throw
      // -----------------------------------------------------------------
      case "error": {
        throw new Error(`Codex stream error: ${event.message}`);
      }

      default:
        // turn.started — no-op
        break;
    }
  }

  // If turn_done was not emitted (e.g. abort), emit it now
  // The for-await loop completes either when events are exhausted or abort fires
  // Check: if signal was aborted, don't emit turn_done — caller handles abort
  if (!signal?.aborted) {
    // turn.completed event already emits turn_done, so nothing extra needed here
  }

  return { sdkSessionId: capturedThreadId };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a ThreadItem to our ActivityType. */
function itemToActivityType(item: ThreadItem): ActivityType {
  switch (item.type) {
    case "reasoning":
      return "thinking";
    case "agent_message":
      return "text";
    case "command_execution":
    case "file_change":
    case "mcp_tool_call":
    case "web_search":
    case "todo_list":
      return "tool";
    case "error":
      return "text";
    default:
      return "text";
  }
}

/** Extract text content from a ThreadItem for streaming. */
function itemContent(item: ThreadItem): string {
  switch (item.type) {
    case "reasoning":
      return item.text;
    case "agent_message":
      return item.text;
    case "command_execution":
      return item.aggregated_output
        ? `$ ${item.command}\n${item.aggregated_output}`
        : `$ ${item.command}`;
    case "file_change":
      return item.changes.map(c => `${c.kind} ${c.path}`).join("\n");
    case "mcp_tool_call":
      return `[mcp:${item.server}/${item.tool}] ${JSON.stringify(item.arguments)}`;
    case "web_search":
      return `web_search: ${item.query}`;
    case "todo_list":
      return item.items.map(t => `${t.completed ? "[x]" : "[ ]"} ${t.text}`).join("\n");
    case "error":
      return item.message;
    default:
      return "";
  }
}

/** Generate a short label for an item at start (before full content is available). */
function itemLabel(item: ThreadItem): string {
  switch (item.type) {
    case "command_execution":
      return `$ ${item.command}\n`;
    case "mcp_tool_call":
      return `[mcp:${item.server}/${item.tool}] `;
    case "web_search":
      return `web_search: ${item.query}`;
    case "file_change":
      return item.changes.map(c => `${c.kind} ${c.path}`).join("\n");
    default:
      return "";
  }
}

