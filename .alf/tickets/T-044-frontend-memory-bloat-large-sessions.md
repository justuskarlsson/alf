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

## Technical Analysis

### Store design (`frontend/src/modules/agents/store.ts`)

The Zustand store keeps the full `turns[]` and `activities[]` arrays in memory for the selected session. When `turnDone` fires, it calls `agent/session/detail` which returns **all** turns and activities for the session and replaces the store arrays wholesale (`set({ turns: res.turns, activities: res.activities })`). For a 50+ turn session with many tool/thinking activities, this can be tens of thousands of activity objects with large `content` strings (tool outputs, code blocks, full thinking traces).

The `appendDelta` action uses string concatenation (`prev.content + delta.content`) which is efficient for the live state. However, each delta triggers a Zustand state update, which triggers a re-render of every subscriber. The `ChatFeed` is `React.memo`-wrapped but receives the full `turns`, `activities`, and `live` arrays/objects as props -- so it re-renders on every delta because `live` changes on every delta.

### Render performance (`frontend/src/modules/agents/AgentsPanel.tsx`)

`buildFeed()` is called on every render of `ChatFeed`. It:
1. Copies and reverses the entire `turns` array
2. For each turn, filters the entire `activities` array (O(turns * activities))
3. Sorts each turn's activities
4. Builds a new `FeedItemData[]` array

This is O(n^2) in the number of activities per session and runs on every delta.

`FeedItem` is `React.memo`-wrapped but keyed by array index (`key={i}`), which defeats memoization when new items are prepended (all indices shift). Additionally, every `text`-type activity renders through `MarkdownRenderer` (react-markdown + remark-gfm + mermaid detection), which parses markdown on every render.

There is **no virtualization** -- all feed items are rendered into the DOM simultaneously. The `flex-col-reverse` CSS layout means the browser must lay out all items to position the scroll. For 50+ turns with many activities, this easily means 200+ DOM nodes with heavy markdown-rendered content.

### No virtualization library in direct dependencies

`react-window` is available as a transitive dependency (via `react-arborist`) but is not used by the agents module. No virtualization is applied to the chat feed.

### Delta streaming path

Deltas arrive via `subscribe("agent/delta", ...)` in `AgentsPanel` and call `appendDelta`. Each delta (which can be as small as a single token) triggers:
1. Zustand `set()` (new `live` object)
2. `ChatView` re-render (selects `live` via `useShallow`)
3. `ChatFeed` re-render (receives new `live` prop)
4. `buildFeed()` recomputation (full O(n^2) scan)
5. Full feed DOM diff

No debouncing or batching of deltas is applied.

### `turnDone` full reload

When a turn completes, `turnDone` fetches the complete session detail from the backend (`agent/session/detail` without `afterTurnIdx`/`afterActivityIdx`). The backend supports incremental fetch via `listSince()` but the frontend never uses it -- it always loads everything. This means the entire activity history is re-transferred and re-stored on every turn completion, doubling memory temporarily during the state transition.

## Files to change

### Primary (frontend)

- `frontend/src/modules/agents/store.ts` -- The core of the fix. Changes needed:
  - Use incremental detail fetch (`afterTurnIdx`/`afterActivityIdx`) in `turnDone` instead of loading all activities every time
  - Consider storing only recent N turns of activities in memory, with older ones paged from backend on scroll
  - Debounce/batch `appendDelta` updates (e.g., coalesce deltas within a 50ms window into a single `set()` call)
  - Track a `lastCoord` in state so incremental fetch knows where to resume

- `frontend/src/modules/agents/AgentsPanel.tsx` -- Render performance fixes:
  - Virtualize the chat feed (add `react-window` as a direct dependency or use a lightweight alternative)
  - Memoize `buildFeed()` with `useMemo` keyed on `[turns, activities, live, pendingPrompt]`
  - Fix `buildFeed()` O(n^2) activity filtering -- pre-index activities by `turn_id` (Map lookup instead of `.filter()` per turn)
  - Use stable keys for `FeedItem` (e.g., activity id or turn id + index) instead of array index
  - Consider lazy-rendering `MarkdownRenderer` only for visible items (virtualization handles this)

- `frontend/package.json` -- Add `react-window` (or `@tanstack/react-virtual`) as a direct dependency for chat feed virtualization

### Secondary (backend -- lower priority, but contributes)

- `backend/src/modules/agents/index.ts` -- The `fanOut` sink calls `push()` for every single token delta. Consider:
  - Batching deltas (e.g., buffer for 50ms then send a combined delta)
  - Or at minimum, documenting that the frontend must handle throttling

- `backend/src/core/agents/index.ts` -- The streaming callback in `runTurnInner` emits `activity_delta` for every token. A batching layer here would reduce WS message volume and frontend update frequency.

### Supporting

- `frontend/src/modules/agents/agents.test.ts` -- Update tests for any store API changes (incremental fetch, batched deltas)

- `frontend/src/shared/MarkdownRenderer.tsx` -- Not strictly required but worth considering: memoize the rendered output or use a lighter-weight renderer for non-visible items if virtualization is not sufficient

## Dependencies

- **T-042 (Agent turn blocks other panels)**: Related but independent. T-042 is about backend event-loop blocking (sync DB writes, `execSync`). T-044 is frontend-focused. However, if T-042 adds delta batching on the backend, that directly reduces the delta volume that causes T-044's render storms. **Recommendation**: solve them in parallel -- T-042 backend batching + T-044 frontend virtualization/memoization.
- **No blocking dependencies**: T-044 can be worked on independently. The backend already supports incremental activity fetch (`afterTurnIdx`/`afterActivityIdx` in `agent/session/detail`) which the frontend simply doesn't use yet.

## Notes
