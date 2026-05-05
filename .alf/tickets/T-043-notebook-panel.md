---
id: T-043
title: "Notebook panel — collaborative REPL with agent"
type: feature
status: open
priority: high
epic: notebook
effort: XL
created: 2026-04-30
updated: 2026-05-04
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

## Files to change

### Backend — new module: `backend/src/modules/notebook/`

- **`backend/src/modules/notebook/index.ts`** — (create) WS handlers following the `@handle` decorator pattern:
  - `notebook/create` — create a new notebook, spawn Python subprocess
  - `notebook/execute` — send code to subprocess, stream outputs back via `push()`
  - `notebook/inspect` — return workspace variable summary from subprocess
  - `notebook/destroy` — kill subprocess, clean up
  - `notebook/agent/run` — send prompt to agent impl, agent writes + executes cells
  - Manages `subscribers` map like `AgentsModule` for fan-out of streamed outputs
  - Manages `notebookId → subprocess` map for lifecycle

- **`backend/src/modules/notebook/subprocess.ts`** — (create) Python subprocess manager:
  - Spawn/kill Python child process per notebook
  - JSON-over-stdin/stdout protocol for sending code and receiving outputs
  - Non-blocking: uses `child_process.spawn` (async), NOT `execSync` (critical for T-042)
  - Parse output frames: `{ type: "text"|"error"|"image"|"data"|"workspace", ... }`

- **`backend/src/modules/notebook/notebook-runner.py`** — (create) Python subprocess script:
  - Long-lived process, reads JSON commands from stdin, writes JSON responses to stdout
  - Persistent `workspace` dict (exec context), modeled on `sat-ai/satai/agent/core.py`
  - `contextlib.redirect_stdout` / `redirect_stderr` for output capture per cell
  - `print_image()` helper ported from sat-ai (matplotlib Figure, PIL Image, numpy, torch)
  - Workspace introspection: variable names, types, shapes, sizes, memory usage
  - Error handling: catch exceptions, format traceback, send as error output

### Backend — registration

- **`backend/src/index.ts`** — (modify) Add side-effect import:
  ```ts
  import "./modules/notebook/index.js";
  ```
  Add cleanup for notebook subscribers on `client-disconnected` (like `cleanupSubscriber`)

### Backend — DB (optional, Phase 4 persistence)

- **`backend/src/core/db/migrations/003_notebooks.sql`** — (create, optional) Schema for persisting notebooks:
  - `notebooks` table: id, repo_id, title, language, created_at, updated_at
  - `notebook_cells` table: id, notebook_id, source, outputs (JSON), author, execution_count, idx, created_at
  - Only needed if persistence is implemented (Phase 4); in-memory-only is fine for Phase 1-3

- **`backend/src/core/db/index.ts`** — (modify, optional) Add `003_notebooks.sql` to migration list, add `dbNotebooks` / `dbCells` DAL objects

### Shared types

- **`shared/types/index.ts`** — (modify) Add notebook types:
  - `NotebookCell` interface (id, type, source, outputs, author, executionCount, status)
  - `CellOutput` union type (text, error, image, data)
  - `NotebookVariable` interface (name, type, shape, size, device)
  - WS message payload interfaces: `NotebookCreateMsg`, `NotebookExecuteMsg`, `NotebookInspectMsg`, `NotebookDestroyMsg`, `NotebookAgentRunMsg`
  - `NotebookDelta` interface for streamed cell outputs

### Frontend — new module: `frontend/src/modules/notebook/`

- **`frontend/src/modules/notebook/store.ts`** — (create) Zustand store:
  - State: `cells: NotebookCell[]`, `variables: NotebookVariable[]`, `notebookId`, `isExecuting`, `liveOutput`
  - Actions: `createNotebook(repo, request)`, `executeCell(cellId, code, request)`, `addCell()`, `removeCell()`, `updateCellSource()`, `inspectWorkspace(request)`, `destroyNotebook(request)`, `runAgent(prompt, request)`
  - Follows the pattern from `useAgentsStore`: `request` passed as parameter, not stored in state

- **`frontend/src/modules/notebook/NotebookPanel.tsx`** — (create) Main panel component:
  - Uses `usePanelInit()` for initialization (matches pattern from FilesPanel, GitPanel, etc.)
  - Uses `Panel` + `SidebarLayout` from `../../panels/Panel` for consistent styling
  - Cell list with code editor, run button, output display
  - `[+ Code]` / `[+ Markdown]` buttons to add cells
  - `subscribe("notebook/delta", ...)` for streaming cell outputs (like AgentsPanel subscribes to `agent/delta`)
  - Collapsible workspace inspector sidebar

- **`frontend/src/modules/notebook/CellEditor.tsx`** — (create) Code cell editor component:
  - Syntax-highlighted code input (use `shiki` — already in `package.json`, no new dependency needed)
  - Or consider a lightweight editable approach: `<textarea>` with shiki-rendered overlay for highlighting
  - Run button (Shift+Enter), delete button, cell status indicator
  - Output rendering: text, error (with traceback formatting), images (base64 `<img>`), rich data

- **`frontend/src/modules/notebook/WorkspaceInspector.tsx`** — (create) Variable inspector:
  - Collapsible section showing workspace variables with name, type, shape, size
  - Memory usage summary (RAM, optionally VRAM)
  - Toggleable filters: show/hide functions, modules
  - Uses `CollapsibleSection` from `../../panels/Panel`

### Frontend — panel registration

- **`frontend/src/core/dashboardStore.ts`** — (modify) Register new panel type:
  - Add `"notebook"` to `PanelType` union: `"files" | "tickets" | "git" | "agents" | "notebook"`
  - Add entry to `PANEL_TYPES`: `notebook: { label: "Notebook" }`

- **`frontend/src/pages/RepoPage.tsx`** — (modify) Wire up the new panel:
  - Import `NotebookPanel` from `../modules/notebook/NotebookPanel`
  - Add `case "notebook"` to `renderPanelContent()` switch

### Frontend — dependencies (code editor question)

The project already has `shiki` (v4.0.2) for syntax highlighting. This is sufficient for Phase 1 (read-only highlighting of cell code + a plain textarea for editing). For a richer editing experience in Phase 4, consider adding `@codemirror/view` + `@codemirror/lang-python` — CodeMirror is lighter than Monaco and better suited to embedding multiple small editors in cells. No new dependency is strictly required for Phase 1.

## Dependencies

### Blocks on (should be done first)
- **T-042** (Agent turn blocks other requests) — The notebook subprocess MUST use async `child_process.spawn`, not `execSync`. T-042 addresses the general event-loop blocking problem. If T-042 introduces a worker-thread or subprocess pattern for isolating blocking work, the notebook subprocess manager should follow the same pattern rather than inventing its own.

### Related (not blocking)
- **T-029** (Codex agent implementation) — Phase 3 agent integration could reuse any agent impl (claude-code, codex, test). The notebook agent mode would call `ImplFn` with notebook-specific context (cell history + workspace state as prompt). No blocking dependency, but the notebook agent should be impl-agnostic.
- **T-044** (Frontend memory bloat) — Large notebook outputs (especially base64 images) could contribute to frontend memory issues. Should use the same mitigations.

### Notes on sat-ai reference
The `~/repos/sat-ai/satai/agent/core.py` exec-loop is confirmed to exist and contains the patterns referenced in the ticket: `workspace` dict, `pending` output list, `print_image()` with matplotlib/PIL/numpy/torch support, `print_text()`, workspace introspection (`_workspace_summary`), and the `agent_loop` / `_exec_turn` functions. The Python subprocess (`notebook-runner.py`) should port these patterns directly, adapting the output collection from in-process `pending` list to JSON-over-stdout frames.

## Notes
