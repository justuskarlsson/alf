---
id: T-043
title: "Notebook panel — collaborative REPL with agent"
type: feature
status: future
priority: high
epic: notebook
effort: XL
created: 2026-04-30
updated: 2026-04-30
---

A new panel type: interactive notebook (like Jupyter) but without Jupyter. A shared REPL environment where both the user and the agent can write, execute, and visualize code. Inspired by `~/repos/sat-ai/satai/agent/core.py` exec-loop pattern.

## Core concept

A notebook is a sequence of **cells**. Each cell has code and output. Both the user and the agent can:
- Add, edit, and execute cells
- See outputs (text, images, errors)
- See the shared workspace state (declared variables, their types/sizes)

The agent doesn't use Claude Code SDK tools — instead, the notebook itself IS the execution environment. The agent writes Python (or other language) code, the backend `exec()`s it in a persistent process, and outputs flow back to both agent and user.

## Architecture

### Backend: persistent REPL process

A long-lived Python subprocess per notebook session, managed by the backend:

```
Backend
├── NotebookManager
│   ├── create(sessionId) → spawns Python subprocess
│   ├── execute(sessionId, code) → sends code, streams output
│   ├── inspect(sessionId) → returns workspace state (variables, types, sizes)
│   └── destroy(sessionId) → kills subprocess
│
└── Python subprocess (one per notebook)
    ├── Shared workspace dict (like sat-ai's `workspace`)
    ├── exec() in workspace context
    ├── Captures: stdout, stderr, images (matplotlib/PIL), exceptions
    └── Introspection: list variables, types, sizes, memory usage
```

The subprocess communicates with the backend via stdin/stdout JSON protocol (or a local socket). This keeps the exec environment isolated and prevents blocking the Node event loop (see T-042).

### Cell model

```typescript
interface NotebookCell {
  id: string;
  type: "code" | "markdown";
  source: string;           // code or markdown text
  outputs: CellOutput[];    // results after execution
  author: "user" | "agent"; // who wrote this cell
  executionCount: number | null;
  status: "idle" | "running" | "done" | "error";
}

type CellOutput =
  | { type: "text"; text: string }           // stdout / print()
  | { type: "error"; traceback: string }     // stderr / exception
  | { type: "image"; base64: string; mime: string }  // matplotlib, PIL, etc.
  | { type: "data"; mime: string; data: string }     // rich output (HTML, SVG, etc.)
```

### Output capture in the Python subprocess

Similar to sat-ai's `pending` list + `print_text`/`print_image` pattern:

- **stdout/stderr**: captured per-cell execution via `contextlib.redirect_stdout`
- **Images**: `print_image()` helper (supports matplotlib Figure, PIL Image, numpy array, torch Tensor) — encodes to base64 PNG, sends back as `image` output
- **Variables**: after each cell execution, introspect the workspace and send back a summary (name, type, shape/size for arrays, memory usage)
- **Errors**: catch exceptions, format traceback, send as `error` output

### Agent integration

Two modes for agent involvement:

#### Mode A: Agent as cell author
The agent can add and execute cells in the notebook. User sends a natural language prompt (via the chat composer or a special notebook prompt), and the agent responds by writing code cells. The agent sees all previous cell outputs + workspace state as context.

Flow: user prompt → agent writes code → backend execs in subprocess → outputs stream back → agent sees results → writes next cell (like sat-ai's agent_loop)

#### Mode B: Agent as assistant
User writes cells manually. Can ask the agent for help on a specific cell ("fix this", "optimize this", "explain this variable"). Agent can edit or add cells.

Both modes coexist — the notebook is truly collaborative.

### Workspace panel (sidebar or collapsible)

A live view of all variables in the workspace:

```
── WORKSPACE ──
Variables:
  df                DataFrame  (1000, 12)         78 KB
  model             Sequential                    2.1 MB (cuda:0)
  results           dict
  
Functions: load_data, preprocess, train
Memory: RAM 2.3 / 16 GB | VRAM 1.1 / 8 GB
```

Toggleable filters:
- Show/hide functions
- Show/hide modules
- Sort by name / size / creation order

### Frontend panel

```
┌─ NOTEBOOK ──────────────────────────────────────────┐
│ ┌─ Cell 1 (user) ─────────── [▶ Run] [✕] ────────┐ │
│ │ import pandas as pd                              │ │
│ │ df = pd.read_csv("data.csv")                     │ │
│ │ print(df.shape)                                  │ │
│ ├──────────────────────────────────────────────────┤ │
│ │ Out: (1000, 12)                                  │ │
│ └──────────────────────────────────────────────────┘ │
│ ┌─ Cell 2 (agent) ─────────── [▶ Run] [✕] ───────┐ │
│ │ import matplotlib.pyplot as plt                  │ │
│ │ df.hist(figsize=(12, 8))                         │ │
│ │ print_image(plt.gcf())                           │ │
│ ├──────────────────────────────────────────────────┤ │
│ │ Out: [histogram image]                           │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ [+ Code] [+ Markdown] [Ask agent...]                │
│                                                      │
│ ▸ WORKSPACE (3 variables, 80 KB)                    │
└──────────────────────────────────────────────────────┘
```

### Message types

```
notebook/create     → { repo, language? }          → { notebookId }
notebook/execute    → { notebookId, cellId, code } → streams outputs
notebook/inspect    → { notebookId }               → { variables[] }
notebook/destroy    → { notebookId }               → { ok }
notebook/agent/run  → { notebookId, prompt }       → agent writes + executes cells
```

## Implementation phases

### Phase 1: Core REPL
- Backend: Python subprocess manager (spawn, execute, destroy)
- Backend: stdout/stderr capture, JSON protocol
- Frontend: basic cell list, code editor, run button, text output
- No agent integration yet — user-only REPL

### Phase 2: Rich output
- `print_image()` for matplotlib/PIL/numpy/torch (port from sat-ai)
- Image rendering in cell outputs
- Error formatting with traceback
- Workspace introspection sidebar

### Phase 3: Agent integration
- Agent can write and execute cells
- Agent sees cell outputs + workspace state as context
- Natural language prompt → code cells flow
- Both user and agent cells in same notebook

### Phase 4: Polish
- Markdown cells
- Cell reordering (drag)
- Keyboard shortcuts (Shift+Enter to run, Ctrl+Enter to run and stay)
- Export notebook as .py / .ipynb
- Multiple language support (Python first, then Node.js)

## Open questions

1. **Code editor**: Use CodeMirror or Monaco? Or minimal textarea with syntax highlighting (shiki)? CodeMirror is lighter.
2. **Subprocess lifecycle**: One per notebook? One per repo? Kill on disconnect or keep alive?
3. **Language**: Python-first, but should the subprocess protocol support other languages (Node, bash)?
4. **Persistence**: Save notebook cells to `.alf/notebooks/`? Or just in-memory per session?
5. **Security**: The subprocess runs arbitrary code. Same trust model as Claude Code tools — the user controls what runs.
6. **Agent model**: Which LLM runs the notebook agent? Reuse the session's selected impl, or a separate lighter model (like sat-ai uses Qwen)?

## Acceptance

- [ ] Notebook panel type registered in dashboard
- [ ] Create notebook → spawns Python subprocess
- [ ] User can write and execute code cells
- [ ] Text output (stdout/stderr) displayed below cells
- [ ] Image output (matplotlib/PIL) rendered inline
- [ ] Workspace variable inspector
- [ ] Agent can write and execute cells via natural language prompt
- [ ] Both user and agent see each other's cells and outputs
- [ ] Subprocess cleanup on notebook close

## Notes
