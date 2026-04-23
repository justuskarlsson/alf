---
id: T-031
title: "File panel: image rendering + gitignore exceptions"
type: feature
status: done
priority: medium
epic: mvp4
effort: M
created: 2026-04-23
updated: 2026-04-23
---

Extend the file panel to render images and allow showing gitignored directories.

## Context

Ref: T-018 §4. Instead of `[Image: /path]` rendering in agent responses, we use the file panel to browse/view images. This requires the file panel to handle image files and optionally show gitignored directories like `.alf/uploads/` or `data/`.

### Image rendering
- When a file is selected and it's an image (png, jpg, gif, svg, webp), render it as an image preview instead of text/syntax-highlighted content.
- Detection by file extension is sufficient.

### Gitignore exceptions
- By default, gitignored files/dirs are hidden (current behavior).
- User can opt-in to showing specific gitignored directories (e.g., `data/`, `.alf/uploads/`).
- UI: small toggle or "show hidden" option in file panel header.
- Optional: directories with 100+ files show a count instead of full listing; user can click to expand.

## Acceptance

- [x] File panel renders image files as image preview
- [x] Supported formats: png, jpg/jpeg, gif, svg, webp
- [x] Gitignore exception mechanism: user can show specific gitignored dirs
- [ ] Large directory cap: 100+ files shows count, expandable on demand (deferred — not needed for MVP4)

## Notes

- 2026-04-23: Implemented. Image rendering: `FileContentPanel` detects image extensions (png/jpg/jpeg/gif/svg/webp), renders `<img>` with data URL from base64 binary content (or SVG text). Added `isBinary` flag to files store. Show hidden toggle: "○ hidden" / "⦿ hidden" button in files sidebar header, switches backend from `git ls-files` to naive filesystem walker (allows `.alf/` dotdir). `showHidden` param on `files/list`. E2E tests verified with screenshots. Large directory cap deferred.
