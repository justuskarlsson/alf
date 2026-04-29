import React, { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRelay } from "../../core/RelayProvider";
import { usePanelInit } from "../../core/usePanelInit";
import { Panel, SidebarLayout, PanelHeader, EmptyState } from "../../panels/Panel";
import { MarkdownRenderer } from "../../shared/MarkdownRenderer";
import { useAgentsStore, AVAILABLE_IMPLS, MODEL_OPTIONS, type LiveState } from "./store";
import { useAnnotationStore } from "../../core/annotationStore";
import { useVoiceRecorder } from "../../core/useVoiceRecorder";
import type { AgentActivity, AgentDelta, AgentSession, AgentTurn } from "@alf/types";

// ---------------------------------------------------------------------------
// Handlers at top — helpers below
// ---------------------------------------------------------------------------

function SessionList({ repo }: { repo: string }) {
  const { request } = useRelay();
  const { sessions, selectedSessionId, selectSession, createSession } = useAgentsStore(
    useShallow(s => ({
      sessions: s.sessions,
      selectedSessionId: s.selectedSessionId,
      selectSession: s.selectSession,
      createSession: s.createSession,
    }))
  );
  const lastSeenMap = useAgentsStore(s => s.lastSeenMap);
  const now = useNow();

  function handleNew() {
    const title = window.prompt("Session title:") ?? "";
    createSession(repo, title, request);
  }

  return (
    <Panel>
      <PanelHeader title="Sessions">
        <button
          onClick={handleNew}
          className="font-mono text-xs text-slate-500 hover:text-slate-200 transition-colors"
          title="New session"
          data-testid="new-session-btn"
        >+ new</button>
      </PanelHeader>
      <div className="flex-1 overflow-auto" data-testid="session-list">
        {sessions.length === 0 && <EmptyState message="No sessions yet." />}
        <div className="divide-y divide-alf-muted">
          {sessions.map(s => (
            <SessionRow
              key={s.id}
              session={s}
              selected={s.id === selectedSessionId}
              unread={s.updated_at > (lastSeenMap[s.id] ?? 0) && s.id !== selectedSessionId}
              now={now}
              onSelect={() => selectSession(s.id, request)}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}

function SessionRow({ session, selected, unread, now, onSelect }: {
  session: AgentSession; selected: boolean; unread: boolean; now: number; onSelect: () => void;
}) {
  const { request } = useRelay();
  const renameSession = useAgentsStore(s => s.renameSession);
  const deleteSession = useAgentsStore(s => s.deleteSession);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(session.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    setEditing(false);
    const trimmed = draft.trim() || session.title;
    if (trimmed !== session.title) renameSession(session.id, trimmed, request);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") { setEditing(false); setDraft(session.title); }
  }

  return (
    <div
      onClick={editing ? undefined : onSelect}
      onDoubleClick={startEdit}
      className={`group px-3 py-2 cursor-pointer select-none transition-colors
        ${selected ? "bg-alf-surface" : "hover:bg-alf-surface/60"}`}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          className="w-full bg-alf-bg border border-slate-500 rounded px-1 py-0.5 font-mono
                     text-sm text-slate-200 focus:outline-none"
          data-testid="session-title-input"
        />
      ) : (
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {unread && (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-sky-400" title="New activity" />
            )}
            <span className="font-mono text-sm text-slate-200 truncate">{session.title}</span>
          </div>
          <button
            onClick={e => {
              e.stopPropagation();
              if (confirm(`Delete "${session.title}"?`)) deleteSession(session.id, request);
            }}
            title="Delete session"
            data-testid="delete-session-btn"
            className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-400 transition-all text-xs px-1 shrink-0"
          >✕</button>
        </div>
      )}
      <div className="font-mono text-xs text-slate-600 mt-0.5">
        {relativeTime(session.updated_at, now)}
      </div>
    </div>
  );
}

interface AttachedFile {
  id: string;
  name: string;
  base64: string;
  mimeType: string;
  previewUrl?: string;
}

// ---------------------------------------------------------------------------
// ChatView — split into ChatFeed (memoized) + ChatComposer (isolated input)
// to prevent keystroke re-renders from propagating to the message feed.
// ---------------------------------------------------------------------------

function ChatView({ repo }: { repo: string }) {
  const { request } = useRelay();
  const {
    selectedSessionId, turns, activities, live, isRunning, pendingPrompt,
    forkSession, selectedImpl, setSelectedImpl, selectedModel, setSelectedModel,
  } = useAgentsStore(useShallow(s => ({
    selectedSessionId: s.selectedSessionId,
    turns: s.turns,
    activities: s.activities,
    live: s.live,
    isRunning: s.isRunning,
    pendingPrompt: s.pendingPrompt,
    forkSession: s.forkSession,
    selectedImpl: s.selectedImpl,
    setSelectedImpl: s.setSelectedImpl,
    selectedModel: s.selectedModel,
    setSelectedModel: s.setSelectedModel,
  })));

  if (!selectedSessionId) return <EmptyState message="Select or create a session" />;

  return (
    <Panel>
      <PanelHeader title="Chat">
        <div className="flex items-center gap-1.5">
          <select
            value={selectedImpl}
            onChange={e => setSelectedImpl(e.target.value)}
            data-testid="impl-selector"
            className="bg-alf-bg border border-alf-border rounded px-1.5 py-0.5 font-mono text-xs
                       text-slate-400 focus:outline-none focus:border-slate-500 transition-colors"
          >
            {AVAILABLE_IMPLS.map(impl => (
              <option key={impl} value={impl}>{impl}</option>
            ))}
          </select>
          {MODEL_OPTIONS[selectedImpl] && (
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              data-testid="model-selector"
              className="bg-alf-bg border border-alf-border rounded px-1.5 py-0.5 font-mono text-xs
                         text-slate-400 focus:outline-none focus:border-slate-500 transition-colors"
            >
              {MODEL_OPTIONS[selectedImpl].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          {turns.length > 0 && (
            <button
              onClick={() => forkSession(request)}
              disabled={isRunning}
              title="Fork this conversation"
              data-testid="fork-btn"
              className="font-mono text-xs text-slate-600 hover:text-slate-300 transition-colors
                         disabled:opacity-30 px-1"
            >fork</button>
          )}
        </div>
      </PanelHeader>

      <ChatFeed
        turns={turns}
        activities={activities}
        live={live}
        pendingPrompt={pendingPrompt}
        selectedSessionId={selectedSessionId}
      />

      <ChatComposer />
    </Panel>
  );
}

/** Memoized feed — only re-renders when turns/activities/live/pendingPrompt change. */
const ChatFeed = React.memo(function ChatFeed({ turns, activities, live, pendingPrompt, selectedSessionId }: {
  turns: AgentTurn[];
  activities: AgentActivity[];
  live: LiveState | null;
  pendingPrompt: string | null;
  selectedSessionId: string;
}) {
  const feed = buildFeed(turns, activities, live, pendingPrompt);
  return (
    <div className="flex-1 overflow-auto flex flex-col-reverse" data-testid="chat-feed" data-alf-ctx-session={selectedSessionId}>
      <div className="flex flex-col-reverse gap-2 p-3">
        {feed.map((item, i) => <FeedItem key={i} item={item} />)}
      </div>
    </div>
  );
});

/**
 * ChatComposer — fully isolated input area.
 * Owns its own local state (input text, attached files, voice) so keystrokes
 * never re-render the message feed above.
 */
function ChatComposer() {
  const { request } = useRelay();
  const { selectedSessionId, isRunning, sendMessage, stopSession } = useAgentsStore(
    useShallow(s => ({
      selectedSessionId: s.selectedSessionId,
      isRunning: s.isRunning,
      sendMessage: s.sendMessage,
      stopSession: s.stopSession,
    }))
  );

  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Focus input whenever _focusTrigger increments (session select/create).
  // Also focus on mount — ChatComposer may mount after the trigger already fired
  // (e.g. first session creation transitions from EmptyState → ChatComposer).
  useEffect(() => {
    if (useAgentsStore.getState().selectedSessionId) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    let prev = useAgentsStore.getState()._focusTrigger;
    const unsub = useAgentsStore.subscribe((state) => {
      if (state._focusTrigger !== prev) {
        prev = state._focusTrigger;
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    });
    return unsub;
  }, []);

  function addFiles(fileList: FileList | File[]) {
    for (const file of Array.from(fileList)) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] ?? "";
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        // Clipboard pastes always use generic names like "image.png" — deduplicate
        // Must compute name inside updater so concurrent onloadend callbacks see latest state
        setAttachedFiles(prev => {
          const name = deduplicateName(file.name, prev);
          return [...prev, {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name, base64, mimeType: file.type, previewUrl,
          }];
        });
      };
      reader.readAsDataURL(file);
    }
  }

  function removeFile(id: string) {
    setAttachedFiles(prev => {
      const removed = prev.find(f => f.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  }

  function handlePaste(e: React.ClipboardEvent) {
    const imageFiles = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/"));
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  // Annotations
  const annotations = useAnnotationStore(s => s.pending);
  const removeAnnotation = useAnnotationStore(s => s.removeAnnotation);
  const clearAnnotations = useAnnotationStore(s => s.clearPending);
  const formatAnnotations = useAnnotationStore(s => s.formatForPrompt);

  // Voice recorder for composer mic button
  const { state: micState, duration: micDuration, start: micStart, stop: micStop } = useVoiceRecorder();
  const micPromiseRef = useRef<ReturnType<typeof micStart> | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  async function handleMicToggle() {
    if (micState === "recording") {
      micStop();
      const promise = micPromiseRef.current;
      micPromiseRef.current = null;
      if (promise) {
        setIsTranscribing(true);
        try {
          const rec = await promise;
          const res = await request<{ text: string }>({
            type: "voice/transcribe",
            audioBase64: rec.audioBase64,
            audioFormat: rec.audioFormat,
          }, 120_000);
          if (res.text) setInput(prev => prev ? `${prev} ${res.text}` : res.text);
        } catch (err) { console.error("Transcription failed:", err); }
        setIsTranscribing(false);
      }
    } else {
      micPromiseRef.current = micStart();
    }
  }

  function handleSend() {
    const trimmed = input.trim();
    const hasAnnotations = annotations.length > 0;
    if ((!trimmed && !attachedFiles.length && !hasAnnotations) || isRunning || !selectedSessionId) return;
    const files = attachedFiles.length
      ? attachedFiles.map(f => ({ name: f.name, base64: f.base64, mimeType: f.mimeType }))
      : undefined;
    const annotationText = formatAnnotations();
    const fullPrompt = annotationText
      ? `${annotationText}\n\n---\n\n${trimmed || "(see annotations above)"}`
      : trimmed || "(files attached)";
    setInput("");
    for (const f of attachedFiles) { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); }
    setAttachedFiles([]);
    clearAnnotations();
    sendMessage(fullPrompt, request, files);
  }

  return (
    <>
      {/* Annotation chips */}
      {annotations.length > 0 && (
        <div className="shrink-0 border-t border-alf-border px-2 py-1.5 flex flex-wrap gap-1.5" data-testid="annotation-chips">
          {annotations.map(a => {
            const label = a.context.attrs["ticket-id"] || a.context.attrs.file?.split("/").pop() || a.context.text.slice(0, 30);
            return (
              <div key={a.id} className="flex items-center gap-1 bg-purple-900/30 border border-purple-700/40 rounded px-2 py-1 text-xs font-mono text-purple-300">
                <span className="max-w-[100px] truncate" title={a.context.text}>{label}</span>
                <span className="text-purple-500/60 max-w-[80px] truncate" title={a.note}>{a.note.slice(0, 20)}</span>
                <button onClick={() => removeAnnotation(a.id)} className="text-purple-600 hover:text-red-400 ml-0.5">x</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Attached files chips */}
      {attachedFiles.length > 0 && (
        <div className="shrink-0 border-t border-alf-border px-2 py-1.5 flex flex-wrap gap-1.5" data-testid="attached-files">
          {attachedFiles.map(f => (
            <div key={f.id} className="flex items-center gap-1 bg-alf-surface rounded px-2 py-1 text-xs font-mono text-slate-300">
              {f.previewUrl ? (
                <img src={f.previewUrl} alt={f.name} className="w-6 h-6 rounded object-cover" />
              ) : (
                <span className="text-slate-500">{extBadge(f.name)}</span>
              )}
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button onClick={() => removeFile(f.id)} className="text-slate-600 hover:text-red-400 ml-0.5">x</button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className="shrink-0 border-t border-alf-border p-2 flex gap-2 items-center"
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; } }}
          data-testid="file-input"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isRunning}
          title="Attach files"
          data-testid="attach-btn"
          className="text-slate-600 hover:text-slate-300 transition-colors disabled:opacity-30 px-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <button
          onClick={handleMicToggle}
          disabled={isRunning || isTranscribing}
          title={isTranscribing ? "Transcribing..." : micState === "recording" ? "Stop recording" : "Voice message"}
          data-testid="mic-btn"
          className={`transition-colors disabled:opacity-30 px-1
            ${isTranscribing ? "text-amber-400 animate-pulse" : ""}
            ${micState === "recording" ? "text-red-400 animate-pulse" : ""}
            ${!isTranscribing && micState !== "recording" ? "text-slate-600 hover:text-slate-300" : ""}`}
        >
          {isTranscribing ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          onPaste={handlePaste}
          placeholder={isRunning ? "Waiting for response... (type your next message)" : "Send a message..."}
          rows={2}
          data-testid="prompt-input"
          className="flex-1 bg-alf-bg border border-alf-border rounded px-2 py-1 text-sm font-mono
                     text-slate-200 placeholder-slate-600 resize-none focus:outline-none
                     focus:border-slate-500 transition-colors"
        />
        <div className="flex flex-col gap-1 items-center">
          <button
            onClick={handleSend}
            disabled={isRunning || (!input.trim() && !attachedFiles.length && !annotations.length)}
            className="px-3 py-1 text-xs font-mono rounded border border-alf-border text-slate-400
                       hover:text-slate-200 hover:border-slate-500 transition-colors
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >send</button>
          {isRunning && (
            <button
              onClick={() => stopSession(request)}
              data-testid="stop-btn"
              title="Stop generation"
              className="px-2 py-0.5 text-xs font-mono rounded border border-red-900/50 text-red-400/70
                         hover:text-red-300 hover:border-red-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

type FeedItemData =
  | { kind: "user"; prompt: string }
  | { kind: "activity"; activityType: string; content: string; live?: boolean };

const FeedItem = React.memo(function FeedItem({ item }: { item: FeedItemData }) {
  if (item.kind === "user") {
    return (
      <div className="self-end max-w-[80%] bg-alf-surface rounded px-3 py-2">
        <p className="font-mono text-sm text-slate-200 whitespace-pre-wrap">{item.prompt}</p>
      </div>
    );
  }

  const isText = item.activityType === "text";
  const isFinished = !item.live;

  return (
    <div
      data-activity-type={item.activityType}
      className={`font-mono text-sm rounded px-3 py-2
      ${item.activityType === "thinking" ? "text-slate-500 text-xs bg-alf-canvas/50" : ""}
      ${item.activityType === "tool"     ? "text-amber-400/70 text-xs bg-alf-canvas/50" : ""}
      ${isText ? "text-slate-200" : ""}
      ${item.live ? "animate-pulse" : ""}`}
    >
      {!isText && (
        <span className="text-xs text-slate-600 mr-2 uppercase">[{item.activityType}]</span>
      )}
      {isText && isFinished ? (
        <div className="prose prose-invert prose-sm max-w-none">
          <MarkdownRenderer>{item.content}</MarkdownRenderer>
        </div>
      ) : (
        <span className="whitespace-pre-wrap">{item.content}</span>
      )}
    </div>
  );
});

export function AgentsPanel({ repo }: { repo: string }) {
  const { subscribe, request } = useRelay();
  const { loadSessions, appendDelta, turnDone } = useAgentsStore(
    useShallow(s => ({ loadSessions: s.loadSessions, appendDelta: s.appendDelta, turnDone: s.turnDone }))
  );

  usePanelInit((req) => {
    loadSessions(repo, req);
  });

  useEffect(() => {
    const unsubDelta = subscribe("agent/delta", (msg) => appendDelta(msg as unknown as AgentDelta));
    const unsubDone  = subscribe("agent/turn/done", (msg) => {
      const { sessionId } = msg as { sessionId: string };
      turnDone(sessionId, request);
    });
    return () => { unsubDelta(); unsubDone(); };
  }, []);

  return (
    <SidebarLayout
      defaultSize={28}
      minSize={18}
      sidebar={<SessionList repo={repo} />}
      main={<ChatView repo={repo} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFeed(
  turns: AgentTurn[],
  activities: AgentActivity[],
  live: LiveState | null,
  pendingPrompt: string | null,
): FeedItemData[] {
  const items: FeedItemData[] = [];

  if (live) {
    items.push({ kind: "activity", activityType: live.activityType, content: live.content, live: true });
  }
  if (pendingPrompt) {
    items.push({ kind: "user", prompt: pendingPrompt });
  }

  const turnsCopy = [...turns].reverse();
  for (const turn of turnsCopy) {
    const turnActivities = activities
      .filter(a => a.turn_id === turn.id)
      .sort((a, b) => a.idx - b.idx)
      .reverse();

    for (const act of turnActivities) {
      items.push({ kind: "activity", activityType: act.type, content: act.content });
    }
    items.push({ kind: "user", prompt: turn.prompt });
  }

  return items;
}

/** Extract file extension for display badge, e.g. "report.pdf" -> "PDF" */
function extBadge(name: string): string {
  const ext = name.split(".").pop()?.toUpperCase();
  return ext && ext !== name.toUpperCase() ? ext : "FILE";
}

/** If name already exists in the attached list, append -1, -2, etc. */
function deduplicateName(name: string, existing: AttachedFile[]): string {
  const names = new Set(existing.map(f => f.name));
  if (!names.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 1;
  while (names.has(`${stem}-${i}${ext}`)) i++;
  return `${stem}-${i}${ext}`;
}

/** Returns current timestamp, updating every 30s for relative time display. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Human-friendly relative timestamp. */
function relativeTime(timestamp: number, now: number): string {
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
