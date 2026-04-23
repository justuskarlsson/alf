---
id: T-019
title: Files sidebar sections don't fill vertical space
type: bug
status: done
priority: medium
epic: files
effort: S
created: 2026-04-22
updated: 2026-04-23
---

"Starred" and "Files" sections in the files sidebar have too-small max-height and don't fill the available vertical space.

## Context

Both sections should share the sidebar height equally when both need space. If only one has content, it should expand to use the full height. This should be a straightforward flex layout fix (e.g. `flex: 1 1 0` + `overflow-y: auto` on each section, parent as `flex flex-col h-full`).

## Acceptance

- [x] Both sections fill available sidebar height equally when both have content
- [x] A single section expands to full height when the other is short/empty
- [x] Scrolling still works within each section when content overflows

## Notes

<!-- 2026-04-23 agent --> Fixed StarredSection: changed `CollapsibleSection` to use `fill` prop and container from `min-h-[60px] max-h-[40vh]` to `h-full`.
