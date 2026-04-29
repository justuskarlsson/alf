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

## Notes

<!-- 2026-04-29T09:00Z agent:alfred --> Filed from screenshot. Needs investigation — reproduce first, then trace the fetch lifecycle.
