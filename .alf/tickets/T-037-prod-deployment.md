---
id: T-037
title: Production deployment — relay & frontend on VPS, backend on desktop
type: task
status: open
priority: high
epic: infra
effort: M
created: 2026-04-29
updated: 2026-04-29
---

Get a working production deployment with split topology: relay + frontend on VPS (public internet), backend on desktop (local network / WireGuard).

## Context

Currently all three services (relay, backend, frontend) run on the same machine via systemd user services. For production, the relay and frontend need to be publicly accessible on a VPS, while the backend stays on the desktop (where repos and Claude Code SDK live).

The existing `infra/.env.prod.example` and `install-prod.sh` assume localhost. Need to update for split deployment.

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

## Notes
