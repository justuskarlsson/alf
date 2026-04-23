---
id: T-022
title: Ticket list should show filename instead of title
type: bug
status: done
priority: medium
epic: tickets
effort: S
created: 2026-04-22
updated: 2026-04-23
---

In the tickets list, show the ticket filename (e.g. `T-018-mvp4-architecture-research.md`) as the primary label instead of the frontmatter title. The filename is descriptive enough and avoids redundancy.

## Context

Currently the list shows the frontmatter `title` as the heading with the filename below it. Swap these: filename becomes the heading, remove the title, keep tags/status badges below.

## Acceptance

- [x] Ticket list items show filename as the primary label
- [x] Frontmatter title is no longer displayed
- [x] Tags/status badges still render below the filename

## Notes

<!-- 2026-04-23 agent --> Added `filename` field to `TicketMeta` type. Backend populates it with `path.basename(filePath)`. TicketsPanel now shows filename as primary label in both list and detail header, removed redundant id display.
