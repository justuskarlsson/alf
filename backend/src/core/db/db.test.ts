import { describe, it, expect, beforeEach } from "vitest";
import {
  initDb,
  dbRepos, dbSessions, dbTurns, dbActivities,
  type Session,
} from "./index.js";

// Each test gets a fresh in-memory DB.
beforeEach(() => {
  initDb(":memory:");
});

// ---------------------------------------------------------------------------
// Repos
// ---------------------------------------------------------------------------

describe("dbRepos", () => {
  it("upsert creates a new repo", () => {
    const r = dbRepos.upsert("/repos/myapp");
    expect(r.id).toBeTruthy();
    expect(r.path).toBe("/repos/myapp");
    expect(r.created_at).toBeGreaterThan(0);
  });

  it("upsert returns existing repo on second call", () => {
    const a = dbRepos.upsert("/repos/myapp");
    const b = dbRepos.upsert("/repos/myapp");
    expect(a.id).toBe(b.id);
  });

  it("get returns repo by id", () => {
    const r = dbRepos.upsert("/repos/myapp");
    expect(dbRepos.get(r.id)?.path).toBe("/repos/myapp");
  });

  it("get returns null for unknown id", () => {
    expect(dbRepos.get("nonexistent")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

describe("dbSessions", () => {
  it("create returns a session with defaults", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    expect(s.id).toBeTruthy();
    expect(s.repo_id).toBe(repo.id);
    expect(s.title).toBe("New session");
    expect(s.impl).toBe("test");
    expect(s.sdk_session_id).toBeNull();
  });

  it("get returns session by id", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    expect(dbSessions.get(s.id)?.id).toBe(s.id);
  });

  it("list returns sessions sorted by updated_at desc", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s1 = dbSessions.create(repo.id, "test");
    const s2 = dbSessions.create(repo.id, "test");
    dbSessions.touch(s1.id); // s1 now newer
    const list = dbSessions.list(repo.id);
    expect(list[0].id).toBe(s1.id);
    expect(list[1].id).toBe(s2.id);
  });

  it("update changes title", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    dbSessions.update(s.id, { title: "My chat" });
    expect(dbSessions.get(s.id)?.title).toBe("My chat");
  });

  it("setSdkSessionId persists the sdk id", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    dbSessions.setSdkSessionId(s.id, "sdk-abc-123");
    expect(dbSessions.get(s.id)?.sdk_session_id).toBe("sdk-abc-123");
  });
});

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

describe("dbTurns", () => {
  it("create assigns sequential idx per session", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    const t0 = dbTurns.create(s.id, "hello");
    const t1 = dbTurns.create(s.id, "world");
    expect(t0.idx).toBe(0);
    expect(t1.idx).toBe(1);
  });

  it("idx is independent across sessions", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s1 = dbSessions.create(repo.id, "test");
    const s2 = dbSessions.create(repo.id, "test");
    dbTurns.create(s1.id, "first");
    dbTurns.create(s1.id, "second");
    const t = dbTurns.create(s2.id, "only");
    expect(t.idx).toBe(0); // s2 is fresh
  });

  it("complete sets completed_at", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    const t = dbTurns.create(s.id, "hello");
    expect(t.completed_at).toBeNull();
    dbTurns.complete(t.id);
    const updated = dbTurns.list(s.id)[0];
    expect(updated.completed_at).toBeGreaterThan(0);
  });

  it("list returns turns in idx order", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    dbTurns.create(s.id, "first");
    dbTurns.create(s.id, "second");
    const turns = dbTurns.list(s.id);
    expect(turns.map(t => t.prompt)).toEqual(["first", "second"]);
  });
});

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

describe("dbActivities", () => {
  it("create stores an activity", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    const t = dbTurns.create(s.id, "hello");
    const a = dbActivities.create(t.id, s.id, "text", "Echo: hello", 0);
    expect(a.type).toBe("text");
    expect(a.content).toBe("Echo: hello");
    expect(a.idx).toBe(0);
  });

  it("idx is per-turn (resets to 0 each turn)", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    const t0 = dbTurns.create(s.id, "turn 0");
    const t1 = dbTurns.create(s.id, "turn 1");
    dbActivities.create(t0.id, s.id, "thinking", "...", 0);
    dbActivities.create(t0.id, s.id, "text", "hi", 1);
    dbActivities.create(t1.id, s.id, "thinking", "...", 0); // resets
    dbActivities.create(t1.id, s.id, "text", "hey", 1);
    const all = dbActivities.listForSession(s.id);
    expect(all.map(a => a.idx)).toEqual([0, 1, 0, 1]);
  });

  it("listForSession returns activities in (turn.idx, activity.idx) order", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    const t0 = dbTurns.create(s.id, "turn 0");
    const t1 = dbTurns.create(s.id, "turn 1");
    dbActivities.create(t0.id, s.id, "text", "a", 0);
    dbActivities.create(t1.id, s.id, "text", "b", 0);
    const all = dbActivities.listForSession(s.id);
    expect(all.map(a => a.content)).toEqual(["a", "b"]);
  });

  it("lastCoord returns null when no activities", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    expect(dbActivities.lastCoord(s.id)).toBeNull();
  });

  it("lastCoord returns correct composite position", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    const t0 = dbTurns.create(s.id, "turn 0");
    const t1 = dbTurns.create(s.id, "turn 1");
    dbActivities.create(t0.id, s.id, "text", "a", 0);
    dbActivities.create(t1.id, s.id, "thinking", "b", 0);
    dbActivities.create(t1.id, s.id, "text", "c", 1);
    const coord = dbActivities.lastCoord(s.id);
    expect(coord).toEqual({ turnIdx: 1, activityIdx: 1 });
  });

  it("listSince returns only activities after the cursor", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    const t0 = dbTurns.create(s.id, "turn 0");
    const t1 = dbTurns.create(s.id, "turn 1");
    dbActivities.create(t0.id, s.id, "text", "t0a0", 0);
    dbActivities.create(t0.id, s.id, "text", "t0a1", 1);
    dbActivities.create(t1.id, s.id, "text", "t1a0", 0);
    dbActivities.create(t1.id, s.id, "text", "t1a1", 1);

    // "I have up to turn 0, activity 0" → should get t0a1, t1a0, t1a1
    const since = dbActivities.listSince(s.id, 0, 0);
    expect(since.map(a => a.content)).toEqual(["t0a1", "t1a0", "t1a1"]);
  });

  it("listSince with afterTurnIdx skips entire earlier turns", () => {
    const repo = dbRepos.upsert("/repos/myapp");
    const s = dbSessions.create(repo.id, "test");
    const t0 = dbTurns.create(s.id, "turn 0");
    const t1 = dbTurns.create(s.id, "turn 1");
    dbActivities.create(t0.id, s.id, "text", "old", 0);
    dbActivities.create(t1.id, s.id, "text", "new", 0);

    // "I have everything up to turn 0, activity 99 (i.e. all of turn 0)" → only t1 activities
    const since = dbActivities.listSince(s.id, 0, 99);
    expect(since.map(a => a.content)).toEqual(["new"]);
  });
});
