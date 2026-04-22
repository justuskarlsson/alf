import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useShallow } from "zustand/react/shallow";
import { useRelay } from "../../core/RelayProvider";
import { usePanelInit } from "../../core/usePanelInit";
import { Panel, SidebarLayout, PanelHeader, EmptyState } from "../../panels/Panel";
import { useAgentsStore, AVAILABLE_IMPLS, MODEL_OPTIONS, type LiveState } from "./store";
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
              onSelect={() => selectSession(s.id, request)}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}

function SessionRow({ session, selected, onSelect }: {
  session: AgentSession; selected: boolean; onSelect: () => void;
}) {
  const { request } = useRelay();
  const renameSession = useAgentsStore(s => s.renameSession);
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
      className={`px-3 py-2 cursor-pointer select-none transition-colors
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
        <div className="font-mono text-sm text-slate-200 truncate">{session.title}</div>
      )}
      <div className="font-mono text-xs text-slate-600 mt-0.5">
        {new Date(session.updated_at).toLocaleDateString()}
      </div>
    </div>
  );
}

function ChatView({ repo }: { repo: string }) {
  const { request } = useRelay();
  const {
    selectedSessionId, turns, activities, live, isRunning, pendingPrompt, sendMessage,
    selectedImpl, setSelectedImpl, selectedModel, setSelectedModel,
  } = useAgentsStore(useShallow(s => ({
    selectedSessionId: s.selectedSessionId,
    turns: s.turns,
    activities: s.activities,
    live: s.live,
    isRunning: s.isRunning,
    pendingPrompt: s.pendingPrompt,
    sendMessage: s.sendMessage,
    selectedImpl: s.selectedImpl,
    setSelectedImpl: s.setSelectedImpl,
    selectedModel: s.selectedModel,
    setSelectedModel: s.setSelectedModel,
  })));

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input whenever _focusTrigger increments (session select/create).
  // Subscribe directly to the store to avoid deps in useEffect.
  // Use requestAnimationFrame to wait for React to render the input (important
  // when ChatView transitions from EmptyState to the input form).
  useEffect(() => {
    let prev = useAgentsStore.getState()._focusTrigger;
    const unsub = useAgentsStore.subscribe((state) => {
      if (state._focusTrigger !== prev) {
        prev = state._focusTrigger;
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    });
    return unsub;
  }, []);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isRunning || !selectedSessionId) return;
    setInput("");
    sendMessage(trimmed, request);
  }

  if (!selectedSessionId) return <EmptyState message="Select or create a session" />;

  // Build flat activity feed, newest on top
  const feed = buildFeed(turns, activities, live, pendingPrompt);

  return (
    <Panel>
      {/* Impl + model selector header */}
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
        </div>
      </PanelHeader>

      {/* Activity feed — newest on top */}
      <div className="flex-1 overflow-auto flex flex-col-reverse" data-testid="chat-feed">
        <div className="flex flex-col-reverse gap-2 p-3">
          {feed.map((item, i) => <FeedItem key={i} item={item} />)}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-alf-border p-2 flex gap-2 items-center">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={isRunning ? "Waiting for response…" : "Send a message…"}
          disabled={isRunning}
          rows={2}
          data-testid="prompt-input"
          className="flex-1 bg-alf-bg border border-alf-border rounded px-2 py-1 text-sm font-mono
                     text-slate-200 placeholder-slate-600 resize-none focus:outline-none
                     focus:border-slate-500 transition-colors disabled:opacity-40"
        />
        <button
          onClick={handleSend}
          disabled={isRunning || !input.trim()}
          className="px-3 py-1 text-xs font-mono rounded border border-alf-border text-slate-400
                     hover:text-slate-200 hover:border-slate-500 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed"
        >send</button>
      </div>
    </Panel>
  );
}

type FeedItemData =
  | { kind: "user"; prompt: string }
  | { kind: "activity"; activityType: string; content: string; live?: boolean };

function FeedItem({ item }: { item: FeedItemData }) {
  if (item.kind === "user") {
    return (
      <div className="self-end max-w-[80%] bg-alf-surface rounded px-3 py-2">
        <p className="font-mono text-sm text-slate-200 whitespace-pre-wrap">{item.prompt}</p>
      </div>
    );
  }

  // Render finished text activities as markdown, everything else as plain text
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
        </div>
      ) : (
        <span className="whitespace-pre-wrap">{item.content}</span>
      )}
    </div>
  );
}

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

  // Live (streaming) activity at the front — will be reversed to top
  if (live) {
    items.push({ kind: "activity", activityType: live.activityType, content: live.content, live: true });
  }
  if (pendingPrompt) {
    items.push({ kind: "user", prompt: pendingPrompt });
  }

  // Historical turns + activities, newest turn first
  const turnsCopy = [...turns].reverse();
  for (const turn of turnsCopy) {
    const turnActivities = activities
      .filter(a => a.turn_id === turn.id)
      .sort((a, b) => a.idx - b.idx)
      .reverse(); // newest activity on top within the turn

    for (const act of turnActivities) {
      items.push({ kind: "activity", activityType: act.type, content: act.content });
    }
    items.push({ kind: "user", prompt: turn.prompt });
  }

  return items;
}
