/**
 * Claude Code SDK adapter — production agent implementation.
 * Maps SDK streaming messages to the impl interface (ActivityEvent stream).
 *
 * With includePartialMessages the SDK emits stream_event messages containing
 * content_block_start / content_block_delta / content_block_stop, enabling
 * true incremental streaming to the frontend.
 *
 * Session continuity: the SDK's own session_id is captured from the first
 * SDKSystemMessage and emitted as a session_ready event so the caller can
 * persist it and reply to the WS request early. On subsequent turns it is
 * passed back via options.resume so the SDK reconstructs the conversation.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ImplFn, ActivityType } from "../../../core/agents/types.js";
import { createLogger } from "../../../core/logger.js";

const log = createLogger("claude-code-impl");

// ---------------------------------------------------------------------------
// System prompt — loaded once at module init
// ---------------------------------------------------------------------------

const PROMPT_PATH = process.env.SYSTEM_PROMPT_PATH
  ?? resolve(process.cwd(), "../infra/prompts/system.md");

let systemPrompt: string | undefined;
try {
  systemPrompt = readFileSync(PROMPT_PATH, "utf-8");
  log.info("Loaded system prompt", { path: PROMPT_PATH });
} catch {
  log.warn("System prompt not found, using SDK default", { path: PROMPT_PATH });
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

import { REPOS_ROOT } from "../../../core/config.js";
// Resolve claude binary: env override → ~/.local/bin/claude (native installer default)
const CLAUDE_BIN = process.env.CLAUDE_BINARY_PATH
  ?? `${process.env.HOME}/.local/bin/claude`;
const DISALLOWED_TOOLS = ["AskUserQuestion", "ExitPlanMode", "EnterPlanMode", "TodoWrite"];

export const claudeCodeImpl: ImplFn = async (prompt, ctx, emit) => {
  let capturedSessionId: string | undefined;

  const repoAbsPath = resolve(join(REPOS_ROOT, ctx.repo));

  const options: Parameters<typeof query>[0]["options"] = {
    cwd: repoAbsPath,
    pathToClaudeCodeExecutable: CLAUDE_BIN,
    disallowedTools: DISALLOWED_TOOLS,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
    ...(ctx.sdkSessionId ? { resume: ctx.sdkSessionId } : {}),
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(ctx.model ? { model: ctx.model } : {}),
  };

  // Track the current streaming content block
  let currentBlockType: ActivityType | null = null;
  let currentBlockContent = "";

  for await (const msg of query({ prompt, options })) {
    // -----------------------------------------------------------------------
    // SDK init — capture session ID immediately
    // -----------------------------------------------------------------------
    if (msg.type === "system" && msg.subtype === "init") {
      capturedSessionId = msg.session_id;
      emit({ event: "session_ready", sdkSessionId: msg.session_id });
      continue;
    }

    // -----------------------------------------------------------------------
    // Incremental streaming via stream_event (includePartialMessages: true)
    // -----------------------------------------------------------------------
    if (msg.type === "stream_event") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ev = (msg as any).event;
      if (!ev) continue;

      if (ev.type === "content_block_start") {
        const block = ev.content_block;
        if (block?.type === "thinking") {
          currentBlockType = "thinking";
          currentBlockContent = "";
          emit({ event: "activity_start", activityType: "thinking" });
        } else if (block?.type === "text") {
          currentBlockType = "text";
          currentBlockContent = "";
          emit({ event: "activity_start", activityType: "text" });
        } else if (block?.type === "tool_use") {
          currentBlockType = "tool";
          currentBlockContent = block.name ? `${block.name}: ` : "";
          emit({ event: "activity_start", activityType: "tool" });
        }
      }

      if (ev.type === "content_block_delta" && currentBlockType) {
        let chunk = "";
        if (ev.delta?.type === "thinking_delta") {
          chunk = ev.delta.thinking ?? "";
        } else if (ev.delta?.type === "text_delta") {
          chunk = ev.delta.text ?? "";
        } else if (ev.delta?.type === "input_json_delta") {
          chunk = ev.delta.partial_json ?? "";
        }
        if (chunk) {
          currentBlockContent += chunk;
          emit({ event: "activity_delta", activityType: currentBlockType, content: chunk });
        }
      }

      if (ev.type === "content_block_stop" && currentBlockType) {
        emit({ event: "activity_end", activityType: currentBlockType, content: currentBlockContent });
        currentBlockType = null;
        currentBlockContent = "";
      }

      continue;
    }

    // -----------------------------------------------------------------------
    // Full assistant message — skip content (already streamed above),
    // but check for errors
    // -----------------------------------------------------------------------
    if (msg.type === "assistant") {
      if (msg.error) {
        throw new Error(`Claude Code SDK error: ${msg.error}`);
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Result — final status
    // -----------------------------------------------------------------------
    if (msg.type === "result") {
      if (msg.subtype !== "success" || msg.is_error) {
        const errMsg = "errors" in msg
          ? (msg.errors as string[]).join("; ")
          : "subtype" in msg ? msg.subtype : "unknown error";
        throw new Error(`Claude Code SDK result error: ${errMsg}`);
      }
    }
  }

  emit({ event: "turn_done" });

  return { sdkSessionId: capturedSessionId ?? ctx.sdkSessionId };
};
