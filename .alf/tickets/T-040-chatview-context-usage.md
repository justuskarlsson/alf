---
id: T-040
title: Show context window usage in ChatView
type: feature
status: done
priority: medium
epic: agents
effort: M
created: 2026-04-29
updated: 2026-04-29
resolved: 2026-04-29
---

Display the current session's context usage (tokens used / total context window size) in ChatView so the user can see how much of the context window has been consumed.

## Context

When chatting with an agent, users have no visibility into how much of the context window is consumed. Showing a usage indicator (e.g. "45k / 200k tokens") helps users decide when to start a new session or compact context.

## Acceptance

- [ ] ChatView displays current context usage for the active session (used tokens / max tokens)
- [ ] Updates live as new turns are added
- [ ] Visually unobtrusive — small bar or label, not blocking chat content

## Notes

