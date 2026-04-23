---
id: T-026
title: "File upload in chat"
type: feature
status: done
priority: high
epic: mvp4
effort: M
created: 2026-04-23
updated: 2026-04-23
---

Upload any file type to chat. Files saved to `.alf/uploads/` in the repo, agent receives file paths.

## Context

Ref: T-018 §3. No file type restrictions, no size limit. Always disk-based (never inline in prompt).

### Backend
- New handler (in agents module or as extension): receives files as `[{name, base64, mimeType}]` alongside `agent/message`.
- Saves files to `{repoPath}/.alf/uploads/{sessionId}/{filename}` (or uuid-prefixed to avoid collisions).
- Agent prompt includes file paths so it can read them with its tools.
- Backend ensures `.alf/` directory structure exists on first use:
  - `.alf/tickets/` (existing)
  - `.alf/uploads/` (new, gitignored)
  - `.alf/.gitignore` — contains `uploads/`

### Frontend
- Composer bar: file icon button (general file icon, not image-specific) + drag-and-drop on composer area.
- Attached files shown as preview chips below composer:
  - Images: thumbnail preview
  - Other files: truncated filename + extension badge
- Remove chip to detach file before sending.
- Ctrl+V paste: intercept `image/*` from clipboard, add as attached file.

### Composer bar design
Two icons in composer (9 o'clock style): voice (microphone) and files (paperclip/file icon). Plus send button.

## Acceptance

- [x] Backend saves uploaded files to `.alf/uploads/{sessionId}/`
- [x] Backend initializes `.alf/` dir structure (uploads + gitignore) if missing
- [x] Agent prompt includes uploaded file paths
- [x] Frontend: file picker button in composer
- [x] Frontend: drag-and-drop files onto composer
- [x] Frontend: Ctrl+V paste for images
- [x] Frontend: preview chips (thumbnail for images, filename for others)
- [x] Frontend: remove attached file before sending

## Notes

- 2026-04-23: Fully implemented. Backend: `saveUploadedFiles()` + `ensureAlfGitignore()` helpers in `agents/index.ts`. Frontend: paperclip attach button (SVG), hidden file input, drag-drop, Ctrl+V paste, file chips with image thumbnails or ext badges, remove buttons. Files sent as base64 array in `agent/message`, saved to disk, paths appended to prompt. E2E test verified with screenshots.
