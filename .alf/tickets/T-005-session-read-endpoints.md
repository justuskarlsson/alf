---
id: T-005
title: agent/overview + agent/detail — session read and replay
type: feature
status: open
priority: high
epic: agents
effort: M
created: 2026-04-15
updated: 2026-04-15
---

Implement the read-side endpoints for agent sessions: `agent/overview` (list sessions) and `agent/detail` (full turn/activity history + replay catch-up).

## Context

From the sketch (right-hand side):
```
agent/overview
agent/detail        Frontend
                    - info on session
Core               - overview (session list)
  ↑               - detail (turns + last activity)
  select max activity_idx
  Replay: what is missing → turn ids + activities
```

Two distinct concerns:

**`agent/overview`**: List sessions for a repo. Returns session metadata (id, title, last updated, last activity snippet). Used by the frontend session list panel.

**`agent/detail`**: Full history for one session. Returns all turns + activities. Also supports *replay*: the frontend sends `{ lastActivityIdx: N }` and core queries "select max activity_idx > N" to return only what's missing. This handles reconnect catch-up — the frontend gets just the delta since it last synced, not the whole history.

This is the complement to the live stream (T-004): stream = future deltas, detail = past history.

## Acceptance

- [ ] `agent/overview` returns sessions for a repo, sorted by last updated
- [ ] `agent/detail` returns full turn + activity list for a session
- [ ] Replay mode: `{ sessionId, lastActivityIdx }` → only activities with idx > lastActivityIdx
- [ ] Response shape consistent with the Activity types from core
- [ ] Frontend can bootstrap from detail + subscribe to stream without duplication

## Notes

<!-- 2026-04-15T00:00Z agent:alfred -->
RESOLVED: Sessions scoped to repo — `sessions.repo_id` FK.
RESOLVED: Default title is a placeholder (e.g. "New session"). User can rename anytime. Auto-generation from first prompt is a future nice-to-have, not MVP3.
