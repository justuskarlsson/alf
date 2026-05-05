---
id: T-029
title: Codex agent SDK implementation
type: research
status: done
priority: medium
epic: agents
effort: L
created: 2026-04-24
updated: 2026-05-05
---

> **⚠️ Agent instruction:** Before implementing, do web research on the current state of the Codex SDK (`@openai/codex-sdk`). The research notes below were written in April 2026 and the SDK is evolving rapidly — verify the API surface, event model, and installation requirements are still accurate before writing any code.

Research and implement a Codex agent SDK adapter alongside the existing Claude Code SDK implementation.

## Research Findings

### SDK Comparison: Claude Code vs Codex

| Aspect | Claude Code SDK | Codex SDK (`@openai/codex-sdk`) |
|---|---|---|
| **Transport** | Spawns CLI, streams messages | Spawns CLI (`@openai/codex`), JSONL over stdin/stdout |
| **Session concept** | `session_id` from `system/init`, `resume` option | `Thread` object, `thread.run()` / `thread.runStreamed()` |
| **Continuity** | Pass `resume: sdkSessionId` on subsequent turns | Call `run()` repeatedly on same `Thread`, or `resumeThread(id)` |
| **Streaming** | `for await (msg of query(...))` — `content_block_start/delta/stop` | `for await (event of events)` — `item.completed`, `turn.completed` |
| **Forking** | Not natively exposed (we'd manage manually) | `thread.fork(messageIndex)` — branches from earlier user message |
| **Persistence** | We manage in SQLite | SDK persists in `~/.codex/sessions`, but we'd still track in our DB |
| **Auth** | `ANTHROPIC_API_KEY` | `OPENAI_API_KEY` |
| **Models** | Claude 4.5/4.6/Opus/Sonnet/Haiku | GPT-5.5, o3, o4-mini, etc. |
| **Abort** | AbortSignal on query | TBD — need to check if Thread supports cancellation |

### Codex SDK Event Model

Codex uses an **Item → Turn → Thread** hierarchy (very similar to our Activity → Turn → Session):

- **Item**: atomic unit — user message, agent message, tool execution, approval request, or diff. Lifecycle: `item.started` → `item.delta` → `item.completed`
- **Turn**: sequence of items from one `run()` call
- **Thread**: durable container, supports create/resume/fork/archive

This maps well to our `ActivityEvent` model:
- `item.started` → `activity_start`
- `item.delta` → `activity_delta`
- `item.completed` → `activity_end`
- Turn completion → `turn_done`

### Key Differences from Claude Code impl

1. **No raw `query()` stream** — Codex uses `thread.runStreamed()` returning an async generator
2. **Item types richer** — includes `diff` and `approval_request` (we'd need to map or ignore)
3. **Fork is native** — `thread.fork(idx)` built-in (our architecture would benefit from this)
4. **App Server protocol** — JSON-RPC over JSONL, designed for embedding (good fit)
5. **Image input** — supports `local_image` entries in `run()` (useful for future screenshot features)

### What the Adapter Needs to Do

The `ImplFn` interface (`prompt, ctx, emit, signal`) stays the same. The adapter:

```
1. new Codex() — or reuse instance
2. startThread() or resumeThread(ctx.sdkSessionId)
3. thread.runStreamed(prompt) → async generator
4. Map Codex events → ActivityEvent emissions:
   - item with type "agent_message" → thinking/text activities
   - item with type "tool_execution" → tool activity
   - turn.completed → turn_done
5. Capture thread.id as sdkSessionId for session continuity
6. Return { sdkSessionId: thread.id }
```

### Open Questions

- How does Codex handle abort/cancellation mid-stream?
- Do we need `@openai/codex` CLI installed globally, or does the SDK bundle it?
- `approval_request` items — auto-approve, or surface to user? (start with auto-approve)

## Implementation scope

- New file: `backend/src/modules/agents/implementations/codex.ts`
- Lightweight adapter — most logic stays in `core/agents` (the `ImplFn` interface, `runTurn`, DB writes are all impl-agnostic)
- Model selector (T-017) is done — just add `"codex"` to `AVAILABLE_IMPLS` and `MODEL_OPTIONS` in `frontend/src/modules/agents/store.ts`
- Register `codexImpl` in `IMPLS` record in `backend/src/modules/agents/index.ts`
- `pnpm add @openai/codex-sdk` in `backend/` (requires `@openai/codex` CLI installed on host)

## Acceptance

- [ ] `codex.ts` implementation conforming to `ImplFn` interface
- [ ] Streaming works (thinking, tool use, text activities mapped from Codex items)
- [ ] Session persistence works (thread ID stored as sdkSessionId)
- [ ] Session continuity via `resumeThread()`
- [ ] Can switch between Claude and Codex via model selector

## Files to change

### New files
- `backend/src/modules/agents/implementations/codex.ts` — The Codex SDK adapter. Must export a `codexImpl` conforming to `ImplFn` (same signature as `claudeCodeImpl` and `testImpl`: `(prompt, ctx, emit, signal) => Promise<{ sdkSessionId?: string }>`). Maps Codex `item.started/delta/completed` events to `activity_start/delta/end` emissions, and `turn.completed` to `turn_done`. Captures `thread.id` as `sdkSessionId` for session continuity via `resumeThread()`.

### Modified files
- `backend/package.json` — Add `@openai/codex-sdk` dependency.
- `backend/src/modules/agents/index.ts` — Import `codexImpl` from `./implementations/codex.js` and register it in the `IMPLS` record as `"codex"`.
- `frontend/src/modules/agents/store.ts` — Add `"codex"` to `AVAILABLE_IMPLS` array. Add a `"codex"` entry to `MODEL_OPTIONS` with available OpenAI models (e.g. `["gpt-4.1", "o3", "o4-mini"]`).
- `backend/src/core/agents/agents.test.ts` — Add a `describe.skipIf(!LIVE)("live smoke — codexImpl")` block mirroring the existing `claudeCodeImpl` live smoke test.

### No changes needed
- `backend/src/core/agents/types.ts` — `ImplFn`, `ActivityEvent`, `ImplContext`, `ActivityType` are all generic enough. No changes required.
- `backend/src/core/agents/index.ts` — Core turn execution (`runTurn`, `initSession`) is impl-agnostic. No changes needed.
- `shared/types/index.ts` — `impl` is already `string` typed, no enum restriction. No changes needed.
- `frontend/src/modules/agents/AgentsPanel.tsx` — Already renders `AVAILABLE_IMPLS` and `MODEL_OPTIONS` dynamically from the store. No changes needed.

## Dependencies

- **T-017 (Agent impl & model selector)** — Status: **done**. The frontend impl/model selector is already implemented and wired. Adding `"codex"` to `AVAILABLE_IMPLS` and `MODEL_OPTIONS` in the store is all that's needed on the frontend side.
- **No blocking dependencies.** The `ImplFn` interface, core agent layer, DB schema, frontend selectors, and subscription/streaming pipeline are all in place and impl-agnostic.
- **External dependency:** Requires `@openai/codex` CLI installed on the host (the SDK spawns it). Also requires `OPENAI_API_KEY` env var set for the backend process (similar to how Claude Code needs `ANTHROPIC_API_KEY`).

## Notes

### Sources
- [Codex SDK docs](https://developers.openai.com/codex/sdk)
- [@openai/codex-sdk npm](https://www.npmjs.com/package/@openai/codex-sdk)
- [GitHub repo & TS SDK](https://github.com/openai/codex/tree/main/sdk/typescript)
- [App Server architecture](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [Codex Agents SDK guide](https://developers.openai.com/codex/guides/agents-sdk)
- [Fork discussion](https://github.com/openai/codex/issues/4972)
