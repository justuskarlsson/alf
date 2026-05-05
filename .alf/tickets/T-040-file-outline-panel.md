---
id: T-040
title: "File outline — collapsible symbol list below files"
type: feature
status: done
priority: low
epic: files
effort: M
created: 2026-04-29
updated: 2026-05-05
---

Add a collapsible "Outline" section below FILES in the file panel, showing symbols (functions, classes, variables) defined in the currently selected file. **Scope: single file only** (not project-wide).

> See `~/repos/hans/orc-codegraph/` for inspiration on symbol extraction, but keep this scoped to a single-file outline — not a full code graph.

## Context

When viewing a file, it's useful to see its structure at a glance — especially for large files. This is similar to VS Code's outline panel.

## Requirements

### Default view
- Show all **functions** defined in the file
- Sorted by line number (chronological order in file)

### Toggleable filters
- Functions (default: on)
- Classes (default: on)
- Variables / constants (default: off — too noisy)
- Exports only (default: off)

### Sorting
- By line number (chronological, default)
- By size (number of lines in the definition body)

### Interaction
- Click symbol → scroll file viewer to that line
- Show line number next to each symbol

### Parsing
- Use a lightweight parser — tree-sitter would be ideal but heavy
- Simpler: regex-based extraction per language (function/class/const patterns)
- Support at minimum: TypeScript/JavaScript, Python, Rust, Go

## Acceptance

- [ ] Collapsible "Outline" section below FILES
- [ ] Lists functions and classes from the selected file
- [ ] Click navigates to line in viewer
- [ ] Filter toggles (functions, classes, variables)
- [ ] Sort toggle (chronological vs size)

## Files to change

### Backend

- **`backend/src/modules/files/index.ts`** — Add a new `@handle("files/outline")` handler to `FilesModule`. Given `{ repo, path }`, reads the file content and runs regex-based symbol extraction, returning `{ type: "files/outline", symbols: OutlineSymbol[] }`. The extraction logic itself should live in a separate helper (see below) to keep the handler thin.

- **`backend/src/modules/files/outline.ts`** *(new file)* — Symbol extractor per language. A top-level `extractOutline(content: string, lang: string): OutlineSymbol[]` dispatcher selects the right extractor based on file extension. Symbols include: name, kind (function/class/method/variable), line number, end line (for size sorting), exported flag, and parent (for methods/inner functions).

  **Approach per language:**
  - **TypeScript/JavaScript**: Regex-based should work for top-level `function`, `class`, `const`/`let` declarations. For **class methods** and **inner functions**, regex gets fragile — consider `ts-morph` (already used in orc-codegraph) for TS/JS specifically if regex proves insufficient. Start with regex, upgrade if needed.
  - **Python**: Regex for `def` and `class` patterns, but use **indentation tracking** to detect function end lines — a `def` ends when the next line at the same or lesser indentation level appears (or EOF). This gives accurate line counts. Also use indentation to detect **methods** (indented `def` inside a `class`) vs top-level functions.
  - **Rust/Go**: Regex + brace counting for end-line detection.

  **Requirement**: Must detect class methods/inner functions — a flat list of top-level symbols is not enough. The `OutlineSymbol` type should include an optional `parent?: string` field for nesting, or symbols should be returned as a tree.

  Note: `ts-morph` (~50MB) is heavy. For MVP, regex + indentation heuristics is the pragmatic choice. Re-evaluate if users report missing symbols.

### Shared types

- **`shared/types/index.ts`** — Add `OutlineSymbol` interface and `FilesOutlineResponse` type:
  ```ts
  interface OutlineSymbol {
    name: string;
    kind: "function" | "class" | "variable";
    line: number;
    endLine?: number;    // for size-based sorting
    exported: boolean;
  }
  interface FilesOutlineResponse {
    type: "files/outline";
    path: string;
    symbols: OutlineSymbol[];
  }
  ```

### Frontend

- **`frontend/src/modules/files/store.ts`** — Add outline state to `FilesStore`: `outlineSymbols: OutlineSymbol[]`, `outlineLoading: boolean`, and a `loadOutline(repo, path, request)` action that calls `files/outline`. Clear outline when `setSelectedFile` changes or when `listFiles` resets state.

- **`frontend/src/modules/files/FileContentPanel.tsx`** — Add an "Outline" collapsible section at the top of the file content area (or as a thin sidebar/header strip). When a file is selected and content is loaded, render the outline symbol list. Each symbol row shows: icon by kind, name, line number. Click scrolls the `alf-shiki` rendered code to that line (need to add line-number anchors or use `scrollIntoView` on the rendered code's line elements — shiki renders `<span class="line">` elements that can be targeted by index). Add filter toggle buttons (functions on/off, classes on/off, variables on/off, exports-only) and sort toggle (chronological vs size). Use `CollapsibleSection` from `frontend/src/panels/Panel.tsx`.

- **`frontend/src/modules/files/FilesPanel.tsx`** — Trigger `loadOutline` after a file is opened (in the `useOpenFile` hook, after `files/get` resolves). No new panel type registration needed in `dashboardStore.ts` — outline is part of the existing files panel.

### No changes needed

- **`frontend/src/core/dashboardStore.ts`** — No changes. The outline is integrated into the existing `files` panel type, not a separate panel.
- **`backend/src/index.ts`** — No changes needed. The `files` module is already imported as a side-effect; the new `@handle` decorator in `FilesModule` auto-registers.
- **No new npm dependencies** — regex-based extraction avoids adding `ts-morph` (~50MB) or tree-sitter. If regex proves too brittle later, `ts-morph` could be added, but the ticket explicitly prefers lightweight regex.

## Dependencies

- **T-039** (files panel empty on switch) — should be fixed first since outline relies on a stable selected-file lifecycle. If the file tree empties unexpectedly, outline state would also break.
- **No blockers from this ticket** — T-040 does not block any other open tickets.

## Notes
