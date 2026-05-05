---
id: T-042
title: "Agent turn makes other panels sluggish — possible blocking"
type: bug
status: open
priority: high
epic: agents
effort: M
created: 2026-04-30
updated: 2026-04-30
---

While a Claude Code agent turn is running, other panels (git diffs, file viewer) become very slow to load from the backend. Suggests the agent turn may be blocking the event loop or starving other request handlers.

## Context

The agent turn uses the Claude Code SDK via `runTurn()` which calls the impl function. If the impl or its streaming callback is doing synchronous work (e.g., synchronous DB writes via better-sqlite3, heavy delta processing), it could block the Node.js event loop and delay other incoming WS requests.

### Possible causes
- `better-sqlite3` is synchronous — every `dbActivities.create()`, `dbTurns.complete()`, `dbSessions.touch()` blocks the event loop during a turn
- The streaming callback processes many rapid deltas, each doing sync DB writes
- `execSync` in git/files handlers also blocks, but those are quick — the bottleneck is likely the agent turn holding the event loop
- Could also be relay-level: all messages flow through a single WS connection, and heavy delta traffic could congest the pipe

## Acceptance

- [ ] Other panels respond promptly while an agent turn is running
- [ ] No perceptible lag on git diff, file viewer, ticket loading during active turns

## Technical Analysis

### Root cause breakdown

**1. Synchronous DB writes in the hot streaming path (PRIMARY)**

`backend/src/core/agents/index.ts` — `runTurnInner()` calls synchronous `better-sqlite3` methods inside the streaming callback that fires for every SDK event:

- `activity_end` → `dbActivities.create()` — INSERT per completed activity (multiple per turn)
- `turn_done` → `dbTurns.complete()` + `dbSessions.touch()` — two UPDATEs at end of turn
- `session_ready` → `dbSessions.setSdkSessionId()` — UPDATE (once per session)

Each of these blocks the Node.js event loop. During a Claude Code turn with many tool calls, `activity_end` fires dozens of times in rapid succession. While each individual write is fast (~0.1-1ms with WAL), they accumulate and create micro-stalls that delay processing of queued WS messages from other panels.

**2. Single WS connection multiplexing (CONTRIBUTING)**

`backend/src/index.ts` — the backend maintains a single WebSocket connection to the relay. All messages (agent deltas, git diffs, file reads, ticket loads) flow through one `ws.send()` call. During heavy streaming, the send buffer fills with delta messages, and reply messages for other panels queue behind them. The relay itself (`relay/src/index.ts`) is a simple pass-through, so it's not the bottleneck — but the single pipe is.

**3. Synchronous child_process calls in other handlers (SECONDARY)**

While git/files handlers do use `execSync`/`spawnSync`, these are typically fast (<50ms). However, if a git diff request for a large repo coincides with a burst of agent deltas, the sync git call blocks the event loop, preventing delta processing (and vice versa). Key sync calls:

- `backend/src/modules/git/index.ts`: `execSync("git status --porcelain")`, `execSync("git worktree list --porcelain")`, `spawnSync("git", ["diff", ...])` — 6 sync calls total
- `backend/src/modules/files/index.ts`: `execSync("git ls-files")`, `fs.readFileSync()`, `fs.readdirSync()` — 3 sync call patterns
- `backend/src/modules/repos/index.ts`: `fs.readdirSync()` — 1 sync call

**4. No concurrency control or prioritization in dispatch**

`backend/src/core/dispatch.ts` — `dispatch()` calls handlers synchronously and inline. There is no queue, no priority, and no yielding between handlers. A handler that does sync work (DB write, git exec) blocks all other pending messages.

### Recommended approach (incremental, ordered by impact)

1. **Batch/defer DB writes** — Instead of writing to SQLite on every `activity_end`, buffer completed activities in memory and flush them in a single transaction periodically (e.g., every 500ms or on turn_done). This is the highest-impact change. The `activity_end` callback in `runTurnInner` would push to a buffer; a `setInterval` or the `turn_done` event would flush. Uses `better-sqlite3` transactions for batch INSERT.

2. **Throttle delta fan-out** — In `fanOut()` (modules/agents/index.ts), batch rapid deltas and send them as a single WS message on a short interval (e.g., 50-100ms). This reduces WS send pressure on the single connection. The frontend would need to handle batched deltas.

3. **Convert git/files to async** — Replace `execSync`/`spawnSync` with `execFile`/`spawn` (async child_process). Replace `readFileSync`/`readdirSync` with `fs.promises.*`. This is straightforward but lower impact since these calls are individually fast.

4. **Yield between handlers** — Add a `setImmediate` or `queueMicrotask` wrapper in `dispatch()` so each handler runs in its own event loop tick. This prevents one handler's sync work from blocking the next queued message.

Note: WAL mode is already enabled (`_db.pragma("journal_mode = WAL")` in `db/index.ts`), so concurrent reads are not blocked by writes. The issue is that the writes themselves are synchronous calls that block the JS thread, not SQLite-level locking.

### Severity question

The `dbActivities.create()` only fires on `activity_end` (not on every delta) — so it's not firing hundreds of times per second. A typical turn might have 5-15 activities (thinking, tool calls, text). Each sync INSERT with WAL takes ~0.1-1ms. So the total blocking from DB writes alone is maybe 5-15ms per turn — **this alone shouldn't cause perceptible sluggishness**.

The real culprit may be the **combination**: sync DB writes + sync git/files handlers + single WS pipe congestion from delta fan-out. Or the `execSync` git calls (which can take 50-500ms for large repos) coinciding with a burst of deltas. Consider:

1. **Async alternative to better-sqlite3**: Libraries like `better-sqlite3-worker-thread` or `sql.js` (WASM) run in a worker. But `better-sqlite3`'s sync API is actually a feature — it avoids callback complexity. The real fix may be simpler: just **don't block on the critical path**.
2. **Simplest fix**: Move DB writes to `setImmediate()` callbacks so they yield between ticks. The write is still sync when it runs, but it doesn't block the current message dispatch. Practically: wrap `dbActivities.create()` in `setImmediate(() => ...)` inside the streaming callback.
3. **git/files async conversion**: This is likely higher impact than DB batching. A `git diff` on a large repo via `spawnSync` blocks for 100-500ms — much worse than a 1ms INSERT.

## Files to change

| File | Change |
|------|--------|
| `backend/src/core/agents/index.ts` | Buffer activity writes; flush in batches via transaction on interval/turn_done. Convert inline `dbActivities.create()` calls to deferred buffer push. |
| `backend/src/core/db/index.ts` | Add a `dbActivities.createBatch()` method that inserts multiple activities in a single transaction. |
| `backend/src/modules/agents/index.ts` | Throttle `fanOut()` — batch rapid deltas into fewer WS sends. Consider coalescing deltas per subscriber on a short timer. |
| `backend/src/core/dispatch.ts` | Wrap handler invocation in `setImmediate()` so handlers yield between ticks and don't block each other. |
| `backend/src/modules/git/index.ts` | Replace `execSync`/`spawnSync` with async `execFile`/`spawn`. Change handlers to async. (Lower priority — can be a follow-up.) |
| `backend/src/modules/files/index.ts` | Replace `execSync` and `fs.readFileSync`/`readdirSync` with async equivalents. Change handlers to async. (Lower priority — can be a follow-up.) |

## Dependencies

| Ticket | Relationship | Notes |
|--------|-------------|-------|
| T-044 (Frontend memory bloat) | **Related** | T-044 is the frontend side of the same symptom. Backend delta throttling (this ticket) will partially help T-044 by reducing the rate of state updates. But T-044's core fix (virtualization, store trimming) is independent. |
| T-041 (Persist context usage) | **No conflict** | T-041 adds a column to turns table and a write on turn_done. If T-042 batches DB writes, T-041's write should be included in the batch flush. Implement T-042 first or coordinate. |

## Notes
