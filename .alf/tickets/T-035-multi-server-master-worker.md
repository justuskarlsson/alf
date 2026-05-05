---
id: T-035
title: "Multi-server support: master/worker architecture"
type: feature
status: future
priority: high
epic: infra
effort: XL
created: 2026-04-27
updated: 2026-05-05
---

Support multiple backend servers with a **master** that mirrors all traffic and owns the DB, while clients can target any server for agent execution.

## Context

### What exists today

The relay already supports multiple named servers (`serverName` at auth, `clientServerName` routing). But servers are fully independent — own DB, own subscribers, no cross-server awareness. Nanoclaw-dev is the same. Conversations fragment across servers.

### The problem

Can't see sessions from server A on server B. Can't offload agent turns to cluster nodes. No single source of truth.

## Architecture

### Core idea

**The relay gains a `/master` endpoint. Only one server can claim it.** Every message that flows through the relay — client→server requests, server→client deltas, subscriptions — **also gets forwarded to master**. Master passively receives a copy of all traffic.

Master is also a regular server (can run turns itself). The only special thing is: it stores everything. It's the single source of truth for all sessions across all servers.

Otherwise, the setup is similar to nanoclaw-dev: clients target a specific server, servers run independently.

### Terminology

| Term | Meaning |
|------|---------|
| **Server** | An alf backend process connected to relay. Can run agent turns. Identified by `serverName`. |
| **Node** | A physical/virtual machine. Multiple servers can run on the same node, or on different nodes sharing the same filesystem (NFS). |
| **Master** | A special server that receives copies of ALL relay traffic and owns the authoritative DB. Also a regular server — can run turns too. Only one master. |

The distinction between server and node matters for the cluster: multiple alf backend processes (servers) may run on different cluster nodes that share the same NFS filesystem (and therefore the same Claude Code session files).

### Relay changes

```
Relay endpoints:
  /client  — frontend apps (unchanged)
  /server  — backend servers (unchanged)
  /master  — single master server (new, only one allowed)

Message flow:
  Client → relay → target server     (existing behavior)
                 → master (copy)      (new: mirror to master)

  Server → relay → target client     (existing behavior)
                 → master (copy)      (new: mirror to master)
```

Master receives everything: prompts, deltas, subscriptions, connections/disconnections. It writes to DB without needing to run the turns itself.

### What master does with mirrored traffic

- **`agent/session/create`** — writes session to DB, tagged with `serverName` of the target server.
- **`agent/message`** — records the prompt as a new turn.
- **Stream deltas** (from servers) — appends activities to the turn in DB.
- **`agent/subscribe`/`agent/unsubscribe`** — tracks subscriptions (for its own UI clients, or for awareness).
- **`agent/sessions/list`** — returns ALL sessions across all servers, with a badge/field for which server ran them.
- **Read-only queries** (files/list, tickets, git) — master handles these for repos on its own filesystem; other servers handle theirs.

### What servers do (unchanged, mostly)

Servers are regular alf backends. They handle requests from clients that target them. They run agent turns, stream deltas. They don't need a DB (master handles persistence). They just need:
- The repo filesystem (local or NFS).
- The agent SDK (Claude Code, Codex).

### Cluster & shared NFS

Cluster nodes share NFS. This means:
- Claude Code SDK session files are accessible from any node → **no session affinity needed**. Any server on the cluster can resume a session.
- Repos are on shared filesystem → any server can access them.
- Multiple servers (processes) can run on different nodes but operate on the same repos.

### Session list & UI

Master's session list includes ALL sessions from all servers. Each session has a `server` field indicating which server ran it. UI shows a badge (e.g., "desktop", "gpu-1", "cluster-03"). When sending a new message to an existing session, the client should target the same server (or any server with filesystem access to the session files).

## Open questions

1. **Master also as default server?** If a client doesn't specify a `serverName`, does it go to master? Probably yes — master is the desktop, the default experience.

2. **Mirror granularity**: Does master need every single delta, or just final turn results? Every delta lets master do live streaming to its own UI clients. Final-only is simpler but means master can't show live progress for remote turns.

3. **Server registration/discovery**: Master should know about available servers. Relay already tracks this (`/health`). Should master get `server-connected`/`server-disconnected` events for ALL servers (not just "its" clients)?

4. **Server-scoped file access**: `files/list` for a repo on a cluster node — does master proxy this to the relevant server, or does the client talk to that server directly? Direct is simpler.

5. **Multiple servers per node**: Naming convention? `cluster-01a`, `cluster-01b`? Or `cluster-01` with concurrency > 1?

6. **Failure mid-turn**: Server dies while running a turn. Master sees the deltas stop. Should it mark the turn as failed after a timeout?

## Acceptance

- [ ] Relay: `/master` endpoint, only one connection allowed
- [ ] Relay: all client↔server messages mirrored to master
- [ ] Master: receives and persists sessions/turns/activities from all servers
- [ ] Master: `agent/sessions/list` returns sessions from all servers with `server` badge
- [ ] Servers: work without local DB (master handles persistence)
- [ ] UI: session list shows server badge
- [ ] Graceful: system works with just master (no other servers) — identical to current behavior
- [ ] Tested with at least two servers (master + one other)

## Files to change

### Relay — `relay/src/index.ts`

This is the single relay source file. Major changes:

1. **New `/master` endpoint** — new `upgradeWebSocket` handler analogous to `/server`. Accepts one connection only; rejects if a master is already connected. Auth flow identical to server (token + `role: "master"`).
2. **Master state** — new `let master: { ws: WSContext; authed: boolean } | null = null;` alongside the existing `servers` map. Master is NOT in the `servers` map — it's a separate singleton.
3. **Traffic mirroring** — in the client `onMessage` handler (line ~183), after forwarding `msg` to the target server, also forward a copy to `master.ws` (if connected and authed). In the server `onMessage` handler (line ~107), after routing the response to the target client, also forward a copy to `master.ws`. Both copies include the original `connectionId` plus a `fromServer` field (the server's `claimedName`) so master knows the source.
4. **Connection lifecycle events to master** — forward `client-connected`, `client-disconnected`, `server-connected`, `server-disconnected` events to master so it has full awareness of all connections.
5. **`/health` endpoint** — extend the response to include `master: boolean` (whether a master is connected) and list all server names.

### Backend — new file: `backend/src/core/role.ts`

Backend role configuration. Reads `SERVER_ROLE` env var (`"master"` or `"worker"`, default `"master"`). Exports:
- `isMaster(): boolean`
- `serverRole(): "master" | "worker"`

Used by `index.ts` to decide which relay endpoint to connect to (`/master` vs `/server`) and whether to initialize the DB.

### Backend — `backend/src/index.ts`

1. **Import role** — import `isMaster` from `./core/role.js`.
2. **Connect to correct endpoint** — change the WS URL from `${RELAY_URL}/server` to `${RELAY_URL}/master` when `isMaster()`. When worker, connect to `${RELAY_URL}/server`.
3. **Auth message** — when connecting as master, send `{ type: "auth", token, role: "master" }` instead of `{ type: "auth", token, serverName }`.
4. **Conditional DB init** — only call `initDb()` when `isMaster()`. Workers skip DB initialization entirely.
5. **Handle mirrored traffic (master only)** — master receives copies of all relay traffic. For messages with `fromServer` field, route them through a new `mirrorDispatch()` that writes to DB but does NOT reply (the original server already replied to the client). Key mirrored messages:
   - `agent/session/create` → write session to DB with `server` field
   - `agent/message` → create turn record
   - `agent/delta` (from server→client copies) → accumulate and persist activities
   - `agent/turn/done` → mark turn complete
   - `agent/sessions/list` → master handles this itself (returns ALL sessions across servers)

### Backend — `backend/src/core/dispatch.ts`

1. **Add `mirrorDispatch()`** — new exported function for handling mirrored messages. Unlike `dispatch()`, it does NOT send a reply back. It just processes the message for persistence. Reuses the handler registry but wraps the reply as a no-op.
2. **Optional: handler metadata** — handlers could be tagged as "mirror-safe" vs "mirror-skip" to control which mirrored messages get processed. For example, `agent/sessions/list` on master should use its own local logic (query all sessions), not mirror another server's response.

### Backend — `backend/src/core/db/index.ts`

1. **New `server` column on sessions table** — `dbSessions.create()` gains an optional `server?: string` parameter. Master sets this to the originating server's name when persisting sessions from mirrored traffic.
2. **`dbSessions.list()` changes** — currently filters by `repo_id`. Master's version returns sessions from all servers, each tagged with `server` name. Add optional `server` filter parameter.
3. **New `dbSessions.listAll(repoId)`** — returns sessions across all servers for a given repo, ordered by `updated_at DESC`. Each row includes the `server` field.

### Backend — new migration: `backend/src/core/db/migrations/003_server.sql`

```sql
ALTER TABLE sessions ADD COLUMN server TEXT DEFAULT '';
```

Also update the migration list in `db/index.ts` `runMigrations()` to include `"003_server.sql"`.

### Backend — `backend/src/modules/agents/index.ts`

1. **`agent/sessions/list` handler** — when `isMaster()`, query `dbSessions.listAll()` to return sessions from all servers. Include `server` field in each session object.
2. **`agent/session/create` handler** — when creating from mirrored traffic (master processing another server's create), store the `server` name.
3. **Worker mode** — when `!isMaster()`, agents module still works normally (handles requests for its own clients, runs turns). The difference is it has no DB — activities stream to clients directly, and master persists them from mirrored copies.

### Backend — `backend/src/core/agents/index.ts`

1. **Conditional DB writes** — wrap `dbRepos.upsert()`, `dbSessions.create()`, `dbTurns.create()`, `dbActivities.create()`, etc. in `if (isMaster())` guards. Workers run turns and stream deltas but don't write to DB.
2. **`initSession()` and `runTurn()`** — when `!isMaster()`, these should work in-memory only (no DB). The session ID can be generated locally; master will persist it from mirrored traffic.

### Shared types — `shared/types/index.ts`

1. **Add `server` field to `AgentSession`** — optional `server?: string` field. Existing code treats it as undefined (backward compatible).

### Frontend — `frontend/src/lib/relay.ts`

1. **`serverName` in auth** — currently the client auth message has no `serverName` field. Add support for passing `serverName` in the auth message so clients can target a specific server. Default: empty string (targets master/default server).
2. **`createRelayClient` config** — add optional `serverName?: string` to `RelayClientConfig`.

### Frontend — `frontend/src/core/RelayProvider.tsx`

1. **Pass `serverName` prop** — `RelayProvider` accepts optional `serverName` prop, forwarded to `createRelayClient`.

### Frontend — `frontend/src/App.tsx`

1. **`VITE_SERVER_NAME` env var** — read from `import.meta.env.VITE_SERVER_NAME` and pass to `RelayProvider`. Defaults to empty string (master).

### Frontend — `frontend/src/modules/agents/store.ts`

1. **Display `server` badge** — `AgentSession` now has `server` field. No store logic changes needed (just passes through from backend response).

### Frontend — `frontend/src/modules/agents/AgentsPanel.tsx`

1. **Server badge on `SessionRow`** — show a small badge/tag next to session title when `session.server` is non-empty (e.g., "gpu-1", "desktop"). This gives visibility into which server ran each session.

### Infra — env files

1. **`infra/.env.dev.example`** — add `SERVER_ROLE=master` and `SERVER_NAME=desktop` examples.
2. **`infra/.env.prod.example`** — add `SERVER_ROLE=master` and `SERVER_NAME=desktop` examples.
3. **`infra/.env.dev`** / **`infra/.env.prod`** — actual env files need the new vars when deploying.

### Infra — VPS nginx

1. **`infra/vps/install.sh`** — add nginx `location /master` block proxying to the relay, identical to the `/server` block. Without this, master connections through the VPS reverse proxy would fail.

### Infra — systemd

No new service files needed initially. The master is just the existing backend service with `SERVER_ROLE=master` in its env file. Additional worker backends would get their own service files (but that's a deployment concern, not a code change).

### Summary table

| Action | File |
|--------|------|
| Modify | `relay/src/index.ts` |
| Create | `backend/src/core/role.ts` |
| Modify | `backend/src/index.ts` |
| Modify | `backend/src/core/dispatch.ts` |
| Modify | `backend/src/core/db/index.ts` |
| Create | `backend/src/core/db/migrations/003_server.sql` |
| Modify | `backend/src/modules/agents/index.ts` |
| Modify | `backend/src/core/agents/index.ts` |
| Modify | `shared/types/index.ts` |
| Modify | `frontend/src/lib/relay.ts` |
| Modify | `frontend/src/core/RelayProvider.tsx` |
| Modify | `frontend/src/App.tsx` |
| Modify | `frontend/src/modules/agents/store.ts` |
| Modify | `frontend/src/modules/agents/AgentsPanel.tsx` |
| Modify | `infra/.env.dev.example` |
| Modify | `infra/.env.prod.example` |
| Modify | `infra/vps/install.sh` |

## Dependencies

### Depends on

- **T-037 (Production deployment)** — Status: **open**. T-035 assumes the relay is reachable from multiple backends (desktop + cluster). The split-topology deployment (relay on VPS, backend on desktop) from T-037 is a prerequisite — without it, remote backends can't connect to the relay. T-037 also establishes the VPS nginx config that T-035 extends with the `/master` endpoint.

### Blocks / related

- **T-036 (Cluster worker remote exec)** — Status: **open**. T-036 explores lightweight Python workers as an alternative to full backend servers on cluster nodes. The `/master` endpoint and traffic mirroring from T-035 are foundational — T-036's workers would either connect as lightweight servers (using T-035's multi-server plumbing) or connect directly to master. T-036 is a natural follow-up to T-035.
- **T-042 (Agent turn blocks other requests)** — Status: **open**. The single-WS-connection architecture means heavy delta traffic from one server could congest the relay pipe for other servers. T-042's event-loop blocking concern becomes more impactful with multiple servers funneling through one relay. Should be addressed before or alongside T-035.
- **T-029 (Codex agent implementation)** — Status: **open**. Independent but relevant — a second impl makes multi-server more useful (e.g., run Codex on a GPU node while Claude Code runs on desktop). No hard dependency in either direction.

### No dependency on

- T-040, T-041, T-043, T-044 — these are independent feature/bug tickets with no overlap.

## Notes

<!-- 2026-04-27T00:00Z agent:claude --> Initial research. Relay already supports named servers but 1:1 mapping, no cross-server awareness.
<!-- 2026-04-27T01:00Z agent:claude --> Revised per feedback: /master relay endpoint with traffic mirroring. Much simpler than orchestrator model — master passively receives copies of all traffic. Cluster uses shared NFS so no session affinity needed. Clarified server vs node terminology.
