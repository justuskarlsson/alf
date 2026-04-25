---
id: T-031
title: Session list sorting, relative timestamps, and unread indicator
type: feature
status: done
priority: medium
epic: agents
effort: M
created: 2026-04-25
updated: 2026-04-25
resolved: 2026-04-25
---

Three improvements to the agents panel session list:

1. **Sort by latest activity** — currently seems to sort by last final message only. Should sort by any activity (including streaming/in-progress turns), so active sessions float to top.
2. **Relative timestamps** — replace static date with dynamic "5 minutes ago" / "2 hours ago" style. Use a lightweight relative-time formatter (e.g. `date-fns/formatDistanceToNow` or a small custom helper — avoid pulling in all of moment.js).
3. **Unread indicator** — show a dot or badge on sessions that have new activity since the user last viewed them. Needs a lightweight "last seen" timestamp per session stored client-side (zustand state or localStorage).

## Acceptance

- [ ] Session list sorted by most recent activity (not just final message)
- [ ] Timestamps show relative time ("just now", "5m ago", "2h ago", etc.)
- [ ] Relative time updates periodically (e.g. every 30s) without re-fetching
- [ ] Unread indicator on sessions with new activity since last viewed
- [ ] Viewing a session clears its unread state

## Notes
