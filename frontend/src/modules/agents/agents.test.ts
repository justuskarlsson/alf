/**
 * Smoke tests for useAgentsStore — pure state logic, no DOM required.
 *
 * We exercise the store directly via getState()/setState() so there's no
 * need to mount React components or mock hooks.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAgentsStore } from "./store";
import type { AgentDelta } from "@alf/types";

// ── helpers ─────────────────────────────────────────────────────────────────

function resetStore() {
  useAgentsStore.setState({
    sessions: [],
    selectedSessionId: null,
    turns: [],
    activities: [],
    live: null,
    isRunning: false,
    pendingPrompt: null,
  });
}

function makeRequest<T>(result: T) {
  return vi.fn().mockResolvedValue(result);
}

function delta(overrides: Partial<AgentDelta> = {}): AgentDelta {
  return {
    sessionId: "s1",
    activityType: "text",
    content: "hello",
    idx: 0,
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("useAgentsStore", () => {
  beforeEach(resetStore);

  // Initial state
  it("starts empty", () => {
    const s = useAgentsStore.getState();
    expect(s.sessions).toEqual([]);
    expect(s.selectedSessionId).toBeNull();
    expect(s.live).toBeNull();
    expect(s.isRunning).toBe(false);
  });

  // appendDelta — same idx accumulates
  it("appendDelta accumulates content for same idx", () => {
    useAgentsStore.setState({ selectedSessionId: "s1", live: null });
    const { appendDelta } = useAgentsStore.getState();

    appendDelta(delta({ content: "foo", idx: 0 }));
    appendDelta(delta({ content: "bar", idx: 0 }));

    expect(useAgentsStore.getState().live?.content).toBe("foobar");
    expect(useAgentsStore.getState().live?.idx).toBe(0);
  });

  // appendDelta — idx change starts a new activity
  it("appendDelta starts new activity when idx changes", () => {
    useAgentsStore.setState({ selectedSessionId: "s1", live: null });
    const { appendDelta } = useAgentsStore.getState();

    appendDelta(delta({ content: "thinking…", activityType: "thinking", idx: 0 }));
    expect(useAgentsStore.getState().live?.activityType).toBe("thinking");

    appendDelta(delta({ content: "result", activityType: "text", idx: 1 }));
    const live = useAgentsStore.getState().live!;
    expect(live.activityType).toBe("text");
    expect(live.content).toBe("result");
    expect(live.idx).toBe(1);
  });

  // appendDelta — ignores deltas for non-selected session
  it("appendDelta ignores deltas for a different session", () => {
    useAgentsStore.setState({ selectedSessionId: "s2", live: null });
    const { appendDelta } = useAgentsStore.getState();

    appendDelta(delta({ sessionId: "s1" }));

    expect(useAgentsStore.getState().live).toBeNull();
  });

  // sendMessage — sets isRunning + pendingPrompt
  it("sendMessage sets isRunning and pendingPrompt", () => {
    const req = makeRequest({ sessionId: "s1", status: "running" });
    useAgentsStore.setState({ selectedSessionId: "s1", isRunning: false });
    useAgentsStore.getState().sendMessage("do something", req);

    const s = useAgentsStore.getState();
    expect(s.isRunning).toBe(true);
    expect(s.pendingPrompt).toBe("do something");
    expect(s.live).toBeNull();
  });

  // sendMessage — no-op when already running
  it("sendMessage is a no-op when already running", () => {
    const req = makeRequest({ sessionId: "s1", status: "running" });
    useAgentsStore.setState({ selectedSessionId: "s1", isRunning: true, pendingPrompt: "previous" });
    useAgentsStore.getState().sendMessage("new message", req);

    expect(req).not.toHaveBeenCalled();
    expect(useAgentsStore.getState().pendingPrompt).toBe("previous");
  });

  // turnDone — clears live/running/pending, reloads detail
  it("turnDone clears live state and reloads persisted data", async () => {
    const turns = [{ id: "t1", session_id: "s1", prompt: "hi", idx: 0, created_at: 0, completed_at: 1 }];
    const activities = [{ id: "a1", turn_id: "t1", session_id: "s1", type: "text", content: "response", idx: 0, created_at: 1 }];
    const req = makeRequest({ session: {}, turns, activities, lastCoord: { turnIdx: 0, activityIdx: 0 } });

    useAgentsStore.setState({
      selectedSessionId: "s1",
      isRunning: true,
      pendingPrompt: "hi",
      live: { activityType: "text", content: "resp", idx: 0 },
    });

    useAgentsStore.getState().turnDone("s1", req);

    // Immediate sync state
    const s = useAgentsStore.getState();
    expect(s.live).toBeNull();
    expect(s.isRunning).toBe(false);
    expect(s.pendingPrompt).toBeNull();

    // After async reload
    await vi.waitFor(() => useAgentsStore.getState().turns.length > 0);
    expect(useAgentsStore.getState().turns).toEqual(turns);
    expect(useAgentsStore.getState().activities).toEqual(activities);
  });

  // turnDone — ignores for non-selected session
  it("turnDone ignores events for a different session", () => {
    const req = makeRequest({});
    useAgentsStore.setState({ selectedSessionId: "s2", isRunning: true });
    useAgentsStore.getState().turnDone("s1", req);

    expect(req).not.toHaveBeenCalled();
    expect(useAgentsStore.getState().isRunning).toBe(true);
  });
});
