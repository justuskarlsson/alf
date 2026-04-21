---
id: T-011
title: Session UX — title prompt on create + double-click rename
type: feature
status: done
priority: medium
epic: agents
effort: S
created: 2026-04-21
updated: 2026-04-21
---

Two small UX improvements to session title management: prompt for a name at creation time, and allow renaming via double-click.

## Context

### 1. Title prompt on create

Currently "+ new" creates a session immediately with title "New Session". In practice a title is almost always desired right away. Proposal: show a native `window.prompt("Session title:", "")` when "+ new" is clicked. If the user cancels (ESC / null) fall back to "New Session". This keeps the implementation trivial (no extra UI state) while covering the common case.

### 2. Double-click to rename

`SessionRow` should support double-click to enter inline edit mode: the title `<div>` becomes an `<input>` pre-filled with the current title. Enter confirms, Escape cancels. On confirm, send a new `agent/session/rename` message to the backend which updates the `title` column in the DB and replies with the updated session.

Backend will need a new `@handle("agent/session/rename")` handler and a `renameSession(id, title)` DB helper.

## Acceptance

- [ ] "+ new" button shows `window.prompt` for title; ESC/empty → "New Session"
- [ ] `SessionRow` double-click enters inline edit (controlled `<input>`)
- [ ] Enter key / blur confirms; Escape cancels without saving
- [ ] Backend: `agent/session/rename` handler updates DB, replies `{ type: "agent/session/rename", session: AgentSession }`
- [ ] Frontend store: `renameSession(id, title, request)` action; updates `sessions` list on reply
- [ ] Shared type: `AgentRenameMsg`

## Notes

<!-- 2026-04-21T00:00Z user --> Raised because title is wanted 99% of the time on create. Double-click rename requested for post-create edits.
