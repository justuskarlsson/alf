---
id: T-051
title: "Mobile: Stuff2Fix"
type: task
status: open
priority: medium
epic: ui
effort: XL
created: 2026-05-06
updated: 2026-05-06
---

Umbrella ticket for mobile usability issues. The current layout was built desktop-first and several interactions are broken or awkward on phones.

## Issues

### Annotation tool vs native text selector
The annotation tool conflicts with the mobile long-press text selector. Touch-based selection and the custom annotation interaction need to coexist or switch modes cleanly.

### General mobile layout
Swipe-to-right navigation and other mobile-specific gestures may be broken or feel off. Needs an audit and rework pass across all panels.

### Sidebars → bottom hamburger menu
Sidebars are hard to reach on mobile. Replace them with a hamburger menu — probably anchored at the bottom of the screen so it's thumb-reachable.

### Agent screen: don't auto-focus text input on swipe
When swiping to the agent screen, the text input gets auto-focused which brings up the keyboard immediately. This is annoying — only focus on explicit tap.

## Acceptance

- [ ] Annotations work on mobile without fighting native text selector
- [ ] Swipe navigation and panel switching work reliably
- [ ] Sidebars replaced with bottom hamburger menu on mobile
- [ ] Agent screen text input doesn't auto-focus on swipe-in
- [ ] Touch targets meet minimum size (~44px)
- [ ] Layout usable on common phone screen sizes

## Notes
