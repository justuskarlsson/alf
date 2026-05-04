---
id: T-044
title: "Frontend memory bloat & lag on large agent sessions (~6 GB RAM)"
type: bug
status: open
priority: high
epic: agents
effort: M
related: T-042
created: 2026-05-04
updated: 2026-05-04
---

When an agent conversation/session grows large, the frontend's RAM usage balloons to ~6 GB and streaming updates feel sluggish. Primarily a frontend issue, though backend contribution hasn't been fully ruled out.

## Context

Observed during long-running agent sessions. The browser tab's memory climbs to ~6 GB, and updating the streaming session visibly lags. This is likely caused by accumulating all turn/activity/delta data in the Zustand store and re-rendering large chat histories on every streaming update.

Related to T-042 (agent turn blocks other panels), which focuses on backend event-loop blocking. This ticket focuses on the **frontend side**: memory management, store bloat, and render performance.

### Likely causes (frontend)
- All deltas/activities for the entire session kept in memory in the agent store — never trimmed or virtualized
- Every streaming delta triggers a state update → full re-render of the conversation view
- Large text blobs (tool outputs, code blocks) stored as strings in state, duplicated across render cycles
- No virtualization on the message list — all messages are in the DOM simultaneously

### Possible causes (backend — lower probability)
- Streaming too many granular deltas instead of batching/throttling
- Session detail response includes full history on every reconnect, duplicating what's already in memory

## Acceptance

- [ ] Frontend RAM stays under ~1 GB for sessions with 50+ turns
- [ ] Streaming updates remain responsive (no visible lag) in large sessions
- [ ] Profiled and identified the top memory consumers (React DevTools / Chrome heap snapshot)
- [ ] Message list uses virtualization or pagination for long conversations

## Notes
