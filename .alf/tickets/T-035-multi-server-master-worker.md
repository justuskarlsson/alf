---
id: T-035
title: "Multi-server support: master/worker architecture"
type: feature
status: open
priority: high
epic: infra
effort: XL
created: 2026-04-27
updated: 2026-04-27
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

## Notes

<!-- 2026-04-27T00:00Z agent:claude --> Initial research. Relay already supports named servers but 1:1 mapping, no cross-server awareness.
<!-- 2026-04-27T01:00Z agent:claude --> Revised per feedback: /master relay endpoint with traffic mirroring. Much simpler than orchestrator model — master passively receives copies of all traffic. Cluster uses shared NFS so no session affinity needed. Clarified server vs node terminology.
