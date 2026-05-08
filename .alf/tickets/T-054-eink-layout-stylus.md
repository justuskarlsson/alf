---
id: T-054
title: "E-ink tablet support: layout + stylus annotation"
type: feature
status: open
priority: low
epic: ui
effort: L
created: 2026-05-06
updated: 2026-05-06
---

Support for e-ink tablets (~9" Kaleido color). Two parts: adapted layout/colors and stylus button as annotation trigger.

## Context

### E-ink layout
E-ink displays have slow refresh and limited color gamut (Kaleido). The UI should adapt: high contrast, minimal animations, reduced color palette. Detection options:
- JS: `matchMedia('(update: slow)')` or `(color-gamut: srgb)` might hint at e-ink
- Fallback: manual toggle in settings, persisted to device (localStorage)

Either way, expose a device setting (e.g. "E-ink mode") that the user can flip and save locally.

### Stylus button as annotation shortcut
The Pointer Events API exposes `button` and `buttons` properties — the stylus barrel button is typically `button === 5` or `buttons & 32`. When the stylus button is held during a stroke/selection, treat it as an annotation action automatically, bypassing the need to tap the Annotate button first.

## Acceptance

- [ ] E-ink mode toggle in settings, saved to device (localStorage)
- [ ] E-ink mode applies high-contrast, low-animation, e-ink-friendly styles
- [ ] Auto-detect e-ink if possible (`(update: slow)` media query), otherwise manual only
- [ ] Stylus barrel button triggers annotation mode (Pointer Events API)
- [ ] Annotation via stylus works without first tapping the Annotate button
- [ ] Both features work on ~9" tablet screen size

## Notes
