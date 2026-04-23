---
id: T-027
title: "Annotations (text + voice)"
type: feature
status: open
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

- [ ] Global selection handler: walk up DOM collecting `data-alf-ctx-*`
- [ ] `annotationStore` with mode toggle, pending annotations, formatForPrompt
- [ ] Top bar: Voice and Text toggle buttons
- [ ] Text mode: selection → text input popover → annotation added
- [ ] Voice mode: selection → record → transcribe → annotation added
- [ ] Composer: shows pending annotation chips, removable
- [ ] On send: annotations formatted as blockquotes, prepended to message, cleared
- [ ] Files panel: `data-alf-ctx-*` attributes on rendered lines
- [ ] Tickets panel: `data-alf-ctx-*` attributes on ticket content
- [ ] Git panel: `data-alf-ctx-*` attributes on diff content

## Notes

<!-- Agents and humans append timestamped notes here -->
