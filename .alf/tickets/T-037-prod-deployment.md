---
id: T-037
title: Production deployment — relay & frontend on VPS, backend on desktop
type: task
status: done
priority: high
epic: infra
effort: M
created: 2026-04-29
updated: 2026-05-05
---

Get a working production deployment with split topology: relay + frontend on VPS (public internet), backend on desktop (local network / WireGuard).

## Context

Currently all three services (relay, backend, frontend) run on the same machine via systemd user services. For production, the relay and frontend need to be publicly accessible on a VPS, while the backend stays on the desktop (where repos and Claude Code SDK live).

The existing `infra/.env.prod.example` and `install-prod.sh` assume single-machine localhost deployment. Need to update for split topology. However, significant VPS infrastructure already exists in `infra/vps/` (install.sh, restart scripts) — the main remaining work is on the desktop side and tying everything together.

## Architecture

```
VPS (public)                          Desktop (local)
┌─────────────────────┐               ┌─────────────────────┐
│  Frontend (Vite)    │               │  Backend (tsx)       │
│  :5100              │               │  connects to relay   │
│                     │               │  via WS              │
│  Relay (Hono WS)    │◄──────WS─────│                      │
│  :5101              │               │  Repos, Claude Code  │
│                     │               │  SQLite DB           │
└─────────────────────┘               └─────────────────────┘
        ▲
        │ wss://
        │
    Browser clients
```

## TODO

### VPS setup
- [ ] Provision VPS (or use existing one)
- [ ] Clone repo on VPS (only relay + frontend + infra needed)
- [ ] Install Node.js on VPS
- [ ] `pnpm install` in `relay/` and `frontend/`
- [ ] Create `infra/.env.prod` on VPS:
  - `RELAY_PORT=5101`
  - `RELAY_TOKEN=<strong-random-token>`
  - `FRONTEND_PORT=5100`
  - `VITE_RELAY_URL=wss://<vps-domain>/client` (public WSS URL)
  - `VITE_RELAY_TOKEN=<same-token>`
- [ ] Set up reverse proxy (Caddy or nginx) for TLS:
  - `https://<domain>` → `localhost:5100` (frontend)
  - `wss://<domain>/ws` → `localhost:5101` (relay) — or separate subdomain
- [ ] Install systemd services: only `alf-prod-relay` and `alf-prod-frontend` on VPS
- [ ] Build frontend for production: `vite build` (currently runs dev server)

### Desktop setup
- [ ] Create `infra/.env.prod` on desktop:
  - `RELAY_URL=wss://<vps-domain>/ws` (public relay URL)
  - `RELAY_TOKEN=<same-token>`
  - `REPOS_ROOT=/home/juska/repos`
  - `DB_PATH=/home/juska/repos/alf/data/prod/alf.db`
  - `DEFAULT_IMPL=claude-code`
- [ ] Install systemd service: only `alf-prod-backend` on desktop
- [ ] Ensure backend can reach VPS relay (firewall, DNS)

### Relay changes needed
- [ ] Verify relay works with backend connecting from external IP (not just localhost)
- [ ] Ensure relay `/health` endpoint is accessible for monitoring
- [ ] Consider: should relay bind to `0.0.0.0` vs `127.0.0.1`? (behind reverse proxy → localhost is fine)

### Frontend build
- [ ] Currently frontend runs as Vite dev server — for prod, need `vite build` + static file serving
- [ ] Options: serve built files via Caddy directly, or keep a minimal Node server
- [ ] Env vars (`VITE_*`) must be baked in at build time

### Security
- [ ] Strong relay token (not the example one)
- [ ] TLS on all public endpoints (Caddy auto-HTTPS)
- [ ] No backend ports exposed to internet
- [ ] Consider: IP allowlist on relay for backend connection?

## Acceptance

- [ ] Frontend accessible at `https://<domain>`
- [ ] Backend connects to relay from desktop, can run agent turns
- [ ] Agent sessions work end-to-end: create, send message, stream deltas
- [ ] File uploads work (backend saves to desktop filesystem)
- [ ] Voice transcription works
- [ ] System survives relay restart (backend reconnects)

## Research Findings

### What already exists
- **`infra/vps/install.sh`** — Full VPS provisioning script (nginx + certbot + systemd alf-relay service + frontend build). Already handles TLS, SPA fallback, WS proxying for `/client` and `/server`, static frontend serving from `frontend/dist`.
- **`infra/vps/restart-relay.sh`** and **`infra/vps/restart-frontend.sh`** — Deployment scripts (git pull, pnpm install, restart/rebuild).
- **`infra/vps/.env`** — Written by install.sh on VPS (contains `RELAY_PORT` and `RELAY_TOKEN`). Gitignored via `.env*` pattern.
- **`infra/.env.prod`** — Desktop-side env file. Already has `RELAY_URL=wss://alf.randomgrejer.se`, `DB_PATH`, `DEFAULT_IMPL=claude-code`. Contains real API keys (gitignored).
- **`infra/.env.prod.example`** — Exists but is desktop-only (has `RELAY_URL`, `RELAY_TOKEN`, `REPOS_ROOT`, `DB_PATH`, `DEFAULT_IMPL`). Missing `CLAUDE_CODE_OAUTH_TOKEN` and `OPENAI_API_KEY` placeholders.
- **Prod systemd services** — All three exist (`alf-prod-relay.service`, `alf-prod-backend.service`, `alf-prod-frontend.service`), but **only backend is needed on desktop**. The target (`alf-prod.target`) currently only `Wants=alf-prod-backend.service`, which is correct for desktop.
- **`infra/scripts/install-prod.sh`** — Copies all prod systemd units + target to `~/.config/systemd/user/`. Works for desktop (backend-only).

### Relay binding
- Relay uses `@hono/node-server`'s `serve({ port: PORT })` which defaults to `0.0.0.0`. This is fine — on VPS it's behind nginx, which proxies to `localhost:RELAY_PORT`.
- Auth is token-based: both client and server must send `{ type: "auth", token: "..." }` within 5 seconds.
- `/health` endpoint already exists and returns JSON with client count and server status.

### Frontend relay URL derivation
- `App.tsx` line 10-11: `const relayUrl = import.meta.env.VITE_RELAY_URL || wss://${location.host}/client` — when built without `VITE_RELAY_URL`, it auto-derives from the page URL. This means `pnpm build` on VPS needs NO relay URL env var at all (nginx proxies `/client` to relay).
- `TokenGate` component prompts for token if no `VITE_RELAY_TOKEN` env var — stores in localStorage. Good for prod (don't bake token into build).

### Backend reconnection
- Backend already has exponential backoff reconnect (1s to 30s) and WS-level ping/pong keepalive (30s interval, 10s pong timeout). Handles relay restarts gracefully.

### Issues found
1. **`.env.prod.example` is incomplete** — missing `CLAUDE_CODE_OAUTH_TOKEN` and `OPENAI_API_KEY` placeholders that the backend needs.
2. **Prod systemd services reference `%h/repos/alf/`** — hardcoded path. Fine if desktop always uses this path, but VPS install.sh already creates its own systemd unit with resolved absolute paths.
3. **Frontend prod service (`alf-prod-frontend.service`) runs Vite dev server** — this is a desktop-side unit and shouldn't be needed (VPS uses nginx for static files). Could be removed or left inert.
4. **Relay prod service (`alf-prod-relay.service`) is a desktop-side unit** — not needed on desktop (relay runs on VPS via `alf-relay.service` system unit created by `infra/vps/install.sh`). Could be removed or left inert.
5. **`BACKEND_PORT` in `.env.prod`** — set to 5023 but backend code never reads it (backend connects outbound to relay, doesn't listen on a port). This is harmless but confusing.

## Files to change

### Modify existing files

| File | Change |
|------|--------|
| `infra/.env.prod.example` | Update to show desktop-only vars. Add `CLAUDE_CODE_OAUTH_TOKEN=CHANGE_ME` and `OPENAI_API_KEY=CHANGE_ME` placeholders. Remove `BACKEND_PORT` (unused). Add comments explaining this is the desktop env file. |
| `infra/scripts/install-prod.sh` | Update to only install `alf-prod-backend.service` and `alf-prod.target` (skip relay and frontend units that are VPS-only). Add a note that VPS setup uses `infra/vps/install.sh` instead. |
| `infra/systemd/alf-prod.target` | Already correct (`Wants=alf-prod-backend.service` only). No change needed. |
| `infra/systemd/alf-prod-backend.service` | Remove `BACKEND_PORT` usage if any. Currently fine — just uses `EnvironmentFile` and connects outbound. No change needed unless we want to add `Wants=network-online.target`. |
| `infra/vps/install.sh` | Minor: add `VITE_RELAY_TOKEN` handling (currently frontend uses TokenGate for manual entry, which is fine, but could optionally bake it in). Review certbot email (`admin@$DOMAIN`). |

### Potentially remove (or leave as-is)

| File | Rationale |
|------|-----------|
| `infra/systemd/alf-prod-relay.service` | Only used if running relay locally. VPS uses system-level `alf-relay.service` created by `infra/vps/install.sh`. Could keep for local-only testing. |
| `infra/systemd/alf-prod-frontend.service` | Only used if running frontend locally as Vite dev server. VPS uses nginx + static build. Could keep for local-only testing. |

### May need to create

| File | Purpose |
|------|---------|
| `infra/vps/.env.example` | Document what VPS env vars look like (`RELAY_PORT`, `RELAY_TOKEN`). Currently `infra/vps/.env` is created by install.sh but there's no example checked in. |

### No changes needed

| File | Why |
|------|-----|
| `relay/src/index.ts` | Already binds 0.0.0.0, has /health endpoint, token auth works across networks. |
| `frontend/src/App.tsx` | Auto-derives `wss://` relay URL from page origin when `VITE_RELAY_URL` not set. TokenGate handles missing token. |
| `frontend/vite.config.ts` | `pnpm build` works as-is. |
| `backend/src/index.ts` | Already reads `RELAY_URL` from env, reconnects with backoff. |
| `frontend/src/lib/relay.ts` | Auto-reconnect with backoff already implemented. |
| `frontend/src/core/RelayProvider.tsx` | No changes needed. |

## Dependencies

### Depends on (prerequisites)
- **T-030** (Dev/prod DB separation) — **Done**. Created the prod infra foundation this ticket builds on.

### Does NOT depend on
- **T-035** (Multi-server master/worker) — Independent. T-037 is single-backend, T-035 adds multi-backend support later.
- **T-036** (Cluster workers) — Independent. Cluster workers are an extension, not a prerequisite for basic prod deployment.

### Blocks (other tickets that need this first)
- None directly, but T-035 (multi-server) will likely build on the prod deployment topology established here.

## Notes
