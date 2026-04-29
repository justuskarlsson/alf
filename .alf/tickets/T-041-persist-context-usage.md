---
id: T-041
title: Persist per-turn token usage for context window tracking
type: feature
status: open
priority: medium
epic: agents
effort: M
created: 2026-04-29
updated: 2026-04-29
---

Persist token usage data per turn so context window usage survives page refresh and can be reconstructed from history.

## Context

T-040 added a live context usage indicator in ChatView, but it only shows data from the latest turn's completion event — lost on refresh. To show accurate usage after reload, we need to store token counts in the DB and return them with session detail.

## Acceptance

- [ ] DB schema: add `input_tokens`, `output_tokens`, `context_window` columns to the `turns` table (migration)
- [ ] `runTurnInner` persists usage to the turn row when `turn_done` fires
- [ ] `agent/session/detail` response includes usage from the latest completed turn
- [ ] Frontend restores `contextUsage` from detail response on session select / page load
- [ ] Test impl populates mock usage in DB

## Notes

- `modelUsage.inputTokens` from the SDK result is cumulative across all API iterations within one turn — for multi-tool turns this overestimates the actual context fill. Acceptable for now; a future improvement could use `getContextUsage()` control message for exact data.
