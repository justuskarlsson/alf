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

export const AVAILABLE_IMPLS = ["claude-code", "test"] as const;

/** Models available per impl. Impls not listed here have no model selector. */
export const MODEL_OPTIONS: Record<string, string[]> = {
  "claude-code": ["claude-opus-4-6", "claude-sonnet-4-6", "claude-opus-4-7"],
};

interface AgentsStore {
  sessions: AgentSession[];
  selectedSessionId: string | null;
  turns: AgentTurn[];
  activities: AgentActivity[];
  live: LiveState | null;
  isRunning: boolean;
  pendingPrompt: string | null; // prompt sent but turn not yet done
  _focusTrigger: number; // incremented to trigger input focus
  selectedImpl: string; // active impl for new turns / sessions
  selectedModel: string; // active model (only used by impls in MODEL_OPTIONS)

  loadSessions: (repo: string, request: WsRequest) => void;
  selectSession: (id: string, request: WsRequest) => void;
  createSession: (repo: string, title: string, request: WsRequest) => void;
  forkSession: (request: WsRequest) => void;
  renameSession: (id: string, title: string, request: WsRequest) => void;
  deleteSession: (id: string, request: WsRequest) => void;
  sendMessage: (prompt: string, request: WsRequest, files?: { name: string; base64: string; mimeType: string }[]) => void;
  setSelectedImpl: (impl: string) => void;
  setSelectedModel: (model: string) => void;
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
  _focusTrigger: 0,
  selectedImpl: "claude-code",
  selectedModel: "claude-opus-4-6",

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
    set(s => ({ selectedSessionId: id, turns: [], activities: [], live: null, isRunning: false, pendingPrompt: null, _focusTrigger: s._focusTrigger + 1 }));
    request<DetailResponse>({ type: "agent/session/detail", sessionId: id })
      .then(res => set({ turns: res.turns, activities: res.activities }))
      .catch(console.error);
    request<AgentSubscribeMsg>({ type: "agent/subscribe", sessionId: id })
      .catch(console.error);
  },

  createSession: (repo, title, request) => {
    const impl = get().selectedImpl;
    request<{ sessionId: string }>({ type: "agent/session/create", repo, impl })
      .then(res => {
        // Set title if not default, then optimistically prepend and select
        const finalTitle = title || "New session";
        if (title) {
          request<{ ok: boolean }>({ type: "agent/session/update", sessionId: res.sessionId, title: finalTitle })
            .catch(console.error);
        }
        const stub: AgentSession = {
          id: res.sessionId, repo_id: "", title: finalTitle,
          sdk_session_id: null, impl,
          forked_from: null, fork_point_turn_idx: null,
          created_at: Date.now(), updated_at: Date.now(),
        };
        set(s => ({ sessions: [stub, ...s.sessions] }));
        get().selectSession(res.sessionId, request);
      })
      .catch(console.error);
  },

  forkSession: (request) => {
    const sid = get().selectedSessionId;
    if (!sid || get().isRunning) return;
    request<{ sessionId: string }>({
      type: "agent/session/create",
      forkedFrom: { sessionId: sid },
    })
      .then(res => {
        const parent = get().sessions.find(s => s.id === sid);
        const stub: AgentSession = {
          id: res.sessionId, repo_id: parent?.repo_id ?? "", title: `Fork of ${parent?.title ?? "session"}`,
          sdk_session_id: null, impl: parent?.impl ?? get().selectedImpl,
          forked_from: sid, fork_point_turn_idx: null,
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

  deleteSession: (id, request) => {
    request<{ ok: boolean }>({ type: "agent/session/delete", sessionId: id })
      .then(() => set(s => {
        const sessions = s.sessions.filter(sess => sess.id !== id);
        const cleared = s.selectedSessionId === id
          ? { selectedSessionId: null, turns: [], activities: [], live: null, isRunning: false, pendingPrompt: null }
          : {};
        return { sessions, ...cleared };
      }))
      .catch(console.error);
  },

  sendMessage: (prompt, request, files) => {
    const sid = get().selectedSessionId;
    if (!sid || get().isRunning) return;
    const impl = get().selectedImpl;
    const model = MODEL_OPTIONS[impl] ? get().selectedModel : undefined;
    set({ isRunning: true, pendingPrompt: prompt, live: null });
    request<{ sessionId: string; status: string }>({
      type: "agent/message", sessionId: sid, prompt, impl, model,
      ...(files?.length ? { files } : {}),
    }).catch(console.error);
    // Actual response content arrives via agent/delta push → appendDelta
  },

  setSelectedImpl: (impl) => {
    const models = MODEL_OPTIONS[impl];
    set({ selectedImpl: impl, ...(models ? { selectedModel: models[0] } : {}) });
  },

  setSelectedModel: (model) => set({ selectedModel: model }),

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
