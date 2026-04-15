---
id: T-004
title: agent/stream — live activity streaming to frontend
type: feature
status: open
priority: high
epic: agents
effort: M
created: 2026-04-15
updated: 2026-04-15
---

Implement the `agent/stream` WS endpoint that lets a frontend client subscribe to a live session and receive activity deltas as they're produced.

## Context

From the sketch:
```
agent/stream  ← listen
   ↑
FRONTEND  (1 per client)
   ↑
Core  (forwards deltas to subscribed clients)
```

When `agent/message` triggers a turn, `core/agents` writes deltas to DB and simultaneously forwards them to any clients subscribed to that session via `agent/stream`.

Key points:
- 1 stream subscription per client per session
- The stream carries the same activity events being written to the DB
- On subscribe, the client may already be behind — initial catch-up is handled by `agent/detail` (T-005), not this endpoint
- This endpoint only delivers *live* (future) deltas while the turn runs

Wire format needs to mirror the Activity types: `{ type: "activity_delta", activityType: "text"|"thinking"|"tool", idx: number, content: string }` (exact shape TBD).

## Acceptance

- [ ] `agent/stream` WS message type: subscribe `{ sessionId }`, unsubscribe
- [ ] Core stream sink registers subscriber by sessionId → relay connectionId
- [ ] Deltas forwarded to subscribed clients in real-time during a turn
- [ ] Client disconnects cleanly unsubscribes (no memory leak)
- [ ] Tested end-to-end with test impl (T-003)

## Notes

<!-- 2026-04-15T00:00Z agent:alfred -->
RESOLVED: Stream all activity types (thinking, tool, text). Newest activity displayed on top (stack pattern — see nanoclaw-dev/alf-desktop for reference). Thinking is uncollapsed by default.
RESOLVED: Multiple clients subscribing to the same session each receive deltas independently.
