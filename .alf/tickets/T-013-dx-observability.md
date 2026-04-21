---
id: T-013
title: DX / observability — request logging, type cleanup, test impl paths
type: chore
status: done
priority: low
epic: dx
effort: S
created: 2026-04-21
updated: 2026-04-21
---

A batch of small developer-experience improvements: relay request logging for frontend traceability, type cleanup in AgentsPanel, test coverage for stream subscription, and multiple deterministic flows in the test agent implementation.

## Context

### 1. Relay `request` logging

The `request(msg)` function in `RelayProvider.tsx` dispatches a message and awaits a reply, but currently nothing is logged. Add `console.debug` (or a thin logger) at two points:

- `→ dispatch` — log `msg.type` + full payload before sending
- `← receive` — log `msg.type` + response when the promise resolves

This makes it easy to trace message flows in the browser devtools without needing a network tab (since it's WebSocket).

### 2. `ReturnType` abuse cleanup

`AgentsPanel.tsx:195` is one example of using `ReturnType<typeof useXxxStore.getState>["field"]` for typing. Audit the entire frontend for this pattern and replace with proper exported types. At minimum: export `LiveState` (or `AgentLiveState`) from the agents store. Check other store files too.

### 3. Stream subscription test coverage

`agents.test.ts` tests `runTurn` + sink deltas but does not test the actual subscription mechanism: that a subscriber registered via `subscribers.get(sessionId)` receives pushes via `push(connectionId, delta)`. Add a test that:

- Creates a session
- Registers a fake `connectionId` in `subscribers`
- Runs a turn
- Asserts the fake push function was called with the expected deltas

### 4. Deterministic test impl paths

`testImpl` always runs the same fixed sequence (thinking → tool → text). For testing purposes it's useful to have a few keyed paths:

- `"ping"` → current behaviour (thinking + tool + text)
- `"think-only"` → only thinking activity
- `"error"` → emits an error event / throws
- (others as needed)

Prompt matching: if the prompt equals a known key, take that path; otherwise fall back to default (ping). This lets unit tests exercise specific activity combinations deterministically.

## Acceptance

- [ ] `request()` logs `→ type + payload` and `← type + response` at debug level
- [ ] `LiveState` (or `AgentLiveState`) type exported from agents store; used in AgentsPanel
- [ ] New unit test: subscriber receives push deltas during `runTurn`
- [ ] `testImpl` supports at least: `"ping"` (default), `"think-only"`, `"error"` paths
- [ ] Existing tests still pass

## Notes

<!-- 2026-04-21T00:00Z user --> Raised request logging for frontend traceability, flagged awkward ReturnType typing, noted stream subscription has no test coverage, and requested multiple deterministic paths in testImpl.
