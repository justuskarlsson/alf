---
id: T-030
title: Add refresh button to panel top bars
type: feature
status: done
priority: medium
epic: dashboard
effort: M
created: 2026-04-25
updated: 2026-04-25
resolved: 2026-04-25
---

Add a refresh icon to the top bar of panels (next to the drag handle / close button). Clicking it re-runs the panel's initial data fetch without a full page refresh.

## Context

Panels like Git (diffs, commits), Files, Tickets all fetch data on mount via `useOnConnect`. There's no way to manually re-fetch without a page reload. A small refresh icon in the panel header (top-right area, see existing `::` drag and `×` close icons) would trigger the same init logic.

This likely means each panel type needs to expose a `refresh` action or callback that the panel wrapper can invoke. Could be a convention in the `PANEL_TYPES` registry or a ref-based approach.

### Panels that need refresh
- **Git** — re-fetch diffs, commits, changed files
- **Files** — re-fetch file tree and starred files
- **Tickets** — re-fetch ticket list
- **Agents** — re-fetch session list (less critical, streams are live)

## Acceptance

- [ ] Refresh icon visible in panel top bar for all relevant panel types
- [ ] Clicking refresh re-fetches panel data (same as initial mount fetch)
- [ ] No full page reload
- [ ] Works consistently across Git, Files, Tickets panels

## Notes
