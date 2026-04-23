/**
 * AnnotationLayer — global selection handler + popover for text/voice annotations.
 * Renders as a portal-less overlay positioned at the selection rect.
 *
 * When annotation mode is active (text or voice), selecting text in any panel triggers:
 * - Text mode: a small text input popover appears near the selection
 * - Voice mode: recording starts automatically, popover shows recording indicator + stop button
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAnnotationStore, type SelectionContext } from "./annotationStore";
import { useVoiceRecorder, type VoiceRecording } from "./useVoiceRecorder";
import { useRelay } from "./RelayProvider";

interface PopoverState {
  context: SelectionContext;
  rect: DOMRect;
}

export function AnnotationLayer() {
  const mode = useAnnotationStore(s => s.mode);
  const addAnnotation = useAnnotationStore(s => s.addAnnotation);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);
  const { state: recState, duration, start: startRec, stop: stopRec } = useVoiceRecorder();
  const { request } = useRelay();
  const recordingPromiseRef = useRef<Promise<VoiceRecording> | null>(null);

  // Clear popover when mode turns off
  useEffect(() => {
    if (!mode) { setPopover(null); setTextDraft(""); }
  }, [mode]);

  const handleMouseUp = useCallback(() => {
    if (!mode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;

    const text = sel.toString().trim();
    if (!text) return;

    // Don't trigger inside prompt-input textarea or annotation popover itself
    const anchor = sel.anchorNode;
    if (!anchor) return;
    const el = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as HTMLElement) : anchor.parentElement;
    if (!el) return;
    if (el.closest("[data-testid='prompt-input']") || el.closest("[data-annotation-popover]")) return;

    // Collect data-alf-ctx-* by walking up
    const attrs = collectCtxAttrs(el);
    const context: SelectionContext = { text, attrs };

    // Get position rect
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setPopover({ context, rect });
    setTextDraft("");

    if (mode === "text") {
      // Focus will happen via useEffect after render
    } else if (mode === "voice") {
      // Start recording immediately
      recordingPromiseRef.current = startRec();
    }
  }, [mode, startRec]);

  // Focus text input when popover appears in text mode
  useEffect(() => {
    if (popover && mode === "text") {
      setTimeout(() => textInputRef.current?.focus(), 0);
    }
  }, [popover, mode]);

  // Register global mouseup
  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  // Dismiss popover on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && popover) {
        dismiss();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [popover]);

  function dismiss() {
    if (recState === "recording") stopRec(); // discard
    setPopover(null);
    setTextDraft("");
    recordingPromiseRef.current = null;
  }

  function commitText() {
    if (!popover || !textDraft.trim()) return;
    addAnnotation(popover.context, textDraft.trim());
    setPopover(null);
    setTextDraft("");
    window.getSelection()?.removeAllRanges();
  }

  async function commitVoice() {
    if (!popover || !recordingPromiseRef.current) return;
    stopRec();
    try {
      const recording = await recordingPromiseRef.current;
      const res = await request<{ text: string }>({
        type: "voice/transcribe",
        audioBase64: recording.audioBase64,
        audioFormat: recording.audioFormat,
      });
      if (res.text && popover) {
        addAnnotation(popover.context, res.text);
      }
    } catch (err) {
      console.error("Transcription failed:", err);
    }
    setPopover(null);
    recordingPromiseRef.current = null;
    window.getSelection()?.removeAllRanges();
  }

  if (!popover) return null;

  // Position: above the selection, centered horizontally
  const top = popover.rect.top + window.scrollY - 4;
  const left = popover.rect.left + popover.rect.width / 2;

  return (
    <div
      data-annotation-popover
      className="fixed z-50"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      {mode === "text" && (
        <div className="flex items-center gap-1 bg-alf-canvas border border-alf-border rounded shadow-lg px-2 py-1.5">
          <input
            ref={textInputRef}
            value={textDraft}
            onChange={e => setTextDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); commitText(); }
              if (e.key === "Escape") { e.preventDefault(); dismiss(); }
            }}
            placeholder="Annotate…"
            className="bg-transparent border-none text-sm font-mono text-slate-200 placeholder-slate-600
                       focus:outline-none w-48"
          />
          <button
            onClick={commitText}
            disabled={!textDraft.trim()}
            className="text-xs font-mono text-slate-500 hover:text-slate-200 disabled:opacity-30 px-1"
          >+</button>
          <button
            onClick={dismiss}
            className="text-xs font-mono text-slate-600 hover:text-red-400 px-1"
          >×</button>
        </div>
      )}

      {mode === "voice" && (
        <div className="flex items-center gap-2 bg-alf-canvas border border-alf-border rounded shadow-lg px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-mono text-slate-400">{formatDuration(duration)}</span>
          <button
            onClick={commitVoice}
            className="text-xs font-mono text-slate-300 hover:text-slate-100 px-1.5 py-0.5
                       border border-alf-border rounded hover:border-slate-500"
          >stop</button>
          <button
            onClick={dismiss}
            className="text-xs font-mono text-slate-600 hover:text-red-400 px-1"
          >×</button>
        </div>
      )}
    </div>
  );
}

/** Walk up from element, collecting all data-alf-ctx-* attributes. */
function collectCtxAttrs(el: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  let node: HTMLElement | null = el;
  while (node) {
    for (const attr of Array.from(node.attributes ?? [])) {
      if (attr.name.startsWith("data-alf-ctx-")) {
        const key = attr.name.slice("data-alf-ctx-".length);
        // Don't overwrite — inner (more specific) takes priority
        if (!(key in attrs)) attrs[key] = attr.value;
      }
    }
    node = node.parentElement;
  }
  return attrs;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
