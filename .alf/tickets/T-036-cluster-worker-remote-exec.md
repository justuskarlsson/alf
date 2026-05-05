---
id: T-036
title: "Lightweight cluster workers with remote exec"
type: research
status: future
priority: medium
epic: infra
effort: L
created: 2026-04-29
updated: 2026-05-05
---

Lightweight Python worker processes on cluster nodes that provide remote code execution, as an alternative to running full alf backend servers on every node.

## Context

T-035 describes full multi-server architecture where each cluster node runs a complete alf backend. This ticket explores a lighter-weight approach: cluster nodes run small Python worker processes that can execute code on behalf of the master.

### The idea

A cluster node runs a simple Python program that:
1. Imports an `alf-worker` pip library
2. Connects to the relay (or directly to master)
3. Accepts execution requests, runs them locally, returns results

This gives agents access to cluster hardware (GPUs, large memory) without deploying a full backend on every node.

### Two possible approaches

#### A) Worker runs Claude Code sessions locally

The Python worker runs the Claude Code agent in an exec loop on the cluster node. Deltas flow back through the relay to master/client. The worker is essentially a minimal agent runner — no DB, no module system, just the exec loop + relay connection.

- **Pro**: Agent runs where the compute is. Tool calls (code execution, GPU access) happen locally with no network hop.
- **Pro**: Session files on shared NFS mean any worker can resume any session.
- **Con**: Needs Claude Code SDK installed on every worker node.
- **Con**: Closer to a full server — less "lightweight".

#### B) Master runs Claude Code, worker is a remote-exec tool

The Claude Code session runs on master (desktop). The agent has a special tool (e.g., `remote_exec`) that sends a request to a specific cluster node worker, which executes the code and returns stdout/stderr/exit code. The worker is just a thin execution layer.

- **Pro**: Truly lightweight — worker is just a Python process that runs commands.
- **Pro**: No Claude Code SDK needed on worker nodes.
- **Pro**: Master stays in control of the session; worker is just a tool.
- **Con**: Every tool execution has a network round-trip.
- **Con**: Large file I/O still goes through NFS, but execution output must travel over the network.

#### Hybrid

Could support both: workers register capabilities (e.g., `gpu`, `exec`, `agent`). A `gpu`-only worker just runs code. An `agent`-capable worker can run full Claude Code sessions.

### `alf-worker` pip library

Minimal Python package that handles:
- Relay/master connection (WebSocket)
- Worker registration (name, capabilities, node info)
- Request/response protocol for exec requests
- Stdout/stderr streaming back to caller
- Heartbeat / health reporting

### Example worker script

```python
from alf_worker import Worker

worker = Worker(
    relay_url="wss://relay.example.com",
    name="gpu-1",
    capabilities=["exec", "gpu"],
    token="..."
)

@worker.on_exec
def run(cmd: str, cwd: str) -> ExecResult:
    # Default handler: subprocess exec
    return worker.default_exec(cmd, cwd)

worker.run()  # blocks, listens for requests
```

## Open questions

1. **Relay endpoint or direct?** Does the worker connect to relay (new `/worker` endpoint?) or directly to master? Relay is more consistent but adds a hop.

2. **Streaming**: Should exec output stream back in real-time (like agent deltas) or batch on completion? Streaming is better UX for long-running GPU jobs.

3. **Security**: Workers execute arbitrary commands. Auth token is baseline, but should there be command allowlists or sandboxing?

4. **Worker discovery**: How does master/agent know which workers are available and what they can do? Registry in relay? Heartbeat-based?

5. **Relationship to T-035**: Is this a subset of T-035 (workers are just "lite servers") or a separate system? Could workers eventually upgrade to full servers?

6. **Python vs TypeScript**: Worker in Python (closer to ML/GPU ecosystem, pip installable) or TypeScript (same stack as backend)? Python seems more natural for cluster/GPU nodes.

## Acceptance

- [ ] Design decision: approach A vs B vs hybrid
- [ ] `alf-worker` package spec (protocol, auth, capabilities)
- [ ] Worker ↔ relay/master connection protocol defined
- [ ] Remote exec request/response message format
- [ ] Prototype: single worker executing commands from master
- [ ] Stdout/stderr streaming back to client
- [ ] Worker registration and discovery in master UI

## Files to change

### Relay — new `/worker` endpoint + worker routing

- **`relay/src/index.ts`** — Add a `/worker` WebSocket endpoint alongside `/client` and `/server`. Workers authenticate with the same `RELAY_TOKEN` but provide `workerName` and `capabilities` at auth time. Relay maintains a `workers: Map<string, WorkerEntry>` (ws, name, capabilities, authed status). Add routing: when a server sends a message with `targetWorker`, relay forwards to that worker's socket (and vice versa for responses). Broadcast `worker-connected` / `worker-disconnected` lifecycle events to all authenticated servers. Expose worker list in the existing `/health` endpoint.

### Backend — worker registry + remote_exec handler

- **`backend/src/core/workers/types.ts`** *(new)* — Define `WorkerInfo` (name, capabilities, status, connectedAt), `ExecRequest` (command, cwd, env, timeout), `ExecResponse` (exitCode, stdout, stderr, durationMs), and `ExecDelta` (streamType: stdout|stderr, chunk) types.
- **`backend/src/core/workers/index.ts`** *(new)* — In-memory worker registry. Tracks connected workers (name, capabilities, online status) based on `worker-connected` / `worker-disconnected` relay events. Provides `getWorker(name)`, `listWorkers()`, `findByCapability(cap)`.
- **`backend/src/modules/workers/index.ts`** *(new)* — WS handlers: `worker/list` (returns available workers + capabilities), `worker/exec` (sends exec request to a named worker via relay, streams stdout/stderr deltas back to caller, returns final ExecResponse). Uses `@handle` decorator. Subscribes to worker lifecycle events from relay. Side-effect import in `backend/src/index.ts`.
- **`backend/src/index.ts`** — Add `import "./modules/workers/index.js"` side-effect import. Handle `worker-connected` and `worker-disconnected` relay system messages (currently filtered out in the `socket.on("message")` handler, like `client-connected` is now).

### Worker — Python package (new top-level directory)

- **`worker/`** *(new directory)* — Top-level Python package alongside `relay/`, `backend/`, `frontend/`.
- **`worker/pyproject.toml`** *(new)* — Package config for `alf-worker`. Dependencies: `websockets` (WS client). Entry point for optional CLI: `alf-worker`.
- **`worker/alf_worker/__init__.py`** *(new)* — Exports `Worker` class.
- **`worker/alf_worker/worker.py`** *(new)* — `Worker` class. Constructor takes `relay_url`, `name`, `capabilities`, `token`. Connects to relay at `/worker` endpoint, sends auth (`type: "auth", token, workerName, capabilities`). Listens for `exec` requests. Default exec handler: `subprocess.Popen` with stdout/stderr streaming. Sends `exec/delta` (streaming) and `exec/result` (final) messages back through relay. Heartbeat loop (ping/pong). Reconnect with exponential backoff (mirrors backend pattern).
- **`worker/alf_worker/protocol.py`** *(new)* — Message type constants and serialization helpers shared between worker internals.
- **`worker/example.py`** *(new)* — Minimal example script (the one from the ticket description).

### Shared types

- **`shared/types/index.ts`** — Add `WorkerInfo`, `ExecRequest`, `ExecResponse` interfaces. Add WS message shapes: `WorkerListMsg`, `WorkerExecMsg`.

### Frontend — worker list panel

- **`frontend/src/modules/workers/store.ts`** *(new)* — Zustand store: `workers: WorkerInfo[]`, `loadWorkers(request)`, subscribe to push events for worker connect/disconnect. Follows existing module store pattern (actions take `request`, no request stored in state).
- **`frontend/src/modules/workers/WorkersPanel.tsx`** *(new)* — Panel component showing connected workers with name, capabilities, status. Register in `PANEL_TYPES` in `dashboardStore.ts`. Allows sending a test exec command to a selected worker.
- **`frontend/src/core/dashboardStore.ts`** — Add `"workers"` to `PANEL_TYPES` registry.

### Infrastructure

- **`infra/systemd/alf-dev-worker@.service`** *(new, optional)* — Templated systemd unit for running worker instances (e.g., `alf-dev-worker@gpu-1.service`). `ExecStart` runs the Python worker script with env file. Lower priority — workers on cluster nodes will typically be managed outside systemd.

## Dependencies

- **Depends on: T-035 (Multi-server master/worker architecture)** — T-035 defines the relay's multi-server routing model (named servers, master endpoint, traffic mirroring). The `/worker` relay endpoint in this ticket must integrate with that design. Specifically: master should receive copies of worker traffic (for discovery/logging), and the worker registry must coexist with the server registry. However, approach B (master runs Claude Code, worker is just remote-exec) can be prototyped before T-035 is fully implemented — the relay changes for `/worker` are additive and don't conflict.
- **Blocks: T-037 (Prod deployment)** — partially. Worker deployment on cluster nodes extends the prod topology (relay on VPS, backend on desktop, workers on cluster). T-037's VPS setup is independent, but the full cluster story requires this ticket's protocol to be defined.
- **Related: T-029 (Codex agent implementation)** — If approach A (worker runs Claude Code sessions) is chosen, workers would need the same impl adapter pattern used by T-029. Approach B avoids this dependency entirely.
- **Related: T-042 (Agent turn blocks other requests)** — Remote exec on workers could help mitigate this by offloading heavy compute to separate processes/nodes, reducing event loop pressure on the main backend.

## Notes

<!-- 2026-04-29T00:00Z agent:claude --> Created from discussion on T-035. Core insight: full backend servers on every cluster node is heavy — a lightweight Python worker that just executes commands gives agents access to cluster compute with minimal deployment overhead.
