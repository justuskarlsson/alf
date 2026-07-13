import { describe, it, expect, beforeEach, vi } from "vitest";
import { initDb, dbActivities, dbTurns, dbSessions } from "../db/index.js";
import { initSession, runTurn } from "./index.js";
import { AgentsModule } from "../../modules/agents/index.js";
import { initPush } from "../dispatch.js";
import type { LiveDelta } from "./types.js";

// Disable the system-prompt prepend before any module (cursor.ts) is imported,
// so the deterministic mock sees the bare prompt.
vi.hoisted(() => { process.env.SYSTEM_PROMPT_PATH = "/nonexistent-system-prompt"; });

// ---------------------------------------------------------------------------
// Mock the Cursor SDK with a deterministic, free stream:
//   system(init) → thinking → tool_call(running→completed) → assistant(text)
// Prompt keywords select alternate paths ("think-only", "error").
// ---------------------------------------------------------------------------
vi.mock("@cursor/sdk", () => {
  function makeRun(prompt: string) {
    async function* stream() {
      yield { type: "system", subtype: "init", agent_id: "agent-test", run_id: "run-1" };
      if (prompt.includes("error")) {
        yield { type: "status", agent_id: "agent-test", run_id: "run-1", status: "ERROR", message: "boom" };
        return;
      }
      yield { type: "thinking", agent_id: "agent-test", run_id: "run-1", text: "Thinking." };
      if (prompt.includes("think-only")) return;
      yield { type: "tool_call", agent_id: "agent-test", run_id: "run-1", call_id: "c1", name: "read_file", status: "running", args: "README.md" };
      yield { type: "tool_call", agent_id: "agent-test", run_id: "run-1", call_id: "c1", name: "read_file", status: "completed", args: "README.md", result: "ok" };
      yield { type: "assistant", agent_id: "agent-test", run_id: "run-1", message: { role: "assistant", content: [{ type: "text", text: `Echo: ${prompt}` }] } };
    }
    return {
      id: "run-1", agentId: "agent-test", requestId: "req-1",
      stream, cancel: async () => {}, wait: async () => ({}), conversation: async () => [],
      status: "finished" as const, supports: () => true, unsupportedReason: () => undefined,
      onDidChangeStatus: () => () => {},
    };
  }
  function makeAgent(agentId: string) {
    return {
      agentId, model: undefined,
      send: async (message: string | { text: string }) =>
        makeRun(typeof message === "string" ? message : message.text),
      close: () => {}, reload: async () => {},
      listArtifacts: async () => [], downloadArtifact: async () => Buffer.from(""),
      [Symbol.asyncDispose]: async () => {},
    };
  }
  class Agent {
    static async create() { return makeAgent("agent-test"); }
    static async resume(id: string) { return makeAgent(id); }
    static async prompt() { return {}; }
  }
  return { Agent };
});

beforeEach(() => {
  initDb(":memory:");
});

// ---------------------------------------------------------------------------
// initSession
// ---------------------------------------------------------------------------

describe("initSession", () => {
  it("creates a repo and session, returns sessionId", () => {
    const sid = initSession("/repos/myapp", "cursor");
    expect(sid).toBeTruthy();
    const session = dbSessions.get(sid);
    expect(session?.impl).toBe("cursor");
    expect(session?.title).toBe("New session");
  });

  it("reuses the same repo for the same path", () => {
    const s1 = initSession("/repos/myapp");
    const s2 = initSession("/repos/myapp");
    expect(dbSessions.get(s1)!.repo_id).toBe(dbSessions.get(s2)!.repo_id);
  });
});

// ---------------------------------------------------------------------------
// runTurn — DB writes
// ---------------------------------------------------------------------------

describe("runTurn — DB writes", () => {
  it("creates a turn row", async () => {
    const sid = initSession("/repos/myapp");
    await runTurn(sid, "ping", () => {}).done;
    const turns = dbTurns.list(sid);
    expect(turns).toHaveLength(1);
    expect(turns[0].prompt).toBe("ping");
    expect(turns[0].completed_at).toBeGreaterThan(0);
  });

  it("persists 3 activities (thinking, tool, text)", async () => {
    const sid = initSession("/repos/myapp");
    await runTurn(sid, "hello", () => {}).done;
    const acts = dbActivities.listForSession(sid);
    expect(acts).toHaveLength(3);
    expect(acts.map(a => a.type)).toEqual(["thinking", "tool", "text"]);
  });

  it("activity idx is 0-based and resets each turn", async () => {
    const sid = initSession("/repos/myapp");
    await runTurn(sid, "turn 1", () => {}).done;
    await runTurn(sid, "turn 2", () => {}).done;
    const acts = dbActivities.listForSession(sid);
    expect(acts.map(a => a.idx)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it("text activity echoes the prompt", async () => {
    const sid = initSession("/repos/myapp");
    await runTurn(sid, "ping", () => {}).done;
    const text = dbActivities.listForSession(sid).find(a => a.type === "text");
    expect(text?.content).toBe("Echo: ping");
  });

  it("tool activity is a short formatted string", async () => {
    const sid = initSession("/repos/myapp");
    await runTurn(sid, "ping", () => {}).done;
    const tool = dbActivities.listForSession(sid).find(a => a.type === "tool");
    expect(tool?.content).toMatch(/^read_file:/);
  });

  it("persists the Cursor agentId as sdk_session_id", async () => {
    const sid = initSession("/repos/myapp");
    await runTurn(sid, "ping", () => {}).done;
    expect(dbSessions.get(sid)?.sdk_session_id).toBe("agent-test");
  });

  it("lastCoord after one turn is { turnIdx: 0, activityIdx: 2 }", async () => {
    const sid = initSession("/repos/myapp");
    await runTurn(sid, "ping", () => {}).done;
    expect(dbActivities.lastCoord(sid)).toEqual({ turnIdx: 0, activityIdx: 2 });
  });

  it("lastCoord after two turns is { turnIdx: 1, activityIdx: 2 }", async () => {
    const sid = initSession("/repos/myapp");
    await runTurn(sid, "first", () => {}).done;
    await runTurn(sid, "second", () => {}).done;
    expect(dbActivities.lastCoord(sid)).toEqual({ turnIdx: 1, activityIdx: 2 });
  });
});

// ---------------------------------------------------------------------------
// runTurn — stream sink
// ---------------------------------------------------------------------------

describe("runTurn — stream sink", () => {
  it("calls sink with updates for all 3 activity types", async () => {
    const sid = initSession("/repos/myapp");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", d => deltas.push(d)).done;

    const types = [...new Set(deltas.map(d => d.activityType))];
    expect(types).toContain("thinking");
    expect(types).toContain("tool");
    expect(types).toContain("text");
  });

  it("emits a start placeholder then a done update per activity", async () => {
    const sid = initSession("/repos/myapp");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", d => deltas.push(d)).done;

    // Each activity: one done:false (empty) followed by one done:true (full).
    const text = deltas.filter(d => d.activityType === "text");
    expect(text[0]).toMatchObject({ content: "", done: false });
    expect(text.at(-1)).toMatchObject({ content: "Echo: ping", done: true });
  });

  it("sink updates have correct sessionId", async () => {
    const sid = initSession("/repos/myapp");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", d => deltas.push(d)).done;
    expect(deltas.every(d => d.sessionId === sid)).toBe(true);
  });

  it("idx is 0,1,2 across the three activities", async () => {
    const sid = initSession("/repos/myapp");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", d => deltas.push(d)).done;
    expect([...new Set(deltas.map(d => d.idx))]).toEqual([0, 1, 2]);
  });

  it("the done update content matches the persisted content", async () => {
    const sid = initSession("/repos/myapp");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", d => deltas.push(d)).done;
    const finalText = deltas.filter(d => d.activityType === "text" && d.done).at(-1)!;
    const stored = dbActivities.listForSession(sid).find(a => a.type === "text")!.content;
    expect(finalText.content).toBe(stored);
  });

  it("sink is not called after runTurn resolves (no stray async leaks)", async () => {
    const sid = initSession("/repos/myapp");
    const deltas: LiveDelta[] = [];
    await runTurn(sid, "ping", d => deltas.push(d)).done;
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
    await expect(runTurn("bad-id", "ping", () => {}).done)
      .rejects.toThrow("Session not found");
  });

  it("rejects when the agent reports an error", async () => {
    const sid = initSession("/repos/myapp");
    await expect(runTurn(sid, "error", () => {}).done)
      .rejects.toThrow("Cursor agent error");
  });

  it("think-only prompt emits only a thinking activity", async () => {
    const sid = initSession("/repos/myapp");
    await runTurn(sid, "think-only", () => {}).done;
    const acts = dbActivities.listForSession(sid);
    expect(acts).toHaveLength(1);
    expect(acts[0].type).toBe("thinking");
    expect(acts[0].content).toBe("Thinking.");
  });
});

// ---------------------------------------------------------------------------
// Subscription — subscribers receive pushed updates
// ---------------------------------------------------------------------------

describe("subscription — fanOut via AgentsModule.message", () => {
  it("subscriber connection receives agent/delta and agent/turn/done", async () => {
    const sid = initSession("/repos/myapp");
    const pushed: Record<string, unknown>[] = [];
    initPush((msg) => pushed.push(msg as Record<string, unknown>));

    const cid = "test-conn-sub";
    AgentsModule.subscribe(
      { connectionId: cid, sessionId: sid } as Record<string, unknown>,
      () => {},
    );

    AgentsModule.message(
      { connectionId: cid, sessionId: sid, prompt: "ping" } as Record<string, unknown>,
      () => {},
    );

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
