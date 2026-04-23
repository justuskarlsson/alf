---
id: T-023
title: Git diff content view background cuts off early
type: bug
status: done
priority: medium
epic: git
effort: S
created: 2026-04-23
updated: 2026-04-23
---

In the git panel diff content view, the background cuts off where the diff content ends, exposing the panel background beneath instead of filling the full height.

## Context

The diff content container likely needs `min-h-full` or `flex-1` so the background fills the remaining vertical space regardless of diff length.

## Acceptance

- [ ] Diff content area background extends to the bottom of the panel
- [ ] Still scrolls correctly when diff content overflows

## Notes
