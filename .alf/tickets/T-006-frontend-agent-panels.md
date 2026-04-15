---
id: T-006
title: Frontend agent panels — chat UI and session list
type: feature
status: open
priority: medium
epic: agents
effort: L
created: 2026-04-15
updated: 2026-04-15
---

Build the frontend panels for the agent feature: a session list panel and a chat/streaming panel. These are the primary user-facing deliverables of MVP3.

## Context

Two panels to add to the dashboard:

**SessionList panel** (`agent-sessions`):
- Lists sessions for the current repo (fetched via `agent/overview`)
- Click to open a session in the Chat panel
- Shows last activity snippet + timestamp

**Chat panel** (`agent-chat`):
- Text input to send a message (`agent/message`)
- Streaming display: renders activities as they arrive via `agent/stream`
- Activity types rendered differently: text (normal), thinking (collapsed/dim), tool (code block or badge)
- On mount: fetches history via `agent/detail` (catch-up), then subscribes to live stream
- Smooth scroll to bottom on new content

Architecture follows existing panel conventions:
- `agentStore.ts` in `frontend/src/modules/agents/`
- `useOnConnect` for initial data fetch, `request` passed at call time (never stored)
- Panel registered in `PANEL_TYPES` in `dashboardStore.ts`
- `key={sessionId}` on the chat panel forces re-mount on session switch

## Acceptance

- [ ] `AgentSessionsPanel` lists sessions, selects one
- [ ] `AgentChatPanel` renders full history on mount
- [ ] Live streaming: new deltas appended as they arrive
- [ ] Thinking activities collapsible (hidden by default, expandable)
- [ ] Input form: textarea + send button, disabled while turn is running
- [ ] Both panels registered in PANEL_TYPES
- [ ] No `useEffect` with deps — all reactive via store actions and useOnConnect

## Notes

<!-- 2026-04-15T00:00Z agent:alfred -->
Q: Should the chat panel also display tool activities? If yes, what's the preferred rendering (raw JSON, formatted, or just a badge showing tool name)?
Q: New session button — where? In the sessions panel, or a global action?
