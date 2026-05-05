---
id: T-046
title: "Sprint post-fixes — small UI/UX issues"
type: task
status: done
priority: medium
epic: ui
effort: M
created: 2026-05-05
updated: 2026-05-05
closed: 2026-05-05
---

Collection of small fixes and improvements found during post-sprint review.

## Items

### 1. File outline → sidebar integration
- Move the file outline (T-040) into the **sidebar** alongside starred files and the file tree, rather than a separate panel
- Show **line numbers** next to each symbol in the outline

### 2. Line numbers in file/code preview
- Show line numbers in the file content preview panel

### 3. Sidebar collapsible sections (general)
- Make collapsible sections a core sidebar primitive (not per-module)
- Fix layout issues when multiple sections are open — they can overflow or fight for space
- Sections should share vertical space gracefully (e.g. flex with min-heights, or accordion-style)

### 4. Collapsing sections loses data
- When collapsing a sidebar section (files, starred) and re-expanding it, the content is gone — state is wiped
- The collapsible component currently unmounts children — **fix by keeping children mounted and toggling visibility via CSS**
- Do NOT unmount; just hide with `hidden` / `display:none` or `h-0 overflow-hidden`

### 5. Outline scroll → highlight animation
- When clicking an outline symbol and scrolling to that line, add a brief highlight/flash animation on the target line so the user can visually locate it
- E.g. a yellow/amber background fade-out over ~1s

### 6. Agent feed: collapse non-text activities by default
- Once a turn is **done**, only show `text` activities in the feed (all of them, not just the last)
- `thinking` and `tool` activities should be hidden by default for completed turns
- Add a clickable expand control per turn (e.g. "Show 4 tool calls") to reveal all activities
- Live/in-progress turns continue to show everything as they stream

### 7. Agent feed: on-demand activity fetch (memory)
- **Don't keep** thinking/tool activities in memory for completed turns — only store `text` activities
- When the user clicks "show all" on a completed turn, fetch that turn's full activities from the backend (`agent/turn/detail` or similar)
- This keeps the Zustand store lean — the bulk of memory was tool output strings (file contents, diffs)
- Backend already supports per-turn queries; frontend just needs a targeted fetch path

### 8. Agent feed: virtualization (follow-up)
- If the feed still lags after items 6–7, add `@tanstack/react-virtual` (~5KB, hook-based)
- Evaluate after items 6–7 are done — collapsing activities alone may be sufficient
- Lower priority than 6–7

### 9. Mobile: show all panel types
- Mobile swipe tabs currently only show **Agents** and **Files** — missing **Tickets** and **Git**
- All registered panel types should appear as swipeable tabs

### 10. Mobile: reduce default font size
- Font size on mobile feels too large — reduce by ~25% when `useMobile` detects mobile viewport
- Quick fix: set a smaller base `font-size` on the app root (or `<html>`) when mobile is detected — since Tailwind uses `rem`, this propagates everywhere automatically
- This is the immediate fix; a full settings modal (item 11) can make it user-adjustable later

### 11. Settings modal (future / wishlist)
- Add a settings icon in the top bar, next to the microphone / annotation buttons
- Opens a modal with user preferences, persisted in `localStorage`
- **First setting**: font size (plus/minus buttons, showing current size)
- Implementation: set `font-size` on `<html>` element — all `rem`-based Tailwind sizes cascade automatically
- Future-proof: just a key-value settings store that's easy to extend
- **Priority**: wishlist — item 10 solves the immediate mobile problem

### 12. Persist selected agent session (desktop + mobile)
- When switching panels (or swiping on mobile) and coming back to Agents, the previously selected session is lost — user has to re-click it
- Persist the active session ID per repo in `localStorage` (keyed by repo)
- On load / panel re-mount, restore the last active session from storage
- **Guard**: if the stored session ID doesn't exist (different repo, deleted session), fail gracefully — show the session list / "Select or create a session" as if nothing was stored
- On page refresh (desktop), same behaviour — restore last viewed session for the current repo

## Acceptance

- [ ] Outline appears as a collapsible section in the sidebar (with starred, files)
- [ ] Outline entries show line numbers
- [ ] File preview shows line numbers
- [ ] Sidebar collapsible sections work well with multiple sections open simultaneously
- [ ] Collapsing and re-expanding a section retains its data (keep mounted, CSS hide)
- [ ] Clicking an outline symbol highlights the target line briefly (fade animation)
- [ ] Completed turns show only text activities by default
- [ ] Expand control per turn to reveal thinking/tool activities on demand
- [ ] Thinking/tool activities for completed turns NOT kept in store — fetched on demand
- [ ] (Follow-up) Virtualization with `@tanstack/react-virtual` if still needed
- [ ] Mobile tabs include all panel types (Agents, Files, Tickets, Git)
- [ ] Selected agent session persists across panel switches and page refresh (per repo, localStorage)
- [ ] Mobile font size reduced (~25% smaller base)
- [ ] (Wishlist) Settings modal with font size control
- [ ] Graceful fallback if stored session ID is invalid/missing

## Notes
