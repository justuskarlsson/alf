/**
 * Test implementation — deterministic, no LLM, no cost.
 * Used for validating the full pipeline and in the test suite.
 *
 * Emits: thinking → tool (fake) → text (echo of prompt).
 * Configurable delay via TEST_IMPL_DELAY_MS env (default 50ms).
 */

import type { ImplFn } from "../../../core/agents/types.js";

const DELAY = Number(process.env.TEST_IMPL_DELAY_MS ?? 50);

export const testImpl: ImplFn = async (prompt, ctx, emit) => {
  // 1. Thinking
  emit({ event: "activity_start", activityType: "thinking" });
  const thinkingChunks = ["Analysing the request...", " Forming a plan.", " Ready."];
  let thinking = "";
  for (const chunk of thinkingChunks) {
    await sleep(DELAY);
    thinking += chunk;
    emit({ event: "activity_delta", activityType: "thinking", content: chunk });
  }
  emit({ event: "activity_end", activityType: "thinking", content: thinking });

  // 2. Tool use (fake read)
  emit({ event: "activity_start", activityType: "tool" });
  const toolContent = `read_file: ${ctx.repo}/README.md`;
  await sleep(DELAY);
  emit({ event: "activity_delta", activityType: "tool", content: toolContent });
  emit({ event: "activity_end", activityType: "tool", content: toolContent });

  // 3. Text — echo the prompt word by word
  emit({ event: "activity_start", activityType: "text" });
  const words = `Echo: ${prompt}`.split(" ");
  let text = "";
  for (const word of words) {
    await sleep(DELAY);
    const chunk = (text ? " " : "") + word;
    text += chunk;
    emit({ event: "activity_delta", activityType: "text", content: chunk });
  }
  emit({ event: "activity_end", activityType: "text", content: text });

  emit({ event: "turn_done" });

  return {}; // no sdkSessionId — test impl has no external session
};

// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
