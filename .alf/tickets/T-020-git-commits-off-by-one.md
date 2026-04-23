---
id: T-020
title: Git commits view shows diff for wrong commit (off-by-one)
type: bug
status: open
priority: high
epic: git
effort: S
created: 2026-04-22
updated: 2026-04-22
---

Clicking a commit in the git commits list shows the diff for the adjacent commit (off-by-one). E.g. clicking commit #32 shows the diff for #31.

## Context

Likely an index mismatch between the displayed commit list and the value passed to the diff-loading action — either the list is 0-indexed while the handler expects 1-indexed, or the selected index/hash is shifted when passed to the backend.

## Acceptance

- [ ] Clicking a commit shows exactly that commit's diff
- [ ] Verify with at least 3 different commits in a repo with known changes

## Notes
