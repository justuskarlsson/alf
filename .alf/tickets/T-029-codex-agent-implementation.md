---
id: T-029
title: Codex agent SDK implementation
type: research
status: future
priority: medium
epic: agents
effort: L
created: 2026-04-24
updated: 2026-04-24
---

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

- New file: `modules/agents/implementations/codex.ts`
- Lightweight adapter — most logic stays in `core/agents`
- Model selector (T-017) should allow picking Codex as the provider
- `npm install @openai/codex-sdk` (requires `@openai/codex` CLI installed)

## Acceptance

- [ ] `codex.ts` implementation conforming to `ImplFn` interface
- [ ] Streaming works (thinking, tool use, text activities mapped from Codex items)
- [ ] Session persistence works (thread ID stored as sdkSessionId)
- [ ] Session continuity via `resumeThread()`
- [ ] Can switch between Claude and Codex via model selector

## Notes

### Sources
- [Codex SDK docs](https://developers.openai.com/codex/sdk)
- [@openai/codex-sdk npm](https://www.npmjs.com/package/@openai/codex-sdk)
- [GitHub repo & TS SDK](https://github.com/openai/codex/tree/main/sdk/typescript)
- [App Server architecture](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [Codex Agents SDK guide](https://developers.openai.com/codex/guides/agents-sdk)
- [Fork discussion](https://github.com/openai/codex/issues/4972)
