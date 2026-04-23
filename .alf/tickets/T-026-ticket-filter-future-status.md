---
id: T-026
title: Add "future" filter to tickets panel
type: bug
status: done
priority: medium
epic: tickets
effort: S
created: 2026-04-23
updated: 2026-04-23
resolved: 2026-04-23
---

Tickets with status `future` currently only appear under "show done". Need a dedicated filter so the three states are: **open**, **future**, **done**.

## Context

The ticket list filter toggle currently only has "show done" which lumps `future` tickets in with `done`. Add `future` as its own filter option so users can browse upcoming/planned work separately.

## Acceptance

- [x] Three filter states available: open, future, done
- [x] `future` tickets no longer appear under "show done"
- [x] Default view shows `open` tickets only

## Notes
