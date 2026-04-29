---
id: T-041
title: "Images not viewable in file browser — raw bytes in img src"
type: bug
status: done
priority: high
epic: files
effort: S
created: 2026-04-29
updated: 2026-04-29
---

Selecting an image file (e.g. PNG) in the file browser shows a broken image. The `<img src>` contains raw binary bytes instead of a data URI.

## Context

The backend `files/get` handler tries `readFileSync(fullPath, "utf8")` first. For binary files like PNGs, this **doesn't throw** — Node silently reads binary data as mangled UTF-8. So `isBinary` is never set to true, and the frontend receives garbled text content instead of base64.

The frontend's image rendering path (`FileContentPanel.tsx` line 49) correctly builds a `data:image/...;base64,` URI when `isBinary` is true, but falls through to using raw content as `src` when it's false.

## Fix

Backend: detect known binary extensions upfront and read as base64 directly, skipping the UTF-8 attempt. Added `BINARY_EXTS` set covering images, fonts, archives, audio/video, databases, executables.

## Acceptance

- [x] PNG/JPG/GIF/WebP files render correctly in file browser
- [x] SVG files still render (handled separately as text)
- [x] Text files unaffected

## Notes

<!-- 2026-04-29T09:30Z agent:alfred --> Root cause: Node's readFileSync("utf8") silently reads binary without throwing. Fix: check extension before reading.
