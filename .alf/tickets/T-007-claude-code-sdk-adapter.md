---
id: T-007
title: Claude Code SDK adapter — production agent implementation
type: feature
status: open
priority: medium
epic: agents
effort: M
created: 2026-04-15
updated: 2026-04-15
---

Implement the Claude Code Agent SDK adapter as the first production impl, wiring the SDK's streaming events into the impl interface defined in T-002.

## Context

From INDEX.md:
> claude code agent sdk — We will share a lot of logic between using different implementations, that's why we have a shared core logic that's abstracted for the specific vendor implementations. We can think of the implementation as a lightweight adapter, mostly plumbing.

The Claude Code SDK emits events like `thinking_start`, `thinking_delta`, `text_start`, `text_delta`, `tool_use_start`, etc. The adapter maps these to our `Activity` types and feeds them into core via the `onDelta` callback.

The INDEX.md also mentions wanting to add a Codex SDK adapter later — keeping the adapter boundary clean here makes that straightforward.

Key considerations:
- System prompt location: `infra/` per INDEX.md convention
- API key via env (never hardcoded)
- Repo working directory passed to the SDK session
- Tool access: for now, standard claude code tools; later maybe restricted set for orchestrate mode

Depends on T-002 (impl interface), T-003 (test impl as reference), and T-001 (DAL, for session continuity).

## Acceptance

- [ ] `implementations/claude-code.ts` implements the impl interface
- [ ] SDK streaming events mapped to Activity deltas correctly
- [ ] System prompt loaded from `infra/prompts/` (path configurable)
- [ ] API key read from env
- [ ] Selectable via `impl: "claude-code"` in `agent/message`
- [ ] Smoke-tested manually against a real repo

## Notes

<!-- 2026-04-15T00:00Z agent:alfred -->
RESOLVED: Session continuity via SDK's own session ID. On first message core creates a new SDK session and stores the returned `sdk_session_id` in `sessions` table. On subsequent messages, pass `sdk_session_id` back — SDK maintains its own history. SQLite is for multi-client visibility, not context reconstruction.
RESOLVED: Working directory = target repo (from repo param in request).
Q: Which claude-code agent SDK package name / version to install?
