---
id: T-009
title: Isolated test stack (test-backend + test-frontend)
type: chore
status: done
priority: high
epic: infra
effort: M
created: 2026-04-21
updated: 2026-04-21
---

E2E tests and unit tests currently hit the dev DB and dev relay, causing "New Session" rows to accumulate in the live DB and risking cross-contamination. We need a parallel test stack that is completely isolated from dev.

## Context

Two problems identified:

1. **Playwright targets dev frontend** — `playwright.config.ts` defaults to `http://localhost:5000` (dev frontend). E2E tests hit the live dev relay/backend and accumulate real rows ("New Session", etc.) in `data/alf.db`.
2. **LocalStorage bleed** — `tests/e2e/helpers.ts` pre-seeds `alf-dashboard` into localStorage; hitting the dev URL leaks test state into the dev browser.

Note: Unit tests (vitest) that call `createSession` etc. are fine and *should* write real rows — the only thing that matters is *which* backend they're talking to.

### Proposed approach

New `alf-test.target` systemd user target — parallel to `alf-dev.target` — with:

- **test-relay**: same relay service, different port (e.g. 4010).
- **test-backend**: same code, `RELAY_URL=ws://localhost:4010`, `DATA_DIR=data/test` (own `alf-test.db`). DB is wiped+reinitialised at service start (add a `--reset-db` flag or just delete on startup when `NODE_ENV=test`).
- **test-frontend**: Vite on a different port (e.g. 5010) with `VITE_RELAY_URL` pointing at test relay port.
- **Playwright**: `baseURL` = test-frontend URL via `TEST_FRONTEND_URL` env var (default `http://localhost:5010`).

Services defined in `infra/systemd/` mirroring the dev service files. A single `infra/scripts/install-test.sh` writes env vars to `~/.config/environment.d/alf-test.conf`. Scripts can share logic with `install-dev.sh` (extract a common helper).

## Acceptance

- [ ] `alf-test.target` systemd unit with test-relay, test-backend, test-frontend services
- [ ] test-backend resets `data/test/alf-test.db` on start
- [ ] `playwright.config.ts` uses `TEST_FRONTEND_URL` env (default `http://localhost:5010`)
- [ ] Running full E2E suite leaves `data/alf.db` unchanged
- [ ] `infra/scripts/install-test.sh` writes `alf-test.conf` env file
- [ ] Documented in `INDEX.md`

## Notes

<!-- 2026-04-21T00:00Z user --> Raised after noticing "New Session" rows accumulating in dev DB during test runs. Also flagged that Playwright localStorage pre-seeding could leak into dev frontend.
