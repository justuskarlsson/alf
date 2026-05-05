---
id: T-043
title: "Notebook panel — distributed REPL with agent via pip library"
type: feature
status: open
priority: high
epic: notebook
effort: XL
created: 2026-04-30
updated: 2026-05-05
---

A new panel type: interactive notebook (like Jupyter) where the execution environment lives on a **remote machine** running a pip-installable Python library (`alf-notebook`). The library connects to the relay as a client, receives code to execute, and sends results back. The backend orchestrates the agent loop and fans out to both the notebook machine and the frontend.

Inspired by `~/repos/sat-ai/satai/agent/core.py` — same exec-loop pattern, but distributed via the relay instead of local process + OpenRouter.

## Core concept

The **agent writes markdown**. All Python code within ` ```python ` fences in the agent's **final message** (not thinking, not tool calls) gets extracted and executed on the remote machine. The rest of the markdown is rendered as-is in the notebook panel. The agent knows this convention and uses it to explore data, train models, etc.

The agent does NOT use tool calls. It just writes Python code to discover information and perform work on the remote machine.

## Architecture

```
┌─────────────┐         ┌───────────┐         ┌──────────────────┐
│  Frontend   │◄───────►│   Relay   │◄───────►│     Backend      │
│  (notebook  │  WS     │           │  WS     │  (orchestrator)  │
│   panel)    │         │           │         │                  │
└─────────────┘         │           │         └──────────────────┘
                        │           │                   ▲
                        │           │                   │ LLM API
                        │           │                   ▼
                        │           │         ┌──────────────────┐
┌─────────────┐         │           │         │   LLM (Claude,   │
│  Remote     │◄───────►│           │         │   Qwen, etc.)    │
│  Python     │  WS     │           │         └──────────────────┘
│  Machine    │         └───────────┘
│  (alf-notebook)│
└─────────────┘
```

### Flow (one agent turn)

1. User sends prompt via frontend → relay → backend
2. Backend calls LLM with context (previous cells + workspace state + user prompt)
3. LLM responds with markdown (reasoning text + ` ```python ` code blocks)
4. Backend extracts code blocks from the **final message only**
5. Backend fans out to **both**:
   - **Frontend**: "here's what we're about to execute" (the full markdown + code)
   - **Notebook machine**: "execute this code" (just the extracted code)
6. Notebook machine executes via `exec()` in persistent workspace, sends results back through relay
7. Backend receives results, fans out to **both**:
   - **Frontend**: renders output (text, images, errors) below the code cell
   - **LLM context**: feeds back as next user message (like sat-ai's feedback loop)
8. Loop continues until agent calls `done()` or max turns reached

### The pip library: `alf-notebook`

Installed on the remote machine. Usage is minimal:

```python
# On the remote machine — this is ALL the user code needed
from alf_notebook import connect

connect(
    relay_url="wss://relay.example.com/server",
    token="...",
    # optional: pre-loaded workspace variables
    workspace={"torch": torch, "np": np}
)
# That's it — the library handles the REPL loop
```

Under the hood, the library (heavily inspired by sat-ai `core.py`):
- Connects to relay as a WebSocket client (like the backend does)
- Maintains a persistent `workspace` dict (the exec context)
- Listens for `notebook/execute` messages from backend (via relay)
- On receive: `exec(code, workspace)` with stdout/stderr/image capture
- Sends results back: `notebook/result` message through relay
- Provides helper functions injected into workspace:
  - `print_image(img)` — matplotlib Figure, PIL Image, numpy, torch Tensor → base64 PNG
  - `print_text(*args)` — explicit text output
  - `done()` — signals task completion (raises StopIteration internally)
- Workspace introspection: variable names, types, shapes, sizes, memory usage

The library is essentially `sat-ai/agent/core.py`'s exec engine + output capture, but:
- Stripped of the LLM client (that's handled by the backend)
- Stripped of the agent loop (that's orchestrated by the backend)
- Connected to relay instead of running locally

### Backend: orchestrator

The backend manages the agent loop (like sat-ai's `agent_loop()` function):
- Maintains message history (LLM context) per notebook session
- Calls the LLM (via any impl — claude, codex, qwen via openrouter, etc.)
- Extracts ` ```python ` code blocks from the final message
- Sends code to the notebook machine via relay
- Receives execution results from notebook machine via relay
- Feeds results back into LLM context as next "user" message
- Fans out all updates to subscribed frontend clients

### Frontend: notebook panel

Renders the agent's output as a notebook:
- **Markdown cells**: the non-code parts of the agent's response
- **Code cells**: the extracted Python blocks, with execution results below
- **Workspace inspector**: variable summary from the remote machine
- User can also type prompts (natural language → triggers next agent turn)
- User can manually write and execute code cells (bypasses agent, goes directly to notebook machine)

## Message types (relay protocol)

```
# User → Backend (via relay)
notebook/create       → { repo, machineId? }              → { notebookId }
notebook/prompt       → { notebookId, prompt }            → starts agent loop
notebook/execute      → { notebookId, code }              → manual user execution (bypass agent)
notebook/inspect      → { notebookId }                    → { variables[] }
notebook/destroy      → { notebookId }                    → { ok }

# Backend → Notebook machine (via relay)
notebook/execute      → { notebookId, code, cellId }      → machine executes

# Notebook machine → Backend (via relay)  
notebook/result       → { notebookId, cellId, outputs[] } → execution results

# Backend → Frontend (fan-out via push())
notebook/delta        → { notebookId, type: "markdown"|"code"|"output"|"workspace", ... }
```

## The `alf-notebook` library (pip package)

### Package structure

```
alf-notebook/
├── pyproject.toml
├── src/
│   └── alf_notebook/
│       ├── __init__.py          # exports: connect
│       ├── client.py            # WebSocket relay client
│       ├── executor.py          # exec() engine, output capture (from sat-ai core.py)
│       ├── capture.py           # stdout/stderr/image capture helpers
│       └── tools.py             # print_image, print_text, done (workspace-injected)
```

### Key design from sat-ai to port

From `sat-ai/agent/core.py`:
- `workspace` dict as exec context
- `pending` list for collecting outputs during execution
- `@method` decorator → becomes tools injected into workspace
- `print_image()` — torch/numpy/PIL/matplotlib → base64 PNG (percentile stretching, shape inference, NaN handling)
- `print_text()` — explicit output
- `_workspace_summary()` — introspection (variable names, types, shapes, sizes, RAM/VRAM)
- `contextlib.redirect_stdout` / `redirect_stderr` for capture
- Exception handling with formatted traceback

What changes from sat-ai:
- No `agent_loop()` — that lives in the backend
- No `_extract_code_blocks()` — that lives in the backend
- No LLM client — just receives code, executes, sends back
- Communication via WebSocket (relay) instead of in-process
- The `connect()` function replaces the loop — it's a long-lived listener

### Dependencies

Minimal: `websockets` (for relay connection), standard library for the rest. Optional extras for `print_image`: `pillow`, `numpy`, `matplotlib`, `torch`.

## Implementation phases

### Phase 1: Library + basic execution
- `alf-notebook` pip package with `connect()`, executor, output capture (text only)
- Backend: notebook session manager, code extraction from markdown, relay routing
- Frontend: basic notebook panel — shows markdown + code cells + text output
- Test: manual code execution (user types code, it runs on remote machine)

### Phase 2: Agent loop
- Backend: LLM integration (call agent, extract code, send to machine, feed results back)
- Backend: message history management (context for LLM)
- Frontend: "Ask agent" prompt input, streaming markdown + code display
- Library: workspace introspection sent back after each execution

### Phase 3: Rich output
- `print_image()` in library (port from sat-ai — matplotlib/PIL/numpy/torch)
- Frontend: image rendering in cell outputs
- Workspace inspector panel/sidebar
- Error formatting with traceback

### Phase 4: Polish
- User can also manually write code cells (direct execution, no agent)
- Keyboard shortcuts (Shift+Enter)
- Multiple notebook sessions
- Persistence (save cells to DB or filesystem)
- Code editor with syntax highlighting (shiki or codemirror)

## Open questions

1. **Publishing**: Publish `alf-notebook` to PyPI? Or just `pip install git+...` from the repo?
2. **Auth**: How does the notebook machine authenticate with relay? Same token system as backend?
3. **Multiple machines**: Can multiple notebook machines connect? Addressed by `machineId` in create?
4. **Language**: Python-first. Could support other languages by having different library implementations.
5. **Agent model**: Which LLM for the notebook agent? Should be configurable per session (like sat-ai supports multiple models).
6. **Prefill**: Support sat-ai's prefill pattern? (inject setup code before LLM turns, e.g., data loading)

## Acceptance

- [ ] `alf-notebook` pip package exists with `connect()` function
- [ ] Remote machine can connect to relay and receive/execute code
- [ ] Backend extracts ` ```python ` blocks from agent's final message
- [ ] Backend fans out to both notebook machine and frontend
- [ ] Frontend renders markdown + code cells + execution output
- [ ] Agent loop works: prompt → LLM → code → execute → results → LLM → ...
- [ ] `print_image()` works (base64 PNG displayed in frontend)
- [ ] Workspace introspection visible in frontend
- [ ] User can also manually execute code (bypass agent)

## Files to change

### New: `alf-notebook/` (pip package, separate dir or separate repo)

- **`alf-notebook/src/alf_notebook/__init__.py`** — exports `connect`
- **`alf-notebook/src/alf_notebook/client.py`** — WebSocket client connecting to relay, message routing
- **`alf-notebook/src/alf_notebook/executor.py`** — `exec()` engine: receives code, executes in workspace, collects outputs
- **`alf-notebook/src/alf_notebook/capture.py`** — stdout/stderr redirect, output collection (`pending` list pattern)
- **`alf-notebook/src/alf_notebook/tools.py`** — `print_image`, `print_text`, `done`, workspace introspection
- **`alf-notebook/pyproject.toml`** — package metadata, deps: `websockets`

### Backend — new module: `backend/src/modules/notebook/`

- **`backend/src/modules/notebook/index.ts`** — WS handlers:
  - `notebook/create` — register notebook session, track which machine serves it
  - `notebook/prompt` — start agent loop (call LLM, extract code, route to machine)
  - `notebook/execute` — manual user execution (forward code to machine directly)
  - `notebook/result` — receive results from notebook machine, fan out to frontend subscribers
  - `notebook/inspect` — request workspace state from machine, forward to frontend
  - `notebook/destroy` — clean up session

- **`backend/src/modules/notebook/agent-loop.ts`** — the orchestrator logic (port of sat-ai `agent_loop`):
  - Maintains message history per session
  - Calls LLM impl with notebook-specific system prompt
  - Extracts ` ```python ` code blocks from response
  - Sends code to notebook machine, awaits results
  - Feeds results + workspace summary back as next context message
  - Loops until `done()` or max turns

- **`backend/src/modules/notebook/extract.ts`** — `extractCodeBlocks(markdown: string): string[]`
  - Port of sat-ai's `_extract_code_blocks` — finds all ` ```python ` fences

### Backend — registration

- **`backend/src/index.ts`** — add `import "./modules/notebook/index.js";`

### Frontend — new module: `frontend/src/modules/notebook/`

- **`frontend/src/modules/notebook/store.ts`** — Zustand store (cells, variables, notebookId, agent status)
- **`frontend/src/modules/notebook/NotebookPanel.tsx`** — main panel: markdown cells, code cells, output, prompt input
- **`frontend/src/modules/notebook/CellRenderer.tsx`** — renders individual cells (markdown or code+output)
- **`frontend/src/modules/notebook/WorkspaceInspector.tsx`** — variable summary sidebar

### Frontend — registration

- **`frontend/src/core/dashboardStore.ts`** — add `"notebook"` to `PanelType`, `PANEL_TYPES`
- **`frontend/src/pages/RepoPage.tsx`** — add `case "notebook"` to panel switch

## Dependencies

### Blocks on
- **T-042** (Agent turn blocks other requests) — the notebook agent loop must be non-blocking

### Related
- **T-029** (Codex agent implementation) — notebook agent could use any impl

## Notes

### Comparison with sat-ai

| Concern | sat-ai (local) | alf-notebook (distributed) |
|---------|----------------|---------------------------|
| LLM calls | `core.py` calls OpenRouter | Backend calls LLM (any impl) |
| Code extraction | `_extract_code_blocks()` in core.py | `extract.ts` in backend |
| Execution | `exec(code, workspace)` in same process | `exec(code, workspace)` on remote machine via library |
| Output capture | `pending` list, in-process | `pending` list in library, sent via relay |
| Agent loop | `agent_loop()` in core.py | `agent-loop.ts` in backend |
| User interface | None (CLI only) | Frontend notebook panel |
| Communication | In-process function calls | WebSocket via relay |
