---
id: T-027
title: Add stop button for streaming agent sessions
type: feature
status: done
priority: high
epic: agents
effort: M
created: 2026-04-23
updated: 2026-04-23
---

Show a "Stop" icon button below the send button when the current session's turn is still streaming. Must be scoped per-session — only the session that is actively streaming should show the stop button, not others.

## Acceptance

- [x] Stop button appears below send when the viewed session is mid-turn/streaming
- [x] Stop button does NOT appear for sessions that are idle
- [x] Switching to a non-streaming session hides the stop button
- [x] Clicking stop cancels the active turn
- [x] UI updates immediately (stop button disappears, streaming ends)

## Notes
