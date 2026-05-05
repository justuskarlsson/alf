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

## SDK Context Usage Research

_Researched 2026-05-05 against SDK v0.2.117 (latest available: v0.2.128)._

### 1. `getContextUsage()` — dedicated SDK method exists

The `Query` object returned by `query()` exposes a `getContextUsage()` control method (added in v0.2.86). It returns an `SDKControlGetContextUsageResponse` with a full per-category breakdown of context window usage:

```typescript
interface SDKControlGetContextUsageResponse {
  categories: { name: string; tokens: number; color: string; isDeferred?: boolean }[];
  totalTokens: number;       // current tokens in context
  maxTokens: number;         // effective context window limit
  rawMaxTokens: number;      // model's raw limit (before autocompact buffer)
  percentage: number;        // totalTokens / maxTokens * 100
  model: string;
  isAutoCompactEnabled: boolean;
  autoCompactThreshold?: number;
  messageBreakdown?: {       // per-message-type token counts
    toolCallTokens: number;
    toolResultTokens: number;
    attachmentTokens: number;
    assistantMessageTokens: number;
    userMessageTokens: number;
    redirectedContextTokens: number;
    unattributedTokens: number;
    toolCallsByType: { name: string; callTokens: number; resultTokens: number }[];
    attachmentsByType: { name: string; tokens: number }[];
  };
  apiUsage: {                // cumulative API-level usage
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  } | null;
  memoryFiles: { path: string; type: string; tokens: number }[];
  mcpTools: { name: string; serverName: string; tokens: number; isLoaded?: boolean }[];
  // ... plus deferredBuiltinTools, systemTools, systemPromptSections, agents, slashCommands, skills
}
```

This is a **control request** (not a streaming event) — it can be called on the live `Query` object while the async generator is still open. It is the SDK equivalent of the `/context` slash command in Claude Code.

### 2. `modelUsage` on the result message — what we use today

The current implementation extracts from `result.modelUsage[model]`:
- `inputTokens` / `outputTokens` — **cumulative across all API steps within the single `query()` call** (i.e. one turn). For multi-tool turns where the model calls tools and loops multiple times, these are the **summed** input/output tokens across all API round-trips, not a snapshot of context fill.
- `contextWindow` — the model's context window size (e.g. 200000). This is a static model property, not turn-dependent.

**Key insight**: `inputTokens` from `modelUsage` is the **sum of all per-step input_tokens**, not the actual context fill level at the end of the turn. For a turn with 3 tool-use iterations, each step re-sends the full conversation + tool results, so cumulative `inputTokens` can be ~3x the actual context fill. The current code computes `contextTokens = inputTokens + outputTokens`, which overestimates for multi-step turns.

The result message also has a top-level `usage: NonNullableUsage` with `input_tokens` / `output_tokens` (same cumulative semantics) and `total_cost_usd`.

### 3. Per-step assistant message usage

Each `SDKAssistantMessage` carries `message.usage.input_tokens` for that specific API call. The **last** assistant message's `input_tokens` would be the closest proxy for actual context fill at turn end, since it reflects the full conversation sent in the final API call. However, this requires tracking and deduplicating by message ID (parallel tool calls share the same ID).

### 4. No session-level accumulation

The SDK does **not** provide session-level cumulative usage. Each `query()` call (one turn) reports its own usage independently. If you need cross-turn accumulation, you must store and sum yourself — which is exactly what T-041 does.

### 5. Recommendation

**Short-term (T-041):** Keep the current `modelUsage`-based approach. It is the simplest path and the overestimation from cumulative `inputTokens` is acceptable for a progress indicator. The `contextWindow` field is reliable (static model property). Store `inputTokens + outputTokens` as `context_tokens` and `contextWindow` as `max_context_tokens` in the DB.

**Medium-term improvement:** After the turn completes (but before the `Query` generator is closed), call `getContextUsage()` to get the exact `totalTokens` / `maxTokens`. This gives the true context fill level and avoids the multi-step overestimation problem. Implementation sketch:

```typescript
// After the for-await loop ends but before returning:
const ctxUsage = await queryHandle.getContextUsage();
// ctxUsage.totalTokens = actual context fill
// ctxUsage.maxTokens = effective limit (after autocompact buffer)
```

This requires holding onto the `Query` object reference (currently discarded after iteration in `claudeCodeImpl`). The change is small: capture the `query()` return value, iterate it, then call `getContextUsage()` after the loop.

**Note on SDK version:** The project is on v0.2.117, and `getContextUsage()` has been available since v0.2.86, so no upgrade is needed. However, v0.2.128 is the latest — consider upgrading for bug fixes and Opus 4.7 support.

## Files to change

### Backend — DB layer (`backend/src/core/db/`)

- **`migrations/003_context_usage.sql`** (new file)
  Add `input_tokens INTEGER`, `output_tokens INTEGER`, `context_window INTEGER` columns to the `turns` table via `ALTER TABLE`.

- **`index.ts`**
  - Add `input_tokens`, `output_tokens`, `context_window` to the `Turn` interface (line ~55).
  - Update `dbTurns.complete(id)` to accept and persist usage data (`input_tokens`, `output_tokens`, `context_window`) alongside `completed_at`.
  - Register `003_context_usage.sql` in the `runMigrations()` file list (line ~308).
  - Update the fork INSERT in `dbSessions.fork()` (line ~148) to copy the new turn columns when duplicating turns.

### Backend — Agent core (`backend/src/core/agents/`)

- **`index.ts`**
  - In `runTurnInner`, when `turn_done` fires (line ~130), call the updated `dbTurns.complete()` with the usage data from the event. Currently `dbTurns.complete(turn.id)` is called without usage; change to pass `turnUsage` so the token counts are persisted.

### Backend — Agent module (`backend/src/modules/agents/index.ts`)

- **`index.ts`**
  - In `agent/session/detail` handler (line ~188): derive `contextUsage` from the latest completed turn's `input_tokens`, `output_tokens`, `context_window` columns and include it in the reply. The turn rows already come from `dbTurns.list()` which will now carry the new columns, but the handler should extract and return a top-level `contextUsage` field for convenience.

### Shared types (`shared/types/index.ts`)

- **`index.ts`**
  - Add `input_tokens`, `output_tokens`, `context_window` (all `number | null`) to the `AgentTurn` interface so the frontend can see usage per turn if needed.

### Frontend — Agent store (`frontend/src/modules/agents/store.ts`)

- **`store.ts`**
  - Update `DetailResponse` interface to include `contextUsage?: ContextUsage | null`.
  - In `selectSession()`: after the detail response resolves, set `contextUsage` from the response so usage is restored on session select / page load.
  - In `turnDone()`: the detail reload should also restore `contextUsage` from the response (currently it only sets `turns` and `activities`).

### Frontend — Agent panel (`frontend/src/modules/agents/AgentsPanel.tsx`)

- No changes strictly required. The `ContextUsageIndicator` component and its plumbing in `ChatView` already exist and read from `contextUsage` in the store. Once the store restores usage from detail responses, the indicator will work after reload automatically.

### Tests

- **`backend/src/core/db/db.test.ts`** — Add a test verifying `dbTurns.complete()` persists usage columns and that they are returned by `dbTurns.list()`.
- **`backend/src/core/agents/agents.test.ts`** — Add a test verifying that after `runTurn` with the test impl, the completed turn row has `input_tokens`, `output_tokens`, `context_window` populated (12000, 0/implied, 200000 from test impl).
- **`tests/e2e/agents.spec.ts`** — (optional) Add a test that sends a message, reloads the page, re-selects the session, and verifies `[data-testid="context-usage"]` is visible.

### No changes needed

- **`backend/src/modules/agents/implementations/test.ts`** — Already emits `usage: { contextTokens: 12_000, maxContextTokens: 200_000 }` in `turn_done`. The `ContextUsage` type uses `contextTokens` / `maxContextTokens`, but the DB columns are `input_tokens` / `output_tokens` / `context_window`. The mapping from ContextUsage to DB columns happens in `dbTurns.complete()` — test impl needs no changes.
- **`backend/src/modules/agents/implementations/claude-code.ts`** — Already constructs and emits `ContextUsage` in `turn_done`. No changes needed.
- **`backend/src/core/agents/types.ts`** — `ContextUsage`, `TurnResult`, and `ActivityEvent` already have the right shape. No changes needed.

## Dependencies

- **Depends on (done):** T-040 (Show context window usage in ChatView) — provides the live `ContextUsage` type, store field, and `ContextUsageIndicator` component that T-041 builds upon.
- **Blocks:** None identified. T-042 (agent turn blocks other requests) and T-044 (frontend memory bloat) are independent.
- **Note on duplicate IDs:** There is another T-041 ticket (`T-041-image-preview-broken.md`, status: done, epic: files) with the same ID but a different slug. Consider renumbering one of them to avoid confusion.

## Notes

- `modelUsage.inputTokens` from the SDK result is cumulative across all API iterations within one turn — for multi-tool turns this overestimates the actual context fill. Acceptable for now; see "SDK Context Usage Research" section above for the `getContextUsage()` alternative.
- `getContextUsage()` is a control method on the `Query` object (available since SDK v0.2.86, present in our v0.2.117). It returns exact context fill (`totalTokens` / `maxTokens`) with per-category breakdown. Use this as a follow-up improvement after T-041 ships.
