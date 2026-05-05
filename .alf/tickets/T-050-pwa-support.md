---
id: T-050
title: Add PWA support (standalone mobile mode)
type: feature
status: done
priority: medium
epic: frontend
effort: S
created: 2026-05-05
updated: 2026-05-05
completed: 2026-05-05
---

Add Progressive Web App support so the frontend can be installed to the home screen on mobile, removing the browser URL bar and running in standalone/fullscreen mode.

## Context

Primary motivation is mobile UX — the URL bar wastes screen space and makes the app feel like a webpage rather than a tool. PWA `display: standalone` eliminates it.

Secondary benefits: own window identity on desktop (taskbar entry, no browser chrome), faster cached shell loads, asset caching via service worker.

## Plan

1. `pnpm add -D vite-plugin-pwa`
2. Configure `VitePWA()` in `vite.config.ts` — app name, theme color, `display: standalone`, icon sizes
3. Add icon PNGs to `frontend/public/` (192×192, 512×512 minimum)
4. Add `<meta name="theme-color">` and apple-mobile-web-app meta tags to `index.html`
5. Optional: SW registration in `main.tsx` for update-available prompts

## Acceptance

- [ ] Lighthouse PWA audit passes (installable)
- [ ] Mobile: "Add to Home Screen" works, app opens without URL bar
- [ ] Desktop: install prompt available, opens in standalone window
- [ ] Icons render correctly on both platforms

## Notes
