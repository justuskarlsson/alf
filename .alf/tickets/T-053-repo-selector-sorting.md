---
id: T-053
title: Sort repos by most recent activity
type: feature
status: done
priority: medium
epic: repos
effort: S
created: 2026-05-06
updated: 2026-05-08
---

Backend-only change. The repo selector should return repos sorted by most recent session/activity first. Repos with no sessions fall back to case-insensitive lexicographic order.

## Context

Currently repos come back in whatever order. The DB already has session timestamps, so this is a simple query change — LEFT JOIN on sessions, ORDER BY latest session timestamp DESC NULLS LAST, then by LOWER(name) ASC for repos without sessions.

Frontend shouldn't need changes as long as it renders in the order received (no client-side re-sort).

## Acceptance

- [ ] Repos with sessions sorted by most recent session/activity (descending)
- [ ] Repos without sessions sorted case-insensitive lexicographically after active repos
- [ ] No frontend changes required (verify it doesn't re-sort)

## Notes
