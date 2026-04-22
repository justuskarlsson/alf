---
id: T-017
title: Agent implementation & model selector
type: feature
status: done
priority: medium
epic: agents
effort: S
created: 2026-04-21
updated: 2026-04-22
---

Add a frontend control to choose which agent implementation (test, claude-code, codex) and optionally which model a session uses. Currently the backend supports `impl` on `agent/session/create` and `agent/message`, but the frontend always uses the default.

## Requirements
- Dropdown or selector in the agents panel to pick implementation (test, claude-code, codex)
- Optionally a model selector (for LLM-backed impls)
- Selection sent with `agent/session/create` and/or `agent/message`
- Session should display which impl it's using
- Backend already supports `impl` param — this is purely frontend + wiring

## Design considerations
- Where to place the control: in the chat input bar? In a session settings panel? In the PanelHeader?
- Should impl be per-session (set at creation) or per-message (changeable mid-conversation)?
- Model list could be hardcoded initially, or fetched from backend
