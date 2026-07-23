---
id: T-051
title: "Mobile: Stuff2Fix"
type: task
status: in-progress
priority: medium
epic: ui
effort: XL
created: 2026-05-06
updated: 2026-07-23
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

- [x] Annotations work on mobile without fighting native text selector
- [x] Swipe navigation and panel switching work reliably
- [x] Sidebars replaced with bottom hamburger menu on mobile
- [x] Agent screen text input doesn't auto-focus on swipe-in
- [ ] Touch targets meet minimum size (~44px) — tabs/dots/hamburger/annotation toggles done; composer chrome still small
- [x] Layout usable on common phone screen sizes

## Notes

<!-- 2026-07-23T11:40Z agent --> Started T-051. Implemented:
- Agent composer: no autofocus on mobile (swipe remount was popping keyboard)
- SidebarLayout: mobile bottom-left hamburger → sheet with sidebar content
- MobileSwipeView: ignore swipes starting on inputs/scrollables; larger tabs; tappable dots; safe-area
- Annotations: touchend + mouseup when mode on; mode still toggles off for native select; larger mobile A/mic targets
<!-- 2026-07-23T12:00Z agent --> Moved hamburger from floating bottom-left (covered mic) into the
mobile tab bar, left of Agents. Sheet still slides up from bottom.
<!-- 2026-07-23T12:15Z agent --> Bottom chrome: removed dots; moved hamburger+tabs to bottom bar.
Annotation mode: html.alf-annotating + -webkit-touch-callout:none + contextmenu preventDefault
to suppress Copy/Share callout where the browser allows (OS selection handles may remain).
