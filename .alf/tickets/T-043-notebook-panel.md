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

A new panel type: REPL environment where the execution happens on a **remote machine** running a pip-installable Python library (`alf-notebook`). The library connects to the relay as a client (just like frontend and backend do). The backend orchestrates the agent loop and fans out to both the notebook machine and the frontend.

Inspired by `~/repos/sat-ai/satai/agent/core.py` — same exec-loop pattern, but distributed via the relay instead of local process + OpenRouter.

## Core concept

**It's a REPL history, not a notebook with editable cells.** You see the history of what's been done — append-only, scrollable, like the agents panel but for code execution. No editing cells, no re-running cells. Just a chronological record of:
- Agent's markdown (reasoning, explanations)
- Code blocks (extracted from markdown, auto-executed)
- Outputs below each code block (from `print_text` / `print_image`)

The **agent writes markdown**. All Python code within ` ```python ` fences in the agent's **final message** (not thinking, not tool calls) gets extracted and executed on the remote machine. The rest of the markdown is rendered as-is. The agent knows this convention.

**No tools.** This is the key constraint that differentiates the notebook module from the agents module. The agent's ONLY mechanism for interacting with the remote environment is writing Python code. No tool calls, no file access, nothing else. Markdown with code fences — that's it.

## Output model

Output is **exclusively** via explicit library functions injected into the exec workspace:
- `print_text(*args)` — text output, sent back to backend/frontend
- `print_image(img)` — image output (matplotlib Figure, PIL, numpy, torch → base64 PNG)

The agent sees the outputs of its own `print_text`/`print_image` calls as feedback in the next turn's context. This is how it "discovers" information — by writing code that prints results.

**No automatic stdout capture** as primary mechanism. The agent is instructed to use `print_text()` explicitly. However, `contextlib.redirect_stderr` may be used as a safety net for uncaught errors/exceptions.

**No automatic workspace introspection.** The agent can inspect the workspace by writing code that does so (e.g., `print_text(f"df shape: {df.shape}")`). No magic workspace summary appended after every turn — that would bloat context with redundant info. The agent manages its own context budget.

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

The notebook machine is **just another client** connected to the relay. Like the frontend is a client that displays things, the notebook machine is a client that executes things. The frontend wants to see what the notebook client does.

### How it starts

The user initiates the notebook machine — not the backend. Example workflow:
1. User SSHs into their GPU cluster node
2. User has a Python environment with `alf-notebook` installed
3. User runs: `python -m alf_notebook` (or a small script)
4. The library reads `ALF_RELAY_URL` and `ALF_TOKEN` from env (or `.env` file)
5. Library connects to relay as a WebSocket client
6. Backend receives notification: "new notebook environment connected"
7. Backend registers it in DB, notifies frontend: "notebook available"
8. Frontend shows the notebook in the panel

```python
# Option A: CLI
# $ alf-notebook  (reads ALF_RELAY_URL and ALF_TOKEN from env)

# Option B: Script
from alf_notebook import connect
connect()  # reads from env

# Option C: Script with pre-loaded workspace
from alf_notebook import connect
import torch
import numpy as np
connect(workspace={"torch": torch, "np": np})
```

### Flow (one agent turn)

1. User sends prompt via frontend → relay → backend
2. Backend calls LLM with context (previous markdown + code + outputs + user prompt)
3. LLM responds with markdown containing ` ```python ` code blocks
4. Backend extracts code blocks from the **final message only**
5. Backend fans out to **both**:
   - **Frontend**: the full markdown response (rendered immediately — user sees what agent wants to do)
   - **Notebook machine**: the extracted code blocks (for execution)
6. Notebook machine `exec()`s each code block in persistent workspace
7. During execution, `print_text()` / `print_image()` calls produce outputs
8. Library sends outputs back through relay → backend
9. Backend fans out outputs to **both**:
   - **Frontend**: rendered below the corresponding code block
   - **LLM context**: fed back as next user message for the loop
10. Loop continues until agent calls `done()` or max turns reached

### Frontend rendering

Like the agents panel — a scrollable session view. Each agent turn renders as:

```
┌─────────────────────────────────────────────────┐
│ ## Exploring the dataset                        │  ← markdown (rendered)
│                                                 │
│ Let me load the data and check its shape:       │  ← markdown (rendered)
│                                                 │
│ ┌─ python ────────────────────────────────────┐ │
│ │ import pandas as pd                         │ │  ← code block (syntax highlighted)
│ │ df = pd.read_csv("data.csv")                │ │
│ │ print_text(f"Shape: {df.shape}")            │ │
│ │ print_text(f"Columns: {list(df.columns)}")  │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─ output ────────────────────────────────────┐ │
│ │ Shape: (1000, 12)                           │ │  ← output (from print_text)
│ │ Columns: ['id', 'temp', 'wind', ...]        │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Interesting — 1000 samples with 12 features.    │  ← markdown (rendered)
│ Let me visualize the distribution:              │
│                                                 │
│ ┌─ python ────────────────────────────────────┐ │
│ │ import matplotlib.pyplot as plt             │ │
│ │ df.hist(figsize=(12, 8))                    │ │
│ │ print_image(plt.gcf())                      │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─ output ────────────────────────────────────┐ │
│ │ [histogram image]                           │ │  ← output (from print_image)
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

Note: the markdown and code render immediately when the agent response arrives. The outputs appear once the remote machine finishes executing and sends results back. Multiple code blocks in one response are executed sequentially, each getting its own output section.

## The `alf-notebook` library (pip package)

### What it does

1. Connects to relay as a WebSocket client
2. Announces itself: "I am a notebook environment"
3. Listens for `notebook/execute` messages
4. On receive: `exec(code, workspace)` with `print_text`/`print_image` available
5. Sends back outputs as they happen (streaming via `notebook/output`)
6. Sends completion signal when exec finishes

### Workspace-injected functions

These are placed into the `workspace` dict before any user code runs:

- **`print_text(*args, sep=" ", end="\n")`** — like Python's `print()` but routes output back through relay. This is what the agent uses to show results.
- **`print_image(img, *, pct=100.0)`** — accepts matplotlib Figure, PIL Image, numpy ndarray, torch Tensor. Encodes to base64 PNG, sends back through relay. Port from sat-ai.
- **`done()`** — signals task completion. Raises StopIteration internally, caught by the executor. Backend stops the agent loop.

### Error handling

If `exec()` raises an exception, the library catches it, formats the traceback, and sends it back as an error output. The agent sees the error in its next context and can try to fix it. Errors don't kill the session — the workspace persists.

### Package structure

```
alf-notebook/
├── pyproject.toml
├── src/
│   └── alf_notebook/
│       ├── __init__.py          # exports: connect
│       ├── __main__.py          # CLI entry point: python -m alf_notebook
│       ├── client.py            # WebSocket relay client (connect, listen, send)
│       ├── executor.py          # exec() engine: workspace dict, error handling
│       └── tools.py             # print_image, print_text, done
```

### Dependencies

Minimal: `websockets` (relay connection). Optional extras: `pillow`, `numpy`, `matplotlib`, `torch` (for `print_image` to handle various types).

## Message types (relay protocol)

```
# Notebook machine → Backend (via relay, on connect)
notebook/register     → { name?, capabilities? }          → backend tracks this machine

# Frontend → Backend (via relay)
notebook/prompt       → { notebookId, prompt }            → starts/continues agent loop
notebook/destroy      → { notebookId }                    → tears down session

# Backend → Notebook machine (via relay)
notebook/execute      → { notebookId, code, blockIndex }  → execute this code block

# Notebook machine → Backend (via relay)
notebook/output       → { notebookId, blockIndex, type: "text"|"image"|"error", data }
notebook/done         → { notebookId, blockIndex }        → execution of this block finished

# Backend → Frontend (fan-out via push())
notebook/delta        → { notebookId, type: "markdown"|"code"|"output"|"error"|"turn-done", ... }
```

## Backend orchestrator logic

Very similar to `sat-ai/agent/core.py`'s `agent_loop()`, but in TypeScript:

```typescript
// Pseudocode for the agent loop
async function notebookAgentLoop(notebookId, prompt, machineConnectionId) {
  const messages = buildContext(notebookId); // previous turns
  messages.push({ role: "user", content: prompt });

  for (let turn = 0; turn < maxTurns; turn++) {
    // 1. Call LLM (no tools allowed)
    const response = await callLLM(messages, { tools: [] });
    
    // 2. Extract code blocks from final message
    const { markdown, codeBlocks } = extractCodeBlocks(response);
    
    // 3. Fan out markdown to frontend immediately
    pushToFrontend(notebookId, { type: "markdown", content: markdown });
    
    // 4. Execute each code block on the remote machine
    const outputs = [];
    for (const [i, code] of codeBlocks.entries()) {
      pushToFrontend(notebookId, { type: "code", blockIndex: i, code });
      sendToMachine(machineConnectionId, { type: "notebook/execute", code, blockIndex: i });
      const result = await waitForResult(notebookId, i); // notebook/done
      pushToFrontend(notebookId, { type: "output", blockIndex: i, ...result });
      outputs.push(result);
    }
    
    // 5. Check if done() was called
    if (outputs.some(o => o.done)) break;
    
    // 6. Feed outputs back as next context message
    messages.push({ role: "assistant", content: response });
    messages.push({ role: "user", content: formatOutputsForContext(outputs) });
  }
}
```

Key differences from the agents module:
- **No tools** in the LLM call — only markdown output
- **Code extraction** — parsing ` ```python ` fences from markdown
- **Remote execution** — routing code to the notebook machine via relay
- **Feedback loop** — outputs go back into LLM context

## Implementation phases

### Phase 1: Library + connectivity
- `alf-notebook` pip package: `connect()`, relay client, basic `exec()` with `print_text()`
- Backend: notebook registration handler (machine connects → tracked), `notebook/execute` routing
- Frontend: basic panel showing text output from remote execution
- Test: manually send code to execute, see text results

### Phase 2: Agent loop
- Backend: agent loop orchestrator (call LLM, extract code, route, feed back)
- Backend: message history per notebook session
- Frontend: prompt input, streaming markdown + code block rendering + outputs
- System prompt for the notebook agent (explains the convention)

### Phase 3: Rich output
- `print_image()` in library (port from sat-ai)
- Frontend: base64 image rendering below code blocks
- Error formatting with traceback display
- `done()` function and loop termination

### Phase 4: Polish
- Multiple simultaneous notebook sessions
- Session persistence (save history to DB)
- Code syntax highlighting (shiki)
- Keyboard shortcuts for prompt input
- Configurable LLM model per session

## Open questions

1. **Publishing**: Publish `alf-notebook` to PyPI? Or just `pip install git+...` from the repo?
2. **Auth**: Same token system as backend/frontend? Separate notebook tokens?
3. **Multiple machines**: Can multiple notebook machines connect simultaneously? Route by machineId?
4. **Workspace summary**: Should there be any automatic context help for the agent (e.g., list of available `print_*` functions), or is it purely in the system prompt?
5. **Agent model**: Configurable per session? Default to something cheap (Qwen) for iteration-heavy work?
6. **Prefill**: Support sat-ai's prefill pattern? (inject setup code before LLM starts, e.g., data loading)
7. **Stdout capture**: Use `redirect_stdout` as safety net for libraries that use `print()` directly? Or keep it pure — only explicit `print_text()` produces output? Leaning toward capturing stdout as secondary/dimmed output.

## Acceptance

- [ ] `alf-notebook` pip package exists with `connect()` + CLI entry point
- [ ] Remote machine can connect to relay and be recognized as a notebook environment
- [ ] Backend can route code to the notebook machine and receive outputs
- [ ] Agent loop: prompt → LLM → extract code → execute → outputs → feed back → loop
- [ ] No tools in agent call — only markdown with code fences
- [ ] Frontend renders scrollable REPL history (markdown + code + outputs)
- [ ] `print_text()` output appears below corresponding code block in frontend
- [ ] `print_image()` renders base64 PNG in frontend
- [ ] `done()` terminates the agent loop
- [ ] Errors (exceptions) displayed with traceback, don't kill the session

## Files to change

### New: `alf-notebook/` (pip package — separate dir at repo root, or separate repo)

- **`alf-notebook/pyproject.toml`** — package metadata, deps: `websockets`
- **`alf-notebook/src/alf_notebook/__init__.py`** — exports `connect`
- **`alf-notebook/src/alf_notebook/__main__.py`** — CLI: `python -m alf_notebook`
- **`alf-notebook/src/alf_notebook/client.py`** — WebSocket relay client, message routing
- **`alf-notebook/src/alf_notebook/executor.py`** — `exec()` in workspace dict, error handling
- **`alf-notebook/src/alf_notebook/tools.py`** — `print_text`, `print_image`, `done`

### Backend — new module: `backend/src/modules/notebook/`

- **`backend/src/modules/notebook/index.ts`** — WS handlers:
  - `notebook/register` — notebook machine announces itself
  - `notebook/prompt` — user sends prompt, starts agent loop
  - `notebook/output` — receives execution results from notebook machine
  - `notebook/done` — execution block finished
  - `notebook/destroy` — tear down session

- **`backend/src/modules/notebook/agent-loop.ts`** — orchestrator:
  - Message history per session
  - LLM calls (no tools)
  - Code block extraction
  - Route code to notebook machine
  - Feed results back into context
  - Loop control (done / max turns)

- **`backend/src/modules/notebook/extract.ts`** — `extractCodeBlocks(markdown)`
  - Parse ` ```python ` fences, return array of code strings + surrounding markdown

### Backend — registration

- **`backend/src/index.ts`** — add `import "./modules/notebook/index.js";`

### Frontend — new module: `frontend/src/modules/notebook/`

- **`frontend/src/modules/notebook/store.ts`** — Zustand store (session history, connected machines, agent status)
- **`frontend/src/modules/notebook/NotebookPanel.tsx`** — scrollable REPL history view + prompt input
- **`frontend/src/modules/notebook/TurnRenderer.tsx`** — renders one agent turn (markdown + code blocks + outputs)

### Frontend — registration

- **`frontend/src/core/dashboardStore.ts`** — add `"notebook"` to `PanelType`, `PANEL_TYPES`
- **`frontend/src/pages/RepoPage.tsx`** — add `case "notebook"` to panel switch

## Dependencies

### Blocks on
- **T-042** (Agent turn blocks other requests) — the notebook agent loop must be non-blocking

### Related
- **T-029** (Codex agent implementation) — notebook agent could use any LLM impl

## Notes

### Comparison with sat-ai

| Concern | sat-ai (local) | alf-notebook (distributed) |
|---------|----------------|---------------------------|
| LLM calls | `core.py` calls OpenRouter | Backend calls LLM (any impl) |
| Code extraction | `_extract_code_blocks()` in core.py | `extract.ts` in backend |
| Execution | `exec(code, workspace)` in same process | `exec(code, workspace)` on remote machine via library |
| Output capture | `pending` list, in-process | `print_text`/`print_image` → relay → backend |
| Agent loop | `agent_loop()` in core.py | `agent-loop.ts` in backend |
| User interface | None (CLI) | Frontend notebook panel |
| Communication | In-process function calls | WebSocket via relay |
| Initiation | User runs script locally | User runs library on remote machine, connects to relay |
