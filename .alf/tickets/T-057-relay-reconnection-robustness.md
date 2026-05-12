---
id: T-057
title: Relay reconnection robustness
type: bug
status: open
priority: high
epic: infra
effort: M
created: 2026-05-08
updated: 2026-05-08
---

WebSocket connections drop intermittently, causing panel re-initialization and state loss. The main HMR-related cause has been fixed (switched dev/prod frontend from Vite dev server to static build), but occasional relay-level disconnections still occur.

## Context

### What was fixed
- Dev/prod/test frontend services now use `vite build + vite preview` (static serving) instead of `vite` dev server. This eliminates HMR-triggered component re-mounts that cascade into WebSocket reconnection loops.
- Panel init callbacks no longer eagerly clear state on reconnect (tickets store, agents store).
- `server-connected` relay event now triggers panel re-init (handles backend restart gracefully).

### What remains
- Occasional real WebSocket drops still happen in prod (no Vite involved). Could be:
  - Reverse proxy (nginx/caddy) idle timeout killing long-lived WebSocket connections
  - OS-level TCP keepalive not configured for WSS
  - Relay has no server-side ping/pong — only client pings every 30s
- Relay error responses for "Server not connected" don't include `requestId`, so pending requests time out (10s) instead of failing fast
- The `server-disconnected` event is received but not surfaced to the user — could show a toast/banner

### Potential fixes
- Add server-side ping/pong in relay (detect dead connections early)
- Include `requestId` in relay-generated error responses
- Add connection health indicator to frontend UI
- Configure reverse proxy WebSocket timeouts (if applicable)

## Acceptance

- [ ] No spurious disconnections on dev (static build eliminates HMR issue)
- [ ] Prod connections survive idle periods (ping/pong both directions)
- [ ] Relay error responses include requestId for fast failure
- [ ] Frontend shows connection status indicator when backend is unreachable

## Notes
