---
id: T-040
title: "File outline — collapsible symbol list below files"
type: feature
status: future
priority: low
epic: files
effort: M
created: 2026-04-29
updated: 2026-04-29
---

Add a collapsible "Outline" section below FILES in the file panel, showing symbols (functions, classes, variables) defined in the currently selected file.

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

## Notes
