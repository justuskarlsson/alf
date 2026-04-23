import { create } from "zustand";

export interface SelectionContext {
  text: string;
  /** All data-alf-ctx-* attributes collected walking up from selection node */
  attrs: Record<string, string>;
}

export interface Annotation {
  id: string;
  context: SelectionContext;
  note: string;
}

interface AnnotationStore {
  mode: "text" | "voice" | null;
  pending: Annotation[];

  setMode: (mode: "text" | "voice" | null) => void;
  addAnnotation: (context: SelectionContext, note: string) => void;
  removeAnnotation: (id: string) => void;
  clearPending: () => void;
  /** Reduce all pending annotations to formatted text for prepending to prompt. */
  formatForPrompt: () => string;
}

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  mode: null,
  pending: [],

  setMode: (mode) => set(s => ({ mode: s.mode === mode ? null : mode })),

  addAnnotation: (context, note) => {
    const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    set(s => ({ pending: [...s.pending, { id, context, note }] }));
  },

  removeAnnotation: (id) => set(s => ({ pending: s.pending.filter(a => a.id !== id) })),

  clearPending: () => set({ pending: [] }),

  formatForPrompt: () => {
    const { pending } = get();
    if (pending.length === 0) return "";
    return pending.map(a => {
      const lines: string[] = [];
      // Build context reference from attrs
      const ref = formatRef(a.context.attrs);
      if (ref) lines.push(`> \`${ref}\``);
      // Quote the selected text
      for (const line of a.context.text.split("\n")) {
        lines.push(`> ${line}`);
      }
      lines.push("");
      lines.push(a.note);
      return lines.join("\n");
    }).join("\n\n---\n\n");
  },
}));

/** Build a human-readable reference string from collected data-alf-ctx-* attrs. */
function formatRef(attrs: Record<string, string>): string {
  const parts: string[] = [];
  if (attrs.file) {
    let ref = attrs.file;
    if (attrs["line-start"]) {
      ref += `:${attrs["line-start"]}`;
      if (attrs["line-end"] && attrs["line-end"] !== attrs["line-start"]) ref += `-${attrs["line-end"]}`;
    }
    parts.push(ref);
  }
  if (attrs["ticket-id"]) parts.push(attrs["ticket-id"]);
  if (attrs.commit) parts.push(`commit:${attrs.commit.slice(0, 8)}`);
  if (attrs.session) parts.push(`session`);
  if (attrs.turn) parts.push(`turn:${attrs.turn}`);
  return parts.join(" ");
}
