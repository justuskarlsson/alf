---
id: T-019
title: Files sidebar sections don't fill vertical space
type: bug
status: open
priority: medium
epic: files
effort: S
created: 2026-04-22
updated: 2026-04-22
---

"Starred" and "Files" sections in the files sidebar have too-small max-height and don't fill the available vertical space.

## Context

Both sections should share the sidebar height equally when both need space. If only one has content, it should expand to use the full height. This should be a straightforward flex layout fix (e.g. `flex: 1 1 0` + `overflow-y: auto` on each section, parent as `flex flex-col h-full`).

## Acceptance

- [ ] Both sections fill available sidebar height equally when both have content
- [ ] A single section expands to full height when the other is short/empty
- [ ] Scrolling still works within each section when content overflows

## Notes
