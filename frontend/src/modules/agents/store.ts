import { create } from "zustand";
import type {
  AgentSession, AgentTurn, AgentActivity, AgentDelta, AgentLastCoord,
  AgentSubscribeMsg, AgentUnsubscribeMsg, ContextUsage,
} from "@alf/types";
import { ScopedRequestCancelledError } from "../../core/useScopedRequest";

type WsRequest = <T>(msg: Record<string, unknown>) => Promise<T>;

// ---------------------------------------------------------------------------
// Persisted session helpers (keyed by repo)
// ---------------------------------------------------------------------------
const SESSION_STORAGE_KEY = "alf-agent-session";
function getPersistedSession(repo: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "{}");
    return map[repo] ?? null;
  } catch { return null; }
}
function setPersistedSession(repo: string, sessionId: string | null) {
  try {
    const map = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "{}");
    if (sessionId) map[repo] = sessionId;
    else delete map[repo];
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

interface DetailResponse {
  session: AgentSession;
  turns: AgentTurn[];
  activities: AgentActivity[];
  lastCoord: AgentLastCoord | null;
  contextUsage?: { contextTokens: number; maxContextTokens: number } | null;
}

/** Activity being built live from stream deltas — not yet persisted. */
export interface LiveState {
  activityType: "thinking" | "tool" | "text";
  content: string;
  idx: number;
}

export const AVAILABLE_IMPLS = ["claude-code", "codex", "test"] as const;

/** Models available per impl. Impls not listed here have no model selector. */
export const MODEL_OPTIONS: Record<string, string[]> = {
  "claude-code": ["claude-opus-4-6", "claude-sonnet-4-6", "claude-opus-4-7"],
  "codex": ["codex-high", "codex-max", "codex-medium", "codex-low"],
};

interface AgentsStore {
  sessions: AgentSession[];
  selectedSessionId: string | null;
  currentRepo: string | null; // repo currently loaded (set by loadSessions)
  turns: AgentTurn[];
  activities: AgentActivity[]; // only text activities for completed turns
  hiddenCounts: Record<string, number>; // turnId → count of non-text activities (for expand UI)
  live: LiveState | null;
  isRunning: boolean;
  pendingPrompt: string | null; // prompt sent but turn not yet done
  _focusTrigger: number; // incremented to trigger input focus
  selectedImpl: string; // active impl for new turns / sessions
  selectedModel: string; // active model (only used by impls in MODEL_OPTIONS)
  lastSeenMap: Record<string, number>; // sessionId → last-viewed timestamp (for unread indicator)
  contextUsage: ContextUsage | null; // latest context window usage for selected session
  lastCoord: AgentLastCoord | null; // incremental fetch cursor

  loadSessions: (repo: string, request: WsRequest) => void;
  selectSession: (id: string, request: WsRequest) => void;
  createSession: (repo: string, title: string, request: WsRequest) => void;
  forkSession: (request: WsRequest) => void;
  renameSession: (id: string, title: string, request: WsRequest) => void;
  deleteSession: (id: string, request: WsRequest) => void;
  sendMessage: (prompt: string, request: WsRequest, files?: { name: string; base64: string; mimeType: string }[]) => void;
  stopSession: (request: WsRequest) => void;
  setSelectedImpl: (impl: string) => void;
  setSelectedModel: (model: string) => void;
  appendDelta: (delta: AgentDelta) => void;
  turnDone: (sessionId: string, request: WsRequest, usage?: ContextUsage) => void;
}

export const useAgentsStore = create<AgentsStore>((set, get) => ({
  sessions: [],
  selectedSessionId: null,
  currentRepo: null,
  turns: [],
  activities: [],
  hiddenCounts: {},
  live: null,
  isRunning: false,
  pendingPrompt: null,
  _focusTrigger: 0,
  selectedImpl: "claude-code",
  selectedModel: "claude-opus-4-6",
  contextUsage: null,
  lastCoord: null,
  lastSeenMap: JSON.parse(localStorage.getItem("alf-agent-last-seen") || "{}"),

  loadSessions: (repo, request) => {
    const isRepoChange = get().currentRepo !== repo;

    if (isRepoChange) {
      // Unsubscribe from the previously selected session (different repo)
      const prev = get().selectedSessionId;
      if (prev) {
        request<AgentUnsubscribeMsg>({ type: "agent/unsubscribe", sessionId: prev }).catch(console.error);
      }
      // Clear all session-specific state so stale data from old repo doesn't leak
      set({
        sessions: [],
        selectedSessionId: null,
        currentRepo: repo,
        turns: [],
        activities: [],
        hiddenCounts: {},
        live: null,
        isRunning: false,
        pendingPrompt: null,
        contextUsage: null,
        lastCoord: null,
      });
    } else {
      // Same repo (reconnect) — re-subscribe if we had a selected session
      const prev = get().selectedSessionId;
      if (prev) {
        request<AgentSubscribeMsg>({ type: "agent/subscribe", sessionId: prev }).catch(console.error);
      }
    }

    request<{ sessions: AgentSession[] }>({ type: "agent/sessions/list", repo })
      .then(res => {
        set({ sessions: res.sessions.sort((a, b) => b.updated_at - a.updated_at) });
        if (isRepoChange) {
          // Auto-restore persisted session for this repo
          const persisted = getPersistedSession(repo);
          if (persisted && res.sessions.some(s => s.id === persisted)) {
            get().selectSession(persisted, request);
          }
        }
      })
      .catch((err) => {
        if (!(err instanceof ScopedRequestCancelledError)) console.error(err);
      });
  },

  selectSession: (id, request) => {
    const prev = get().selectedSessionId;
    if (prev && prev !== id) {
      request<AgentUnsubscribeMsg>({ type: "agent/unsubscribe", sessionId: prev }).catch(console.error);
    }
    const map = { ...get().lastSeenMap, [id]: Date.now() };
    localStorage.setItem("alf-agent-last-seen", JSON.stringify(map));
    set(s => ({ selectedSessionId: id, turns: [], activities: [], hiddenCounts: {}, live: null, isRunning: false, pendingPrompt: null, contextUsage: null, lastCoord: null, _focusTrigger: s._focusTrigger + 1, lastSeenMap: map }));
    // Persist selected session for the current repo
    const repo = get().currentRepo;
    if (repo) setPersistedSession(repo, id);
    request<DetailResponse>({ type: "agent/session/detail", sessionId: id })
      .then(res => {
        const { textActivities, hiddenCounts } = filterActivities(res.activities);
        // Derive isRunning: if the last turn has no completed_at, session is still running
        const lastTurn = res.turns.length > 0 ? res.turns[res.turns.length - 1] : null;
        const stillRunning = lastTurn !== null && lastTurn.completed_at === null;
        set({ turns: res.turns, activities: textActivities, hiddenCounts, lastCoord: res.lastCoord, contextUsage: res.contextUsage ?? null, isRunning: stillRunning });
      })
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
      .then(() => {
        // Clear persisted session if deleting the currently persisted one
        const repo = get().currentRepo;
        if (repo && getPersistedSession(repo) === id) {
          setPersistedSession(repo, null);
        }
        set(s => {
          const sessions = s.sessions.filter(sess => sess.id !== id);
          const cleared = s.selectedSessionId === id
            ? { selectedSessionId: null, turns: [], activities: [], hiddenCounts: {}, live: null, isRunning: false, pendingPrompt: null, contextUsage: null, lastCoord: null }
            : {};
          return { sessions, ...cleared };
        });
      })
      .catch(console.error);
  },

  sendMessage: (prompt, request, files) => {
    const sid = get().selectedSessionId;
    if (!sid || get().isRunning) return;
    const impl = get().selectedImpl;
    const model = MODEL_OPTIONS[impl] ? get().selectedModel : undefined;
    const now = Date.now();
    set(s => ({
      isRunning: true, pendingPrompt: prompt, live: null,
      sessions: s.sessions
        .map(sess => sess.id === sid ? { ...sess, updated_at: now } : sess)
        .sort((a, b) => b.updated_at - a.updated_at),
    }));
    request<{ sessionId: string; status: string }>({
      type: "agent/message", sessionId: sid, prompt, impl, model,
      ...(files?.length ? { files } : {}),
    }).catch(console.error);
    // Actual response content arrives via agent/delta push → appendDelta
  },

  stopSession: (request) => {
    const sid = get().selectedSessionId;
    if (!sid || !get().isRunning) return;
    request<{ ok: boolean }>({ type: "agent/stop", sessionId: sid }).catch(console.error);
    // turnDone will be triggered by the server via agent/turn/done push
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

  turnDone: (sessionId, request, usage) => {
    if (sessionId !== get().selectedSessionId) return;
    const now = Date.now();
    const map = { ...get().lastSeenMap, [sessionId]: now };
    localStorage.setItem("alf-agent-last-seen", JSON.stringify(map));
    const coord = get().lastCoord;
    set(s => ({
      live: null, isRunning: false, pendingPrompt: null, lastSeenMap: map,
      contextUsage: usage ?? s.contextUsage,
      sessions: s.sessions
        .map(sess => sess.id === sessionId ? { ...sess, updated_at: now } : sess)
        .sort((a, b) => b.updated_at - a.updated_at),
    }));
    // Incremental fetch — only new turns/activities since last known coord
    const detailMsg: Record<string, unknown> = { type: "agent/session/detail", sessionId };
    if (coord) {
      detailMsg.afterTurnIdx = coord.turnIdx;
      detailMsg.afterActivityIdx = coord.activityIdx;
    }
    request<DetailResponse>(detailMsg)
      .then(res => set(s => {
        const { textActivities, hiddenCounts } = filterActivities(res.activities);
        return {
          turns: coord ? mergeTurns(s.turns, res.turns) : res.turns,
          activities: coord ? [...s.activities, ...textActivities] : textActivities,
          hiddenCounts: coord ? { ...s.hiddenCounts, ...hiddenCounts } : hiddenCounts,
          lastCoord: res.lastCoord ?? s.lastCoord,
          contextUsage: res.contextUsage ?? s.contextUsage,
        };
      }))
      .catch(console.error);
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge incoming turns into existing (upsert by id — a turn may appear in both if just completed). */
function mergeTurns(existing: AgentTurn[], incoming: AgentTurn[]): AgentTurn[] {
  const map = new Map(existing.map(t => [t.id, t]));
  for (const t of incoming) map.set(t.id, t); // upsert
  return [...map.values()].sort((a, b) => a.idx - b.idx);
}

/** Filter activities: keep only text activities, compute hidden counts per turn. */
function filterActivities(activities: AgentActivity[]): {
  textActivities: AgentActivity[];
  hiddenCounts: Record<string, number>;
} {
  const textActivities: AgentActivity[] = [];
  const hiddenCounts: Record<string, number> = {};
  for (const a of activities) {
    if (a.type === "text") {
      textActivities.push(a);
    } else {
      hiddenCounts[a.turn_id] = (hiddenCounts[a.turn_id] ?? 0) + 1;
    }
  }
  return { textActivities, hiddenCounts };
}
