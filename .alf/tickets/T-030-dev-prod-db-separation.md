---
id: T-030
title: "Dev/prod DB separation + install-prod.sh"
type: chore
status: done
priority: medium
epic: mvp4
effort: S
created: 2026-04-23
updated: 2026-04-23
---

Separate dev and prod databases. Add prod systemd services.

## Context

Ref: T-018 §7. Currently `data/alf.db` serves both dev and prod.

### Plan

- `data/dev/alf.db` — dev stack
- `data/prod/alf.db` — prod stack
- Controlled by `DB_PATH` env var (already supported in code)
- Update `install-dev.sh` to set `DB_PATH=data/dev/alf.db`
- Create `install-prod.sh`:
  - Prod systemd services (separate ports from dev)
  - Sets `DB_PATH=data/prod/alf.db`
  - Prod relay, backend, frontend under `alf-prod.target`

## Acceptance

- [x] `data/dev/` and `data/prod/` directories (gitignored, with `.gitkeep`)
- [x] `install-dev.sh` sets `DB_PATH` to dev path
- [x] `install-prod.sh` creates prod systemd services with prod DB path and ports
- [x] Dev and prod can run simultaneously without conflicts

## Notes

- 2026-04-23: Implemented. Moved DB from `data/alf.db` to `data/dev/alf.db`. Updated DEFAULT_DB_PATH. `.gitignore` patterns for `data/dev/` and `data/prod/`. Created `.gitkeep` files. Added `DB_PATH` to `.env.dev.example`. Created prod infra: `.env.prod.example` (ports 5100-5102), systemd services (`alf-prod-relay`, `alf-prod-backend`, `alf-prod-frontend`), `alf-prod.target`, `install-prod.sh`.
