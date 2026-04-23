---
id: T-023
title: Ticket content view background cuts off early
type: bug
status: open
priority: medium
epic: tickets
effort: S
created: 2026-04-23
updated: 2026-04-23
---

In the ticket content/detail view, the darker background of the markdown area doesn't extend to the bottom of the panel — it cuts off where the content ends, exposing the panel background beneath.

## Context

The content container likely needs `min-h-full` or `flex-1` so the background fills the remaining vertical space regardless of content length.

## Acceptance

- [ ] Content area background extends to the bottom of the panel
- [ ] Still scrolls correctly when content overflows

## Notes
