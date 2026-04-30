---
id: T-042
title: "Agent turn makes other panels sluggish — possible blocking"
type: bug
status: open
priority: high
epic: agents
effort: M
created: 2026-04-30
updated: 2026-04-30
---

While a Claude Code agent turn is running, other panels (git diffs, file viewer) become very slow to load from the backend. Suggests the agent turn may be blocking the event loop or starving other request handlers.

## Context

The agent turn uses the Claude Code SDK via `runTurn()` which calls the impl function. If the impl or its streaming callback is doing synchronous work (e.g., synchronous DB writes via better-sqlite3, heavy delta processing), it could block the Node.js event loop and delay other incoming WS requests.

### Possible causes
- `better-sqlite3` is synchronous — every `dbActivities.create()`, `dbTurns.complete()`, `dbSessions.touch()` blocks the event loop during a turn
- The streaming callback processes many rapid deltas, each doing sync DB writes
- `execSync` in git/files handlers also blocks, but those are quick — the bottleneck is likely the agent turn holding the event loop
- Could also be relay-level: all messages flow through a single WS connection, and heavy delta traffic could congest the pipe

## Acceptance

- [ ] Other panels respond promptly while an agent turn is running
- [ ] No perceptible lag on git diff, file viewer, ticket loading during active turns

## Notes
