---
id: T-010
title: Refactor agent subscription API (types, naming, lifecycle)
type: chore
status: done
priority: medium
epic: agents
effort: S
created: 2026-04-21
updated: 2026-04-21
---

Three related cleanup items for the agent stream subscription mechanism: move payload shapes to shared types, rename the handler to a clearer API, and fix the missing unsubscribe on session switch.

## Context

### 1. Shared types for subscription payloads

`AgentsModule.stream` currently inlines its payload type:

```ts
const { sessionId, action = "subscribe" } = msg as { sessionId?: string; action?: string };
```

This should live in `shared/types/index.ts` alongside `AgentSession`, `AgentTurn`, etc. so the frontend store can import and use it for the `request<T>()` call rather than ad-hoc casting.

Also audit **all other handlers** in `backend/src/modules/` for inlined payload types (e.g. `msg as { repo?: string; ... }`) and move those shapes to `shared/types/index.ts` as well.

### 2. Rename + restructure handlers

`agent/stream` is ambiguous — it sounds like a data stream rather than a subscription control message. Proposed split:

- `agent/subscribe` — payload: `{ sessionId: string; type: "stream" | "response" }` — registers the connection as a subscriber
- `agent/unsubscribe` — payload: `{ sessionId: string }` — removes the subscription

This also opens the door for a `"response"` subscription type later (subscribe to final turn output only, not deltas).

### 3. Unsubscribe on session switch

`selectSession` in the frontend store subscribes to the new session but never unsubscribes from the previously selected one. Over time a client accumulates subscriptions to every session it has ever viewed. Fix: call `agent/unsubscribe` for `previousSelectedSessionId` before subscribing to the new one.

## Acceptance

- [ ] `AgentSubscribeMsg` and `AgentUnsubscribeMsg` types exported from `shared/types/index.ts`
- [ ] Backend: `@handle("agent/subscribe")` replaces `agent/stream` subscribe branch
- [ ] Backend: `@handle("agent/unsubscribe")` replaces `agent/stream` unsubscribe branch
- [ ] Frontend store: `selectSession` sends `agent/unsubscribe` for previous session (if any) before subscribing
- [ ] Frontend store: `request<AgentSubscribeMsg>` uses the shared type
- [ ] Old `agent/stream` handler removed
- [ ] Tests updated

## Notes

<!-- 2026-04-21T00:00Z user --> Raised because agent/stream payload was inlined and the action:"subscribe"/"unsubscribe" split was unclear. Also noted frontend never unsubscribes on session switch.
