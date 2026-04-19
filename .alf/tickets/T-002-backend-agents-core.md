---
id: T-002
title: Backend agents core — session lifecycle, turn tracking, impl dispatch
type: feature
status: done
priority: high
epic: agents
effort: L
created: 2026-04-15
updated: 2026-04-19
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
RESOLVED: Two internal functions — `initSession()` (creates DB record, no SDK session ID yet) and `runTurn(sessionId, prompt)` (gets/creates SDK session on first turn, stores sdk_session_id). Can expose as two endpoints or one flexible endpoint, TBD.
RESOLVED: Stream sink passed in by handler — core doesn't know about relay details.
