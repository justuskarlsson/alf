---
id: T-034
title: Pasted images overwrite each other due to identical filenames
type: bug
status: open
priority: high
epic: uploads
effort: S
created: 2026-04-27
updated: 2026-04-27
---

When a user pastes multiple screenshots in the same conversation, they all get saved as `image.png` inside the same upload directory. Each paste overwrites the previous file, so only the last image survives.

## Context

Upload path pattern: `.alf/uploads/{session-uuid}/image.png`

The issue is that the filename is always `image.png` (the browser clipboard default for pasted images). When multiple images are pasted in the same session, they all resolve to the same path and silently overwrite each other.

Observed during a real session: user pasted 3 different screenshots — a chat excerpt, flashcard generation, and flashcard review — but only the last one was retained. The earlier two were lost.

## Acceptance

- [ ] Pasted images get unique filenames (e.g. `image-1.png`, `image-2.png` or timestamp-based like `paste-1745123456.png`)
- [ ] Or: each paste gets its own subdirectory
- [ ] Previously pasted images in the same session are not overwritten
- [ ] Existing upload references in conversation history still resolve correctly

## Notes

<!-- 2026-04-27T12:00Z agent:alfred --> Filed from project-socrates-dev session where 3 screenshots were pasted but only the last survived due to filename collision.
