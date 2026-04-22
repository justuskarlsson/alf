/**
 * Claude Code SDK adapter — production agent implementation.
 * Maps SDK streaming messages to the impl interface (ActivityEvent stream).
 *
 * Session continuity: the SDK's own session_id is captured from the first
 * SDKSystemMessage and returned as sdkSessionId. On subsequent turns it is
 * passed back via options.resume so the SDK reconstructs the conversation.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ImplFn } from "../../../core/agents/types.js";
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

const REPOS_ROOT = process.env.REPOS_ROOT ?? `${process.env.HOME}/repos`;
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
    ...(ctx.sdkSessionId ? { resume: ctx.sdkSessionId } : {}),
    ...(systemPrompt ? { systemPrompt } : {}),
  };

  for await (const msg of query({ prompt, options })) {
    if (msg.type === "system" && msg.subtype === "init") {
      capturedSessionId = msg.session_id;
      continue;
    }

    if (msg.type === "assistant") {
      if (msg.error) {
        throw new Error(`Claude Code SDK error: ${msg.error}`);
      }
      for (const block of msg.message.content) {
        if (block.type === "thinking" && "thinking" in block) {
          const content = (block as { type: "thinking"; thinking: string }).thinking;
          emit({ event: "activity_start", activityType: "thinking" });
          emit({ event: "activity_delta", activityType: "thinking", content });
          emit({ event: "activity_end",   activityType: "thinking", content });
        } else if (block.type === "text" && "text" in block) {
          const content = (block as { type: "text"; text: string }).text;
          emit({ event: "activity_start", activityType: "text" });
          emit({ event: "activity_delta", activityType: "text", content });
          emit({ event: "activity_end",   activityType: "text", content });
        } else if (block.type === "tool_use" && "name" in block) {
          const b = block as { type: "tool_use"; name: string; input: unknown };
          const content = `${b.name}: ${JSON.stringify(b.input)}`;
          emit({ event: "activity_start", activityType: "tool" });
          emit({ event: "activity_delta", activityType: "tool", content });
          emit({ event: "activity_end",   activityType: "tool", content });
        } else {
          log.warn("Unhandled content block type", { type: block.type });
        }
      }
      continue;
    }

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
