---
id: T-039
title: "Files panel sometimes empty (not after refresh)"
type: bug
status: open
priority: medium
epic: files
effort: S
created: 2026-04-29
updated: 2026-04-29
---

The FILES section in the file panel sometimes shows empty — no file tree. Does NOT happen on fresh page load, only after some interaction (switching repos? switching panels? collapsing/expanding?).

## Context

Observed in screenshot: STARRED section shows files normally, but FILES section below is completely empty. Likely a state/fetch issue where `files/list` isn't re-fetched or the tree data is cleared during a transition.

### Possible causes
- Repo switch doesn't re-trigger `files/list` fetch for the files tree
- Panel add/remove causes the file panel to remount without re-fetching
- Race condition between `globalStore.repo` change and the panel's `useOnConnect` / `usePanelInit`
- The `key={repo}` pattern on RepoRoute should force remount, but maybe the files panel isn't keyed properly

## Acceptance

- [ ] Files tree always populated when a repo is selected
- [ ] Switching repos loads the new repo's file tree
- [ ] Adding/removing other panels doesn't clear the file tree

## Diagnostic findings

### Root cause

The `listFiles` action in the files store (`frontend/src/modules/files/store.ts`) **eagerly clears `files: []`** before sending the async `files/list` request. If the response is silently dropped — which happens when `useScopedRequest` detects the component has unmounted (`aliveRef.current === false`) — the store is stuck at `files: []` permanently. The `FilesSidebar` renders `<EmptyState message="Loading…" />` whenever `files.length === 0`.

The scoped request intentionally drops responses for unmounted components (to prevent stale writes), but the consequence is that neither `.then` nor `.catch` fires — the promise hangs forever. Since `listFiles` already cleared the store synchronously, there is no recovery path.

### Triggers

1. **React StrictMode double-invoke**: Effects mount → cleanup → remount. The first mount's `usePanelInit` fires `listFiles` (clearing the store), but its scoped request is invalidated by cleanup (`aliveRef.current = false`). The second mount re-triggers `listFiles` and should recover — but if the effect ordering or timing is unlucky (e.g., response from first request arrives during cleanup phase), the clear-then-drop sequence can leave the store empty until the second response arrives. Intermittent timing issue. **Note:** Originally thought to be dev-only (StrictMode), but this bug also reproduces in production — so the double-invoke is just one trigger, not the root cause.

2. **Layout/preset switching**: `initForRepo` or `loadPreset` in dashboardStore can replace the `panels` array. If the new panels have different IDs than the current ones, `FilesPanel` unmounts (invalidating its scoped request mid-flight) and remounts. The remounted panel calls `listFiles` again, but there is a window where the first request's response is dropped after files were already cleared.

3. **Panel remove + re-add**: Removing the files panel unmounts it (invalidating scoped request). Adding it back triggers `usePanelInit` on the new instance. The files store was cleared by the first instance's `listFiles` and never repopulated.

4. **`CollapsibleSection` collapse/expand**: The `<Tree>` component inside the "Files" collapsible section unmounts when collapsed and remounts when expanded. The `ResizeObserver` in `FilesSidebar` is set up in a `useEffect([])` that won't re-run, so the observer points to a stale DOM element after re-expand. This is a separate minor layout issue (stale height) but not the primary cause of empty files.

### Why page refresh fixes it but panel refresh does NOT

A full **page refresh** works because it resets all JS state (stores, relay connection) from scratch — clean mount, clean fetch. However the `PanelCard` **refresh button** (which increments `refreshKey` to remount children) does NOT fix it. This contradicts the initial theory that a fresh `usePanelInit` → `useOnConnect` → `listFiles` cycle is sufficient. Possible explanations:

- The files store state (`files: []`) persists across the panel remount because the Zustand store is module-scoped (not per-panel-instance). The remounted panel calls `listFiles` which again eagerly clears `files: []` — but the response may still get dropped if the underlying relay connection or scoped request has a stale reference.
- The `useScopedRequest` hook creates a new `aliveRef` on remount, but the store's `request` function reference may be stale (captured in a closure from the previous mount cycle).
- The relay subscription or `onConnect` callback registry may not fire for a panel-level remount since the relay connection itself didn't change.

**This narrows the root cause**: it's not just about component lifecycle — the Zustand store's eagerly-cleared state + a broken recovery path is the core issue. The store must not clear data until new data arrives.

## Files to change

1. **`frontend/src/modules/files/store.ts`** — The `listFiles` action must not eagerly clear `files: []` before the async fetch. Options:
   - Add a `loading` flag instead of clearing data, so stale files remain visible until new ones arrive.
   - Set `files` only on successful response, not before the request.
   - Add `.catch` recovery that restores previous files if the request fails.

2. **`frontend/src/core/useScopedRequest.ts`** — The scoped request silently swallows both resolve and reject when the component is unmounted, leaving the promise hanging forever. Consider rejecting with a cancellation error instead of silently dropping, so callers' `.catch` handlers can detect and handle it (e.g., the store could restore previous state on cancellation).

3. **`frontend/src/modules/files/FilesPanel.tsx`** — (Minor) The `ResizeObserver` in `FilesSidebar` and `StarredSection` is attached in `useEffect([])` and never re-attached if the observed element unmounts and remounts (e.g., via `CollapsibleSection` toggle). This causes stale tree height after collapse/expand. Consider using a `ref` callback or a `MutationObserver` to handle re-attachment.

4. **`frontend/src/core/usePanelInit.ts`** — (Optional) Consider adding a retry mechanism or fallback when the scoped request drops silently, so panels don't end up in a permanently stale state.

## Dependencies

- **T-042 (Agent turn blocks other requests)**: If agent turns block the backend event loop, `files/list` responses may be delayed long enough for components to unmount before responses arrive, exacerbating this race condition.
- **T-030 (Panel refresh button)**: Already done. The refresh button is the current workaround for this bug.
- **T-040 (File outline panel)**: No dependency, but any fix to the files store or `usePanelInit` pattern will affect T-040's implementation since it shares the same module.

## Notes

<!-- 2026-04-29T09:00Z agent:alfred --> Filed from screenshot. Needs investigation — reproduce first, then trace the fetch lifecycle.
