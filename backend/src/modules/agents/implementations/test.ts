/**
 * Test implementation — deterministic, no LLM, no cost.
 * Used for validating the full pipeline and in the test suite.
 *
 * Prompt may be a plain string key or a JSON object:
 *   { path?: "ping" | "think-only" | "error", delay?: number }
 *
 * Plain string keys (backward-compatible):
 *   "ping" (default) — thinking → tool → text (echo of prompt)
 *   "think-only"     — only a thinking activity
 *   "error"          — throws immediately (simulates impl failure)
 *
 * Configurable delay via TEST_IMPL_DELAY_MS env (default 50ms).
 * A "delay" field in the JSON prompt overrides the env default.
 */

import type { ImplFn } from "../../../core/agents/types.js";

const ENV_DELAY = Number(process.env.TEST_IMPL_DELAY_MS ?? 50);

interface TestPrompt {
  path?: "ping" | "think-only" | "error";
  delay?: number;
}

function parsePrompt(raw: string): { path: string; delay: number } {
  try {
    const obj = JSON.parse(raw) as TestPrompt;
    return { path: obj.path ?? "ping", delay: obj.delay ?? ENV_DELAY };
  } catch {
    return { path: raw, delay: ENV_DELAY };
  }
}

export const testImpl: ImplFn = async (prompt, ctx, emit, signal) => {
  const { path, delay: DELAY } = parsePrompt(prompt);

  if (path === "error") {
    throw new Error("testImpl: error path");
  }

  if (path === "think-only") {
    emit({ event: "activity_start", activityType: "thinking" });
    const content = "Thinking only.";
    await sleep(DELAY, signal);
    emit({ event: "activity_delta", activityType: "thinking", content });
    emit({ event: "activity_end", activityType: "thinking", content });
    emit({ event: "turn_done" });
    return {};
  }

  // Default path: "ping" (and anything else)

  // 1. Thinking
  emit({ event: "activity_start", activityType: "thinking" });
  const thinkingChunks = ["Analysing the request...", " Forming a plan.", " Ready."];
  let thinking = "";
  for (const chunk of thinkingChunks) {
    await sleep(DELAY, signal);
    thinking += chunk;
    emit({ event: "activity_delta", activityType: "thinking", content: chunk });
  }
  emit({ event: "activity_end", activityType: "thinking", content: thinking });

  // 2. Tool use (fake read)
  emit({ event: "activity_start", activityType: "tool" });
  const toolContent = `read_file: ${ctx.repo}/README.md`;
  await sleep(DELAY, signal);
  emit({ event: "activity_delta", activityType: "tool", content: toolContent });
  emit({ event: "activity_end", activityType: "tool", content: toolContent });

  // 3. Text — echo the prompt word by word
  emit({ event: "activity_start", activityType: "text" });
  const words = `Echo: ${prompt}`.split(" ");
  let text = "";
  for (const word of words) {
    await sleep(DELAY, signal);
    const chunk = (text ? " " : "") + word;
    text += chunk;
    emit({ event: "activity_delta", activityType: "text", content: chunk });
  }
  emit({ event: "activity_end", activityType: "text", content: text });

  emit({ event: "turn_done" });

  return {}; // no sdkSessionId — test impl has no external session
};

// ---------------------------------------------------------------------------

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}
