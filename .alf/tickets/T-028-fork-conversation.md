---
id: T-028
title: "Fork conversation"
type: feature
status: done
priority: medium
epic: mvp4
effort: M
created: 2026-04-23
updated: 2026-04-23
---

Fork a session into a new independent session. Nanoclaw parity — forked session is a regular session in the sessions list.

## Context

Ref: T-018 §5. Simple fork, no tree view (deferred to T-024).

### Backend

DB additions:
```sql
ALTER TABLE sessions ADD COLUMN forked_from TEXT REFERENCES sessions(id);
ALTER TABLE sessions ADD COLUMN fork_point_turn_idx INTEGER;
```

Extend `agent/session/create` handler to accept optional `forkedFrom: { sessionId, turnIdx }`:
1. Create new session row with `forked_from` and `fork_point_turn_idx`.
2. Copy `sdk_session_id` from parent session.
3. On first `runTurn()`: pass `forkSession: true` to SDK → branches context.
4. After first turn: fork gets its own `sdk_session_id`. Subsequent turns use the new ID.

Forked session shows in sessions list like any other session.

### Frontend

- Fork button in ChatView header, next to impl/model dropdown.
- On click: calls `agent/session/create` with `forkedFrom` params.
- Navigates to new session.
- Sessions list shows forked sessions normally (with a small "forked from X" label if desired).

## Acceptance

- [x] DB schema: `forked_from` and `fork_point_turn_idx` columns on sessions
- [x] `agent/session/create` accepts `forkedFrom` param
- [x] Fork copies `sdk_session_id`, first turn uses `forkSession: true`
- [x] After first turn, fork has its own `sdk_session_id`
- [x] Fork button in ChatView header
- [x] Forked session appears in sessions list
- [x] Can send messages in forked session normally

## Notes

- 2026-04-23: Implemented. Migration `002_fork.sql` adds `forked_from` + `fork_point_turn_idx` to sessions. `dbSessions.fork()` creates new session and deep-copies all turns + activities up to fork point (new UUIDs for all copied rows). Backend `agent/session/create` accepts optional `forkedFrom: { sessionId, turnIdx }`. Frontend: `forkSession` store action, "fork" text button in ChatView header (visible when session has turns, disabled while running). Forked session titled "Fork of {parent title}". E2E test verified with screenshot.
