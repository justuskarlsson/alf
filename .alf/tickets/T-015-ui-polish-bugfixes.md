# T-015 UI polish & bug fixes

## Status: open

## Epic: maintenance

## Summary
Bundle of UI bugs and polish items found during manual testing across all panels.

## Items

### Agents Panel
1. **Focus input on session select/create** — clicking a session or creating a new one should auto-focus the textarea
2. **Send button alignment** — send button should be vertically centered / same height as the text input
3. **Markdown rendering for text activities** — render finished text activities as markdown (not thinking or in-progress deltas)
4. **Streaming UI updates** — UI doesn't visually update as deltas arrive; need to verify reactive rendering of incremental content
5. **Implementation & model selector** — add dropdown to choose agent implementation (test, claude-code, codex) and optionally model, sent with session create or message

### Files Panel
6. **Starred directories → tree structure** — starring a directory should show its contents as a collapsible tree (like the files section), not a flat entry

### Tickets Panel
7. **Default filter: hide done tickets** — tickets with status "done" should be hidden by default
8. **Filter controls UI** — add a toggle/filter bar to show/hide done tickets (and potentially other filters)

### Shared
9. **Panel header/controls primitive** — extract the agents sidebar header pattern (title + action button) into a reusable `PanelHeader` component usable by tickets, git, etc.

### Git Panel
10. **Sidebar scroll for large diff lists** — diff file list should scroll when it overflows, not clip

## Approach
- E2E tests first (for testable items), then implement fixes, then verify.
- Update test agent implementation to support configurable word-by-word streaming delay for item 4.
