---
id: T-049
title: "Codex implementation: no streaming, only final message"
type: bug
status: open
priority: high
epic: agents
effort: M
created: 2026-05-05
updated: 2026-05-05
---

The Codex agent implementation does not stream activities — the frontend only receives the final text message once the turn completes. No thinking, tool, or intermediate text activities are streamed during execution.

## Expected

- Thinking activities stream as the model reasons
- Tool activities appear as the model calls tools (file edits, shell commands, etc.)
- Text activities stream token-by-token as the model generates output
- Same streaming UX as the Claude Code implementation

## Actual

- Nothing appears in the feed while the turn is running
- Only the final text message arrives when the turn is done
- No intermediate activities (thinking, tool) are shown at all

## Acceptance

- [ ] Codex turns stream thinking activities in real-time
- [ ] Codex turns stream tool activities as they happen
- [ ] Codex turns stream text output token-by-token
- [ ] Streaming behaviour matches the Claude Code agent implementation

## Notes
