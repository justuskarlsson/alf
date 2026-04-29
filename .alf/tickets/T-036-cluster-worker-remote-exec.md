---
id: T-036
title: "Lightweight cluster workers with remote exec"
type: research
status: open
priority: medium
epic: infra
effort: L
created: 2026-04-29
updated: 2026-04-29
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

## Notes

<!-- 2026-04-29T00:00Z agent:claude --> Created from discussion on T-035. Core insight: full backend servers on every cluster node is heavy — a lightweight Python worker that just executes commands gives agents access to cluster compute with minimal deployment overhead.
