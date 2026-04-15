---
id: T-001
title: SQLite data layer — schema, migrations, DAL
type: feature
status: open
priority: high
epic: agents
effort: M
created: 2026-04-15
updated: 2026-04-15
---

Define the SQLite schema for the agent data layer: Repo, Session, Turn, Activity. Include a migration system and typed query helpers (DAL) consumed by `core/agents`.

## Context

The sketch shows DATA (SQLite) as the central source of truth. The hierarchy is:

```
Repo
 └── Session
      └── Turn
           └── Activity  (type: thinking | tool | text)
```

Every backend write path (agent/message) and read path (agent/overview, agent/detail) goes through this layer.

Design decisions to confirm before implementing:
- SQLite file location: index.md leans towards storing in the alf repo itself (e.g. `data/alf.db`), not per-repo storage. Confirm location.
- Activities store all types (thinking, tool, text) or only text? Full fidelity preferred per roadmap ("store everything").
- `activity_idx` is a per-session sequential int used for replay catch-up ("select max activity_idx").
- Custom git merge strategy for SQLite is noted as "not that difficult with uuid ids" — out of scope for this ticket but worth noting.

## Acceptance

- [ ] Schema defined: `repos`, `sessions`, `turns`, `activities` tables with UUID PKs
- [ ] `activity_idx` sequential per session (for replay)
- [ ] Migration runner (simple sequential SQL files or inline, no heavy ORM)
- [ ] DAL module: typed functions for create/get on each entity
- [ ] DAL is the only code that touches the DB (no raw SQL outside it)
- [ ] DB path configurable via env (default `data/alf.db`)
- [ ] `data/alf.db` added to `.gitignore`

## Notes

<!-- 2026-04-15T00:00Z agent:alfred -->
RESOLVED: DB lives at `data/alf.db` in the alf repo, gitignored for now. Git merge strategy for SQLite (uuid PKs) is future work.
RESOLVED: `sessions` table has `repo_id` FK — sessions are scoped to a repo.
Q: Should `activity.content` be stored as raw text or JSON (for tool use structured data)?
