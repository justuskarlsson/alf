---
id: T-027
title: "Annotations (text + voice)"
type: feature
status: done
priority: high
epic: mvp4
effort: L
created: 2026-04-23
updated: 2026-04-23
---

Select text in any panel, annotate it (text or voice), and have the annotation context injected into the current chat message.

## Context

Ref: T-018 §1. Depends on T-025 (voice transcription) for voice annotations.

### Architecture: hybrid DOM-first

1. Panels add `data-alf-ctx-*` DOM attributes to their rendered elements (e.g., `data-alf-ctx-file`, `data-alf-ctx-line-start`, `data-alf-ctx-ticket-id`).
2. Global selection handler walks up from selection node, collecting all `data-alf-ctx-*` attributes into a `SelectionContext`.
3. Panels can optionally register enrichment callbacks for richer context that can't be encoded in DOM attributes.

### Annotation modes
Top bar (where lock icon lives), center area: two toggle buttons — **Voice** and **Text**.
- Mutually exclusive (only one active at a time).
- Both can be off — text selection doesn't trigger annotation when off.
- Voice mode: on selection, starts recording. On stop, transcribes via `voice/transcribe`, fills annotation note.
- Text mode: on selection, shows text input popover for typing annotation.

### State: `annotationStore`
Separate Zustand store. Keeps annotations alive even if agent panel unmounts (mobile scenario).

```typescript
interface Annotation {
  id: string;
  context: SelectionContext; // panel type, text, data-alf-ctx-* metadata
  note: string;             // user's annotation (typed or transcribed)
}

interface AnnotationStore {
  mode: 'text' | 'voice' | null;
  pending: Annotation[];
  setMode(mode: 'text' | 'voice' | null): void;
  addAnnotation(annotation: Annotation): void;
  removeAnnotation(id: string): void;
  clearPending(): void;
  formatForPrompt(): string; // reduces all annotations to text
}
```

### On send: ephemeral
Annotations accumulate as pending items, displayed as chips in the composer. On send, each annotation is reduced to formatted text (selection context as blockquote + annotation note) and prepended to the message. After send, pending annotations are cleared. Nothing persisted.

### Per-panel DOM attributes to add

| Panel | Attributes |
|-------|-----------|
| Files | `data-alf-ctx-file`, `data-alf-ctx-line-start`, `data-alf-ctx-line-end` |
| Tickets | `data-alf-ctx-ticket-id`, `data-alf-ctx-ticket-title` |
| Git | `data-alf-ctx-commit`, `data-alf-ctx-file`, `data-alf-ctx-hunk` |
| Agent (chat) | `data-alf-ctx-session`, `data-alf-ctx-turn` |

## Acceptance

- [x] Global selection handler: walk up DOM collecting `data-alf-ctx-*`
- [x] `annotationStore` with mode toggle, pending annotations, formatForPrompt
- [x] Top bar: Voice and Text toggle buttons
- [x] Text mode: selection → text input popover → annotation added
- [x] Voice mode: selection → record → transcribe → annotation added
- [x] Composer: shows pending annotation chips, removable
- [x] On send: annotations formatted as blockquotes, prepended to message, cleared
- [x] Files panel: `data-alf-ctx-file` on content area
- [x] Tickets panel: `data-alf-ctx-ticket-id`, `data-alf-ctx-ticket-title` on content
- [x] Git panel: `data-alf-ctx-file` on diff file sections, `data-alf-ctx-commit` on diff view
- [x] Mic button in composer (voice message → transcribe → fill composer)
- [x] Agent chat feed: `data-alf-ctx-session` attribute
- [x] E2E tests: 4 annotation tests passing (mode toggle, text annotation flow, chip removal, mic button)

## Notes

<!-- 2026-04-23 agent --> Implemented. New files: `core/annotationStore.ts` (Zustand store), `core/AnnotationLayer.tsx` (global selection handler + popover). Mode toggles (A / mic icon) in RepoPage header center. Text mode: triple-click/select → popover with text input → Enter commits annotation. Voice mode: select → auto-record → stop → transcribe via `voice/transcribe` → annotation created. Annotation chips displayed above attached files in composer with purple styling + remove button. On send, annotations formatted as blockquotes with context refs and prepended to prompt. Mic button added to composer input area for voice-to-text messages (separate from annotation voice). `data-alf-ctx-*` DOM attributes added to FileContentPanel, TicketsPanel, GitPanel DiffView, and AgentsPanel chat feed.
