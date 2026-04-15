---
id: T-008
title: Backend test suite — unit and integration tests
type: task
status: open
priority: medium
epic: agents
effort: M
created: 2026-04-15
updated: 2026-04-15
---

Set up a backend test suite (vitest) and write meaningful tests covering the DAL, core/agents, and the full pipeline using the test impl.

## Context

From INDEX.md:
> Test-suite, make use of tests (primarily backend, maybe also front-end but less easy wins).

This is a major focus of MVP3, not a nice-to-have. The test impl (T-003) exists specifically to make this easy — no mocking of LLM APIs needed.

Layers to test:

1. **DAL** (T-001): CRUD on each entity, `activity_idx` sequencing, replay query
2. **core/agents** (T-002): `runTurn` writes correct DB rows, stream sink called with correct deltas
3. **Integration** (T-002 + T-003 + T-004/T-005): full `agent/message` → DB → `agent/detail` round-trip using test impl

The test DB should use an in-memory SQLite instance (`:memory:`) so tests are fast and isolated.

## Acceptance

- [ ] Vitest configured in `backend/` (or monorepo root if shared)
- [ ] DAL tests: create/read for all entity types, replay query correctness
- [ ] core/agents tests: turn writes correct activities, stream sink receives all deltas
- [ ] Integration test: send message with test impl → verify DB state → verify detail response
- [ ] Tests run in CI (or at minimum `npm test` works cleanly)
- [ ] In-memory SQLite for test isolation (no real file written)

## Notes

<!-- 2026-04-15T00:00Z agent:alfred -->
Q: Use vitest or jest? Lean vitest given the Vite/TS stack.
Q: Monorepo test setup: separate `vitest.config.ts` per package or shared root config?
