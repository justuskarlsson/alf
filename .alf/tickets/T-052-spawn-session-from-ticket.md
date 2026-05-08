---
id: T-052
title: Spawn agent sessions from tickets
type: feature
status: done
priority: medium
epic: agents
effort: L
created: 2026-05-06
updated: 2026-05-08
---

Allow users to spawn a new agent session directly from a ticket. A plus/play button on the ticket view creates a session with a template prompt that references the ticket. Sessions and tickets are linked bidirectionally.

## Context

When looking at a ticket, users should be able to kick off an agent session in one click. The session gets a pre-filled prompt based on the ticket title/description and a reference to the ticket ID. The link is stored in the ticket's YAML frontmatter (e.g. `session: <session-id>`) so it can be:
- Automatically added when the user clicks the button
- Shown in the ticket view if a session is already assigned

From the ticket list/detail, users can see at a glance which tickets have active agent sessions.

## Acceptance

- [ ] Plus/play button on ticket view to spawn a new agent session
- [ ] New session gets a template prompt referencing the ticket (id, title, summary)
- [ ] Session ID is written to ticket YAML frontmatter (`session` field)
- [ ] Ticket view shows linked session if frontmatter has `session` set
- [ ] Clicking the session link navigates to that session

## Notes
