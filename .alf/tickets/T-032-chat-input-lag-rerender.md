---
id: T-032
title: Chat input lag on large sessions — likely full message list re-render
type: bug
status: done
priority: high
epic: agents
effort: M
created: 2026-04-25
updated: 2026-04-25
resolved: 2026-04-25
---

Typing in the chat input becomes noticeably laggy as a session grows larger. Each keystroke likely triggers a re-render of the entire message list.

## Context

Probable cause: `input` state lives in the same component (or store slice) that the message list reads from, so every `setInput()` keystroke re-renders the message list. Classic React perf issue.

### Likely fixes (investigate which apply)

- **Isolate input state** — keep `input` in local component state or a separate store slice so the message list doesn't subscribe to it
- **Memoize message list** — `React.memo` on the message list component with stable props
- **Virtualize messages** — for very long sessions, only render visible messages (e.g. `react-window` or `react-virtuoso`). This is a bigger lift but solves the scaling problem entirely.

Start with the isolation/memo approach — it's the quick win. Virtualization can be a follow-up if needed.

## Acceptance

- [ ] Typing in chat input has no perceptible lag regardless of session size
- [ ] Message list does NOT re-render on each keystroke (verify with React DevTools profiler)
- [ ] No regressions in message display or streaming updates

## Notes
