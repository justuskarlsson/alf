import { create } from "zustand";
import type {
  AgentSession, AgentTurn, AgentActivity, AgentDelta, AgentLastCoord,
  AgentSubscribeMsg, AgentUnsubscribeMsg,
} from "@alf/types";

type WsRequest = <T>(msg: Record<string, unknown>) => Promise<T>;

interface DetailResponse {
  session: AgentSession;
  turns: AgentTurn[];
  activities: AgentActivity[];
  lastCoord: AgentLastCoord | null;
}

/** Activity being built live from stream deltas — not yet persisted. */
export interface LiveState {
  activityType: "thinking" | "tool" | "text";
  content: string;
  idx: number;
}

interface AgentsStore {
  sessions: AgentSession[];
  selectedSessionId: string | null;
  turns: AgentTurn[];
  activities: AgentActivity[];
  live: LiveState | null;
  isRunning: boolean;
  pendingPrompt: string | null; // prompt sent but turn not yet done

  loadSessions: (repo: string, request: WsRequest) => void;
  selectSession: (id: string, request: WsRequest) => void;
  createSession: (repo: string, title: string, request: WsRequest) => void;
  renameSession: (id: string, title: string, request: WsRequest) => void;
  sendMessage: (prompt: string, request: WsRequest) => void;
  appendDelta: (delta: AgentDelta) => void;
  turnDone: (sessionId: string, request: WsRequest) => void;
}

export const useAgentsStore = create<AgentsStore>((set, get) => ({
  sessions: [],
  selectedSessionId: null,
  turns: [],
  activities: [],
  live: null,
  isRunning: false,
  pendingPrompt: null,

  loadSessions: (repo, request) => {
    set({ sessions: [] });
    request<{ sessions: AgentSession[] }>({ type: "agent/sessions/list", repo })
      .then(res => set({ sessions: res.sessions }))
      .catch(console.error);
  },

  selectSession: (id, request) => {
    const prev = get().selectedSessionId;
    if (prev && prev !== id) {
      request<AgentUnsubscribeMsg>({ type: "agent/unsubscribe", sessionId: prev }).catch(console.error);
    }
    set({ selectedSessionId: id, turns: [], activities: [], live: null, isRunning: false, pendingPrompt: null });
    request<DetailResponse>({ type: "agent/session/detail", sessionId: id })
      .then(res => set({ turns: res.turns, activities: res.activities }))
      .catch(console.error);
    request<AgentSubscribeMsg>({ type: "agent/subscribe", sessionId: id })
      .catch(console.error);
  },

  createSession: (repo, title, request) => {
    request<{ sessionId: string }>({ type: "agent/session/create", repo })
      .then(res => {
        // Set title if not default, then optimistically prepend and select
        const finalTitle = title || "New session";
        if (title) {
          request<{ ok: boolean }>({ type: "agent/session/update", sessionId: res.sessionId, title: finalTitle })
            .catch(console.error);
        }
        const stub: AgentSession = {
          id: res.sessionId, repo_id: "", title: finalTitle,
          sdk_session_id: null, impl: "test",
          created_at: Date.now(), updated_at: Date.now(),
        };
        set(s => ({ sessions: [stub, ...s.sessions] }));
        get().selectSession(res.sessionId, request);
      })
      .catch(console.error);
  },

  renameSession: (id, title, request) => {
    request<{ ok: boolean }>({ type: "agent/session/update", sessionId: id, title })
      .then(() => set(s => ({
        sessions: s.sessions.map(s => s.id === id ? { ...s, title } : s),
      })))
      .catch(console.error);
  },

  sendMessage: (prompt, request) => {
    const sid = get().selectedSessionId;
    if (!sid || get().isRunning) return;
    set({ isRunning: true, pendingPrompt: prompt, live: null });
    request<{ sessionId: string; status: string }>({
      type: "agent/message", sessionId: sid, prompt,
    }).catch(console.error);
    // Actual response content arrives via agent/delta push → appendDelta
  },

  appendDelta: (delta) => {
    if (delta.sessionId !== get().selectedSessionId) return;
    set(s => {
      const prev = s.live;
      if (!prev || prev.idx !== delta.idx) {
        // New activity starting
        return { live: { activityType: delta.activityType, content: delta.content, idx: delta.idx } };
      }
      return { live: { ...prev, content: prev.content + delta.content } };
    });
  },

  turnDone: (sessionId, request) => {
    if (sessionId !== get().selectedSessionId) return;
    set({ live: null, isRunning: false, pendingPrompt: null });
    // Reload persisted state from DB
    request<DetailResponse>({ type: "agent/session/detail", sessionId })
      .then(res => set({ turns: res.turns, activities: res.activities }))
      .catch(console.error);
    // Refresh session list so updated_at order is correct
    // (caller has repo in scope via closure — we rely on the panel to do this)
  },
}));
