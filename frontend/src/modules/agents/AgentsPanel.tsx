import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRelay } from "../../core/RelayProvider";
import { usePanelInit } from "../../core/usePanelInit";
import { Panel, SidebarLayout, EmptyState } from "../../panels/Panel";
import { useAgentsStore } from "./store";
import type { AgentActivity, AgentDelta, AgentSession } from "@alf/types";

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

  return (
    <Panel>
      <div className="px-3 py-2 border-b border-alf-border shrink-0 flex items-center justify-between">
        <span className="font-mono text-xs text-slate-500 uppercase tracking-widest">Sessions</span>
        <button
          onClick={() => createSession(repo, request)}
          className="font-mono text-xs text-slate-500 hover:text-slate-200 transition-colors"
          title="New session"
        >+ new</button>
      </div>
      <div className="flex-1 overflow-auto">
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
  return (
    <div
      onClick={onSelect}
      className={`px-3 py-2 cursor-pointer select-none transition-colors
        ${selected ? "bg-alf-surface" : "hover:bg-alf-surface/60"}`}
    >
      <div className="font-mono text-sm text-slate-200 truncate">{session.title}</div>
      <div className="font-mono text-xs text-slate-600 mt-0.5">
        {new Date(session.updated_at).toLocaleDateString()}
      </div>
    </div>
  );
}

function ChatView({ repo }: { repo: string }) {
  const { request } = useRelay();
  const { selectedSessionId, turns, activities, live, isRunning, pendingPrompt, sendMessage, loadSessions } =
    useAgentsStore(useShallow(s => ({
      selectedSessionId: s.selectedSessionId,
      turns: s.turns,
      activities: s.activities,
      live: s.live,
      isRunning: s.isRunning,
      pendingPrompt: s.pendingPrompt,
      sendMessage: s.sendMessage,
      loadSessions: s.loadSessions,
    })));

  const [input, setInput] = useState("");

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
      {/* Activity feed — newest on top */}
      <div className="flex-1 overflow-auto flex flex-col-reverse">
        <div className="flex flex-col-reverse gap-2 p-3">
          {feed.map((item, i) => <FeedItem key={i} item={item} />)}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-alf-border p-2 flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={isRunning ? "Waiting for response…" : "Send a message…"}
          disabled={isRunning}
          rows={2}
          className="flex-1 bg-alf-bg border border-alf-border rounded px-2 py-1 text-sm font-mono
                     text-slate-200 placeholder-slate-600 resize-none focus:outline-none
                     focus:border-slate-500 transition-colors disabled:opacity-40"
        />
        <button
          onClick={handleSend}
          disabled={isRunning || !input.trim()}
          className="px-3 py-1 text-xs font-mono rounded border border-alf-border text-slate-400
                     hover:text-slate-200 hover:border-slate-500 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed self-end"
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
  return (
    <div className={`font-mono text-sm whitespace-pre-wrap rounded px-3 py-2
      ${item.activityType === "thinking" ? "text-slate-500 text-xs bg-alf-canvas/50" : ""}
      ${item.activityType === "tool"     ? "text-amber-400/70 text-xs bg-alf-canvas/50" : ""}
      ${item.activityType === "text"     ? "text-slate-200" : ""}
      ${item.live ? "animate-pulse" : ""}`}
    >
      {item.activityType !== "text" && (
        <span className="text-xs text-slate-600 mr-2 uppercase">[{item.activityType}]</span>
      )}
      {item.content}
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
    const unsubDelta = subscribe("agent/delta", (msg) => appendDelta(msg as AgentDelta));
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
  turns: ReturnType<typeof useAgentsStore.getState>["turns"],
  activities: AgentActivity[],
  live: ReturnType<typeof useAgentsStore.getState>["live"],
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
