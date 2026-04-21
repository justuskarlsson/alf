import { describe, it, expect, beforeEach, vi } from "vitest";
import { initDb, dbActivities, dbTurns, dbSessions, dbRepos } from "../db/index.js";
import { initSession, runTurn } from "./index.js";
import { AgentsModule } from "../../modules/agents/index.js";
import { initPush } from "../dispatch.js";
import { testImpl } from "../../modules/agents/implementations/test.js";
import type { LiveDelta } from "./types.js";

const LIVE = process.env.RUN_LIVE_TESTS === "1";

beforeEach(() => {
  initDb(":memory:");
  process.env.TEST_IMPL_DELAY_MS = "0";
});

// ---------------------------------------------------------------------------
// initSession
// ---------------------------------------------------------------------------

describe("initSession", () => {
  it("creates a repo and session, returns sessionId", () => {
    const sid = initSession("/repos/myapp", "test");
    expect(sid).toBeTruthy();
    const session = dbSessions.get(sid);
    expect(session?.impl).toBe("test");
    expect(session?.title).toBe("New session");
  });

  it("reuses the same repo for the same path", () => {
    const s1 = initSession("/repos/myapp", "test");
    const s2 = initSession("/repos/myapp", "test");
    const sess1 = dbSessions.get(s1)!;
    const sess2 = dbSessions.get(s2)!;
    expect(sess1.repo_id).toBe(sess2.repo_id);
  });
});

// ---------------------------------------------------------------------------
// runTurn — DB writes
// ---------------------------------------------------------------------------

describe("runTurn — DB writes", () => {
  it("creates a turn row", async () => {
    const sid = initSession("/repos/myapp", "test");
    await runTurn(sid, "ping", testImpl, () => {});
    const turns = dbTurns.list(sid);
    expect(turns).toHaveLength(1);
    expect(turns[0].prompt).toBe("ping");
    expect(turns[0].completed_at).toBeGreaterThan(0);
  });

  it("persists 3 activities (thinking, tool, text)", async () => {
    const sid = initSession("/repos/myapp", "test");
    await runTurn(sid, "hello", testImpl, () => {});
    const acts = dbActivities.listForSession(sid);
    expect(acts).toHaveLength(3);
    expect(acts.map(a => a.type)).toEqual(["thinking", "tool", "text"]);
  });

  it("activity idx is 0-based and resets each turn", async () => {
    const sid = initSession("/repos/myapp", "test");
    await runTurn(sid, "turn 1", testImpl, () => {});
    await runTurn(sid, "turn 2", testImpl, () => {});
    const acts = dbActivities.listForSession(sid);
    // Both turns produce [0, 1, 2]
    expect(acts.map(a => a.idx)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it("text activity echoes the prompt", async () => {
    const sid = initSession("/repos/myapp", "test");
    await runTurn(sid, "ping", testImpl, () => {});
    const acts = dbActivities.listForSession(sid);
    const text = acts.find(a => a.type === "text");
    expect(text?.content).toBe("Echo: ping");
  });

  it("tool activity is a short formatted string", async () => {
    const sid = initSession("/repos/myapp", "test");
    await runTurn(sid, "ping", testImpl, () => {});
    const tool = dbActivities.listForSession(sid).find(a => a.type === "tool");
    expect(tool?.content).toMatch(/^read_file:/);
  });

  it("lastCoord after one turn is { turnIdx: 0, activityIdx: 2 }", async () => {
    const sid = initSession("/repos/myapp", "test");
    await runTurn(sid, "ping", testImpl, () => {});
    expect(dbActivities.lastCoord(sid)).toEqual({ turnIdx: 0, activityIdx: 2 });
  });

  it("lastCoord after two turns is { turnIdx: 1, activityIdx: 2 }", async () => {
    const sid = initSession("/repos/myapp", "test");
    await runTurn(sid, "first", testImpl, () => {});
    await runTurn(sid, "second", testImpl, () => {});
    expect(dbActivities.lastCoord(sid)).toEqual({ turnIdx: 1, activityIdx: 2 });
  });
});

// ---------------------------------------------------------------------------
// runTurn — stream sink
// ---------------------------------------------------------------------------

describe("runTurn — stream sink", () => {
  it("calls sink with deltas for all 3 activity types", async () => {
    const sid = initSession("/repos/myapp", "test");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", testImpl, d => deltas.push(d));

    const types = [...new Set(deltas.map(d => d.activityType))];
    expect(types).toContain("thinking");
    expect(types).toContain("tool");
    expect(types).toContain("text");
  });

  it("sink deltas have correct sessionId", async () => {
    const sid = initSession("/repos/myapp", "test");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", testImpl, d => deltas.push(d));
    expect(deltas.every(d => d.sessionId === sid)).toBe(true);
  });

  it("sink idx stays constant within one activity, then resets for next", async () => {
    const sid = initSession("/repos/myapp", "test");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", testImpl, d => deltas.push(d));

    // Group by idx — should be 3 groups: 0, 1, 2
    const idxGroups = [...new Set(deltas.map(d => d.idx))];
    expect(idxGroups).toEqual([0, 1, 2]);
  });

  it("text deltas concatenate to the final persisted content", async () => {
    const sid = initSession("/repos/myapp", "test");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", testImpl, d => deltas.push(d));

    const textDeltas = deltas.filter(d => d.activityType === "text");
    const assembled = textDeltas.map(d => d.content).join("");
    const stored = dbActivities.listForSession(sid).find(a => a.type === "text")!.content;
    expect(assembled).toBe(stored);
  });

  it("sink is not called after runTurn resolves (no stray async leaks)", async () => {
    const sid = initSession("/repos/myapp", "test");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", testImpl, d => deltas.push(d));
    const countAfter = deltas.length;
    await new Promise(r => setTimeout(r, 10));
    expect(deltas.length).toBe(countAfter);
  });
});

// ---------------------------------------------------------------------------
// runTurn — error cases
// ---------------------------------------------------------------------------

describe("runTurn — errors", () => {
  it("throws if session not found", async () => {
    initDb(":memory:");
    await expect(runTurn("bad-id", "ping", testImpl, () => {}))
      .rejects.toThrow("Session not found");
  });
});

// ---------------------------------------------------------------------------
// testImpl — deterministic paths
// ---------------------------------------------------------------------------

describe("testImpl — think-only path", () => {
  it("emits only a thinking activity", async () => {
    const sid = initSession("/repos/myapp", "test");
    await runTurn(sid, "think-only", testImpl, () => {});
    const acts = dbActivities.listForSession(sid);
    expect(acts).toHaveLength(1);
    expect(acts[0].type).toBe("thinking");
    expect(acts[0].content).toBe("Thinking only.");
  });
});

describe("testImpl — error path", () => {
  it("runTurn rejects when impl throws", async () => {
    const sid = initSession("/repos/myapp", "test");
    await expect(runTurn(sid, "error", testImpl, () => {}))
      .rejects.toThrow("testImpl: error path");
  });
});

// ---------------------------------------------------------------------------
// Subscription — subscribers receive pushed deltas
// ---------------------------------------------------------------------------

describe("subscription — fanOut via AgentsModule.message", () => {
  it("subscriber connection receives agent/delta and agent/turn/done", async () => {
    const sid = initSession("/repos/myapp", "test");
    const pushed: Record<string, unknown>[] = [];
    initPush((msg) => pushed.push(msg as Record<string, unknown>));

    const cid = "test-conn-sub";
    // Register as subscriber via the subscribe handler
    AgentsModule.subscribe(
      { connectionId: cid, sessionId: sid } as Record<string, unknown>,
      () => {},
    );

    // Trigger a turn
    AgentsModule.message(
      { connectionId: cid, sessionId: sid, prompt: "ping" } as Record<string, unknown>,
      () => {},
    );

    // Wait for turn/done to land in pushed
    await vi.waitFor(
      () => { expect(pushed.some(m => m["type"] === "agent/turn/done")).toBe(true); },
      { timeout: 2000 },
    );

    const deltaTypes = pushed
      .filter(m => m["type"] === "agent/delta")
      .map(m => m["activityType"] as string);
    expect(deltaTypes).toContain("thinking");
    expect(deltaTypes).toContain("tool");
    expect(deltaTypes).toContain("text");
  });
});
