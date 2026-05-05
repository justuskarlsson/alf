---
id: T-045
title: Mobile layout — single-panel swipeable view
type: feature
status: open
priority: medium
epic: frontend
effort: M
created: 2026-05-05
updated: 2026-05-05
---

Detect mobile devices and render a single-panel-at-a-time view with swipe navigation instead of the react-grid-layout dashboard.

## Context

The current dashboard uses a 12-column `react-grid-layout` grid that only makes sense on desktop/tablet. On mobile phones we want:

1. **Detection** — Identify mobile via CSS logical pixels (viewport width), not physical pixels. This avoids high-DPI phones (1440px physical) triggering desktop layout. Standard approach: `window.matchMedia("(max-width: 768px)")` checks CSS px (aka device-independent / logical pixels). Combine with a listener so rotating the phone updates the mode.
2. **Single panel view** — When mobile is detected, hide the grid. Show one panel at a time, full-width.
3. **Swipe navigation** — The user swipes left/right (or taps tabs) to switch between panels.

## Investigation — Files to Touch

### 1. `frontend/src/core/dashboardStore.ts`
- Add `isMobile: boolean` state (or a separate tiny `useIsMobile` hook/store).
- Add `activePanelIndex: number` for which panel is currently visible on mobile.
- Add `setActivePanelIndex(i)` action.

### 2. `frontend/src/pages/RepoPage.tsx`
- Import mobile detection hook.
- Conditionally render: if mobile → `<MobileSwipeView panels={panels} />`, else → existing `<GridLayout ...>`.
- The `PanelCard` wrapper can stay mostly the same but drop drag-handle / resize affordances on mobile.

### 3. New file: `frontend/src/core/useIsMobile.ts` (small hook)
```ts
import { useSyncExternalStore } from "react";

const query = "(max-width: 768px)";
const mql = typeof window !== "undefined" ? window.matchMedia(query) : null;

function subscribe(cb: () => void) {
  mql?.addEventListener("change", cb);
  return () => mql?.removeEventListener("change", cb);
}
function getSnapshot() { return mql?.matches ?? false; }

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
```
Uses CSS logical pixels by default — high-DPI phones report ~360-430 logical px, well under 768.

### 4. New file: `frontend/src/pages/MobileSwipeView.tsx`
- Renders the active panel full-screen.
- Swipe gesture via touch events (`touchstart`/`touchmove`/`touchend`) or a tiny lib like `react-swipeable` (~3 KB).
- Tab bar or dots at top/bottom for panel switching.

### 5. `frontend/src/index.css` / Tailwind config
- Possibly add a few mobile-specific utility styles (panel transitions, swipe animation).

### 6. Optional: `<meta name="viewport">` in `index.html`
- Likely already has `width=device-width, initial-scale=1` (Vite default). Confirm it's present — this is what makes CSS px equal logical px.

## Acceptance

- [ ] `useIsMobile()` hook detects viewport ≤768 CSS px (logical, not physical)
- [ ] On mobile: dashboard grid is hidden, one panel visible at a time
- [ ] User can swipe or tap to switch between panels
- [ ] Rotating phone from portrait→landscape re-evaluates (may switch to desktop mode if >768px)
- [ ] No regressions on desktop layout
- [ ] Works on both iOS Safari and Android Chrome

## Notes

