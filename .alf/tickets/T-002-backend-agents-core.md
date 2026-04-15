---
id: T-002
title: Backend agents core — session lifecycle, turn tracking, impl dispatch
type: feature
status: open
priority: high
epic: agents
effort: L
created: 2026-04-15
updated: 2026-04-15
---

Implement `core/agents/` on the backend: the shared module that manages session/turn/activity lifecycle, writes to SQLite via the DAL, and dispatches to a vendor implementation. This is the engine everything else plugs into.

## Context

From the sketch and INDEX.md:

```
agent/message  →  Core  →  call impl
                    ↓
                 SQLite (write every N chunks / delta)
                    ↓
              (if client listens) → agent/stream
```

`core/agents` sits between the handler (`modules/agents/handler.ts`) and the impl. The handler creates/resolves a session and hands off to core. Core:
1. Creates Turn in DB
2. Calls impl (passes a streaming callback)
3. On each delta from impl: writes Activity chunk to DB, forwards to subscribed stream clients
4. Finalises Turn when impl yields

The impl interface (see T-003) is a lightweight adapter contract — core doesn't know about Claude or Codex.

Key design from INDEX.md:
> Flow: req: /agents/send → modules/agents/handler.ts → modules/agents/implementations/* (gets along the core object)

`core/agents` should be small and well-understood (the 90/10 rule).

## Acceptance

- [ ] `core/agents/` module with: `createSession`, `continueSession`, `runTurn`
- [ ] `runTurn(session, prompt, impl, streamSink)` writes Turn + Activity rows to DB
- [ ] Impl interface defined: `(prompt, session, onDelta) => AsyncIterable<Activity>`
- [ ] `agent/message` handler wired up (creates/resolves session, calls core)
- [ ] Stream sink abstraction: core notifies subscribers without knowing relay details
- [ ] Batching: write to DB every N deltas (N configurable, default 10)
- [ ] Depends on T-001 (DAL) and T-003 (test impl for smoke-testing)

## Notes

<!-- 2026-04-15T00:00Z agent:alfred -->
Q: Should `agent/message` always create a new session, or resume an existing one by sessionId param?
Q: Does the stream sink live in core, or does the handler pass it in? Sketch shows "if client listens to this session" as a separate concern — probably handler passes in the sink.
