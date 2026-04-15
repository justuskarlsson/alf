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

Integration tests should be able to run against a full alf-test stack (separate user service with its own ports and data directories), so individual features can be verified end-to-end: "can we branch?", "can we create a session?", "do we receive streamed messages?".

## Acceptance

- [ ] Vitest configured (per-package `vitest.config.ts` or shared root — TBD based on what fits the monorepo)
- [ ] Ability to run full suite OR individual tests in isolation
- [ ] DAL tests: create/read for all entity types, replay query correctness (in-memory SQLite)
- [ ] core/agents tests: turn writes correct activities, stream sink receives all deltas
- [ ] Integration test: send message with test impl → verify DB state → verify `agent/detail` response
- [ ] `alf-test` user service documented (own ports, own `data/alf-test.db`, test repos)
- [ ] All tests use test impl (T-003), no real LLM calls

## Notes

<!-- 2026-04-15T00:00Z agent:alfred -->
RESOLVED: Vitest (fits TS/Vite stack, good monorepo support, fast isolation).
RESOLVED: `alf-test` service stack for integration tests — separate ports and data dir from dev stack.
RESOLVED: All tests use the test impl — no LLM calls, no cost, deterministic.
