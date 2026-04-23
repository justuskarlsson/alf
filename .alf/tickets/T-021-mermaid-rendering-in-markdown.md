---
id: T-021
title: Render mermaid diagrams in markdown viewer
type: feature
status: open
priority: medium
epic: tickets
effort: S
created: 2026-04-22
updated: 2026-04-22
---

Mermaid code fences in ticket markdown (e.g. T-018) render as plain code blocks instead of diagrams.

## Context

The markdown renderer in the Tickets panel doesn't handle ` ```mermaid ` fences. Use a library like `mermaid` (mermaid-js) to detect mermaid code blocks and render them as SVG diagrams inline. Should integrate into the existing markdown rendering pipeline (likely a custom code-block component that checks the language tag).

## Acceptance

- [ ] ` ```mermaid ` fences render as visual diagrams in the Tickets panel
- [ ] Non-mermaid code fences still render as syntax-highlighted code
- [ ] T-018 renders its mermaid graph correctly

## Notes
