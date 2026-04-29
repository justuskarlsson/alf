---
id: T-038
title: "Voice annotation stops working after first recording"
type: bug
status: open
priority: critical
epic: agents
effort: S
created: 2026-04-29
updated: 2026-04-29
---

After the first successful voice annotation, subsequent ones fail: pressing "stop" makes the popover disappear but no annotation is added, and the browser mic indicator stays on.

## Context

### Observed behavior
1. First voice annotation: select text → popover with recording → click stop → transcription succeeds → annotation chip appears. **Works.**
2. Second voice annotation: select text → popover with recording → click stop → popover disappears → **no annotation** → **mic stays on**.

### Console evidence
Three `voice/transcribe` round-trips all succeeded (responses came back). So the backend/Whisper side is fine. The bug is frontend-only.

### Root cause analysis

**The mouseup event from clicking the stop button re-triggers `handleMouseUp`, which starts a new recording before `commitVoice` runs.**

Event order when clicking the stop button: `mousedown` → `mouseup` → `click`.

1. **mouseup fires first** → `handleMouseUp` runs. The user's text selection (from step 2) still exists in the DOM. So it creates a NEW popover and calls `recordingPromiseRef.current = startRec()` — starting recording #3 and overwriting the ref.

2. **click fires second** → `commitVoice()` runs. It captures `recordingPromiseRef.current` — which is now the promise from recording #3 (just created in step 1). It calls `stopRec()`, which stops the OLD recorder (#2) since `start()` from step 1 is async and hasn't created recorder #3 yet. Then it `await`s the promise from #3.

3. **Microtask**: `start()` from step 1 finally executes — creates a new MediaRecorder (#3) and starts recording. This recorder's `onstop` is what would resolve the awaited promise, but nobody ever calls `stop()` on it.

**Result**: `commitVoice` hangs at `await promise` (promise never resolves). The mic stays on (stream #3 is never closed). No annotation is added.

### The guard that should prevent this but doesn't

`handleMouseUp` checks `el.closest("[data-annotation-popover]")` — but `el` is the selection **anchor** node (where the text selection starts), not the mouseup target. The text selection lives in the panel, not in the popover, so the guard doesn't trigger.

## Fix

**`AnnotationLayer.tsx`** — add `onMouseUp={e => e.stopPropagation()}` to the popover container div. This prevents clicks inside the popover from bubbling up to the document-level `handleMouseUp` listener.

```tsx
<div
  data-annotation-popover
  className="fixed z-50"
  onMouseUp={e => e.stopPropagation()}  // ← prevents re-triggering handleMouseUp
  style={{ ... }}
>
```

Alternative/additional: add `if (popover) return;` at the top of `handleMouseUp` to skip entirely when a popover is already showing. This would require adding `popover` to the `useCallback` deps.

## Acceptance

- [ ] Second (and subsequent) voice annotations produce annotation chips
- [ ] Mic indicator turns off after each annotation stop
- [ ] No orphaned MediaRecorder streams
- [ ] First annotation still works (no regression)

## Notes

<!-- 2026-04-29T08:00Z agent:alfred --> Root-caused from console logs showing 3 successful transcribe round-trips but annotations not appearing. The mouseup→click event ordering on the stop button is the culprit.
