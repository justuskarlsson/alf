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

`AgentSessionsPanel` layout mirrors `FileListPanel`: sidebar list on the left, main content view on the right. New session button lives in this panel. Take inspiration from FileList for the split-pane structure.

Activity rendering (see nanoclaw-dev/alf-desktop for reference):
- Stack order: newest activity on top
- All types visible: thinking (uncollapsed by default), tool (short formatted text), text (normal)

## Acceptance

- [ ] `AgentSessionsPanel`: sidebar session list + main content view (mirrors FileList layout)
- [ ] New session button in sessions panel
- [ ] `AgentChatPanel` renders full history on mount (via `agent/detail`)
- [ ] Live streaming: new deltas stack on top as they arrive
- [ ] All activity types rendered: text normal, thinking uncollapsed, tool as short summary
- [ ] Input form: textarea + send button, disabled while turn is running
- [ ] Both panels registered in PANEL_TYPES
- [ ] No `useEffect` with deps — all reactive via store actions and useOnConnect

## Notes

<!-- 2026-04-15T00:00Z agent:alfred -->
RESOLVED: All activity types visible, newest on top. Thinking uncollapsed by default. See nanoclaw-dev/alf-desktop for the exact pattern.
RESOLVED: New session button in AgentSessionsPanel, not global.
RESOLVED: Sessions panel layout = FileList-style split pane (sidebar + main content).
