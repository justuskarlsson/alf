---
id: T-003
title: Test agent implementation — deterministic fake for pipeline validation
type: feature
status: open
priority: high
epic: agents
effort: S
created: 2026-04-15
updated: 2026-04-15
---

Implement a deterministic, non-LLM agent impl (`implementations/test.ts`) that exercises the full pipeline without any API calls or cost.

## Context

From INDEX.md:
> test: The first we implement. Not an llm. Deterministic simple implementation for testing. For testing the implementation interface and that everything works. So should still support forking, streaming, all the stuff. But doesnt cost money, and makes it easy to debug.

This is the first impl to build — it validates that core/agents (T-002), the DB writes (T-001), and the stream path (T-004) all work correctly before hooking up a real LLM.

The test impl should emit a predictable sequence of activities, e.g.:
1. `thinking_start` → a few `thinking_delta`s → `thinking_end`
2. `tool_start` (fake tool) → `tool_delta` → `tool_end`
3. `text_start` → several `text_delta`s (echoing the prompt back) → `text_end`

Configurable delay between deltas to simulate real streaming latency.

## Acceptance

- [ ] Implements the impl interface defined in T-002
- [ ] Emits thinking → tool → text activity sequence deterministically
- [ ] Prompt is echoed back in the text activity so you can verify round-trip
- [ ] Configurable delay (default 50ms between deltas)
- [ ] Selectable via `impl: "test"` in `agent/message` request payload
- [ ] Used in T-008 test suite to validate the pipeline end-to-end

## Notes

<!-- 2026-04-15T00:00Z agent:alfred -->
No open questions — this is deliberately simple. Keep it < 80 LOC.
