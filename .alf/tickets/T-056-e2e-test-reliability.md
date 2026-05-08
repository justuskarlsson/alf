---
id: T-056
title: E2E test reliability and speed
type: chore
status: open
priority: high
epic: infra
effort: L
created: 2026-05-08
updated: 2026-05-08
---

E2E tests are slow and flaky. Several systemic issues need addressing.

## Context

### Slow runs
The full suite (29 tests + 2 skipped) takes ~60s. For fast iteration this is too slow. Consider:
- Parallel workers (currently serial due to shared test backend state)
- Faster page load (preconnect, avoid full re-navigation per test)
- Grouping tests that share setup

### Flaky files tests
All 5 files panel tests fail intermittently with `role="tree"` resolved but `hidden`. The tree element exists in DOM but Playwright sees it as hidden. Possible causes:
- react-arborist renders with zero height initially until layout settles
- Panel container may have `overflow: hidden` clipping the tree before resize observer fires
- The `ResizeObserver` on the dashboard container might not fire fast enough for the test viewport

### Backend restart between runs
Running the full suite twice without restarting `alf-test-backend.service` causes all tests to fail. The test backend wipes the DB on startup, but between runs the DB state is dirty from the first run's test mutations. Either:
- Add a `POST /reset` endpoint that re-wipes the DB between runs
- Use per-test DB isolation (e.g. SAVEPOINT/ROLLBACK)
- Have each spec file call a reset handler in `beforeAll`

### Agent test flakiness
The "full turn" agent test occasionally times out waiting for activity persistence after turn completion.

## Acceptance

- [ ] Full suite runs in under 30s
- [ ] Files panel tests pass reliably (no hidden tree flake)
- [ ] Tests can run multiple times without manual backend restart
- [ ] No intermittent agent test failures

## Notes
