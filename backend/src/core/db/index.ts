/**
 * SQLite data layer — the single source of truth for agent sessions.
 * All DB access goes through the typed functions exported here.
 */

import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../logger.js";

const log = createLogger("db");

const __dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dir, "../../../..", "data", "dev", "alf.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) throw new Error("DB not initialised — call initDb() first");
  return _db;
}

export function initDb(path = process.env.DB_PATH ?? DEFAULT_DB_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  _db = new Database(path);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  runMigrations(_db);
  log.info("Ready", { path });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Repo {
  id: string;
  path: string;
  created_at: number;
}

export interface Session {
  id: string;
  repo_id: string;
  title: string;
  sdk_session_id: string | null;
  impl: string;
  forked_from: string | null;
  fork_point_turn_idx: number | null;
  created_at: number;
  updated_at: number;
}

export interface Turn {
  id: string;
  session_id: string;
  prompt: string;
  idx: number;
  created_at: number;
  completed_at: number | null;
}

export interface Activity {
  id: string;
  turn_id: string;
  session_id: string;
  type: string;
  content: string;
  idx: number;
  created_at: number;
}

// ---------------------------------------------------------------------------
// DAL — repos
// ---------------------------------------------------------------------------

export const dbRepos = {
  upsert(repoPath: string): Repo {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM repos WHERE path = ?").get(repoPath) as Repo | undefined;
    if (existing) return existing;
    const row: Repo = { id: crypto.randomUUID(), path: repoPath, created_at: Date.now() };
    db.prepare("INSERT INTO repos (id, path, created_at) VALUES (?, ?, ?)").run(row.id, row.path, row.created_at);
    return row;
  },

  get(id: string): Repo | null {
    return (getDb().prepare("SELECT * FROM repos WHERE id = ?").get(id) as Repo | undefined) ?? null;
  },
};

// ---------------------------------------------------------------------------
// DAL — sessions
// ---------------------------------------------------------------------------

export const dbSessions = {
  create(repoId: string, impl: string): Session {
    const db = getDb();
    const now = Date.now();
    const row: Session = {
      id: crypto.randomUUID(),
      repo_id: repoId,
      title: "New session",
      sdk_session_id: null,
      impl,
      forked_from: null,
      fork_point_turn_idx: null,
      created_at: now,
      updated_at: now,
    };
    db.prepare(
      "INSERT INTO sessions (id, repo_id, title, sdk_session_id, impl, forked_from, fork_point_turn_idx, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(row.id, row.repo_id, row.title, row.sdk_session_id, row.impl, row.forked_from, row.fork_point_turn_idx, row.created_at, row.updated_at);
    return row;
  },

  /** Fork a session: create new session and copy turns + activities up to forkTurnIdx. */
  fork(parentId: string, forkTurnIdx?: number): Session {
    const db = getDb();
    const parent = dbSessions.get(parentId);
    if (!parent) throw new Error(`Session not found: ${parentId}`);

    const turns = dbTurns.list(parentId);
    const maxIdx = forkTurnIdx ?? (turns.length > 0 ? turns[turns.length - 1].idx : -1);

    const now = Date.now();
    const newId = crypto.randomUUID();
    const row: Session = {
      id: newId,
      repo_id: parent.repo_id,
      title: `Fork of ${parent.title}`,
      sdk_session_id: parent.sdk_session_id,
      impl: parent.impl,
      forked_from: parentId,
      fork_point_turn_idx: maxIdx,
      created_at: now,
      updated_at: now,
    };
    db.prepare(
      "INSERT INTO sessions (id, repo_id, title, sdk_session_id, impl, forked_from, fork_point_turn_idx, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(row.id, row.repo_id, row.title, row.sdk_session_id, row.impl, row.forked_from, row.fork_point_turn_idx, row.created_at, row.updated_at);

    // Copy turns and their activities up to the fork point
    const turnsToCopy = turns.filter(t => t.idx <= maxIdx);
    for (const oldTurn of turnsToCopy) {
      const newTurnId = crypto.randomUUID();
      db.prepare(
        "INSERT INTO turns (id, session_id, prompt, idx, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(newTurnId, newId, oldTurn.prompt, oldTurn.idx, oldTurn.created_at, oldTurn.completed_at);

      // Copy activities for this turn
      const activities = db.prepare(
        "SELECT * FROM activities WHERE turn_id = ? ORDER BY idx ASC"
      ).all(oldTurn.id) as Activity[];
      for (const act of activities) {
        db.prepare(
          "INSERT INTO activities (id, turn_id, session_id, type, content, idx, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(crypto.randomUUID(), newTurnId, newId, act.type, act.content, act.idx, act.created_at);
      }
    }

    return row;
  },

  get(id: string): Session | null {
    return (getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Session | undefined) ?? null;
  },

  list(repoId: string): Session[] {
    return getDb()
      .prepare("SELECT * FROM sessions WHERE repo_id = ? ORDER BY updated_at DESC")
      .all(repoId) as Session[];
  },

  setSdkSessionId(id: string, sdkSessionId: string): void {
    getDb().prepare("UPDATE sessions SET sdk_session_id = ?, updated_at = ? WHERE id = ?").run(sdkSessionId, Date.now(), id);
  },

  update(id: string, fields: Partial<Pick<Session, "title" | "impl">>): void {
    const db = getDb();
    const now = Date.now();
    const cols = Object.keys(fields) as (keyof typeof fields)[];
    if (!cols.length) return;
    const set = [...cols.map(k => `${k} = ?`), "updated_at = ?"].join(", ");
    db.prepare(`UPDATE sessions SET ${set} WHERE id = ?`).run(...cols.map(k => fields[k]), now, id);
  },

  touch(id: string): void {
    getDb().prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(Date.now(), id);
  },

  /** Delete a session and all its turns + activities. */
  delete(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM activities WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM turns WHERE session_id = ?").run(id);
    // Clear forked_from references so children aren't orphaned
    db.prepare("UPDATE sessions SET forked_from = NULL WHERE forked_from = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  },
};

// ---------------------------------------------------------------------------
// DAL — turns
// ---------------------------------------------------------------------------

export const dbTurns = {
  create(sessionId: string, prompt: string): Turn {
    const db = getDb();
    const { c } = db.prepare("SELECT COUNT(*) as c FROM turns WHERE session_id = ?").get(sessionId) as { c: number };
    const row: Turn = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      prompt,
      idx: c,
      created_at: Date.now(),
      completed_at: null,
    };
    db.prepare(
      "INSERT INTO turns (id, session_id, prompt, idx, created_at, completed_at) VALUES (?, ?, ?, ?, ?, NULL)"
    ).run(row.id, row.session_id, row.prompt, row.idx, row.created_at);
    return row;
  },

  list(sessionId: string): Turn[] {
    return getDb()
      .prepare("SELECT * FROM turns WHERE session_id = ? ORDER BY idx ASC")
      .all(sessionId) as Turn[];
  },

  complete(id: string): void {
    getDb().prepare("UPDATE turns SET completed_at = ? WHERE id = ?").run(Date.now(), id);
  },
};

// ---------------------------------------------------------------------------
// DAL — activities
// ---------------------------------------------------------------------------

export const dbActivities = {
  create(turnId: string, sessionId: string, type: string, content: string, idx: number): Activity {
    const db = getDb();
    const row: Activity = {
      id: crypto.randomUUID(),
      turn_id: turnId,
      session_id: sessionId,
      type,
      content,
      idx,
      created_at: Date.now(),
    };
    db.prepare(
      "INSERT INTO activities (id, turn_id, session_id, type, content, idx, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(row.id, row.turn_id, row.session_id, row.type, row.content, row.idx, row.created_at);
    return row;
  },

  /**
   * Replay catch-up: activities after (afterTurnIdx, afterActivityIdx) — composite cursor.
   * Returns everything in turns after afterTurnIdx, plus activities in afterTurnIdx after afterActivityIdx.
   */
  listSince(sessionId: string, afterTurnIdx: number, afterActivityIdx: number): Activity[] {
    return getDb().prepare(`
      SELECT a.* FROM activities a
      JOIN turns t ON a.turn_id = t.id
      WHERE t.session_id = ?
        AND (t.idx > ? OR (t.idx = ? AND a.idx > ?))
      ORDER BY t.idx ASC, a.idx ASC
    `).all(sessionId, afterTurnIdx, afterTurnIdx, afterActivityIdx) as Activity[];
  },

  listForSession(sessionId: string): Activity[] {
    return getDb().prepare(`
      SELECT a.* FROM activities a
      JOIN turns t ON a.turn_id = t.id
      WHERE t.session_id = ?
      ORDER BY t.idx ASC, a.idx ASC
    `).all(sessionId) as Activity[];
  },

  /** Last position in the session — used to anchor replay. Null if no activities yet. */
  lastCoord(sessionId: string): { turnIdx: number; activityIdx: number } | null {
    const row = getDb().prepare(`
      SELECT t.idx as turn_idx, a.idx as activity_idx
      FROM activities a
      JOIN turns t ON a.turn_id = t.id
      WHERE t.session_id = ?
      ORDER BY t.idx DESC, a.idx DESC
      LIMIT 1
    `).get(sessionId) as { turn_idx: number; activity_idx: number } | undefined;
    return row ? { turnIdx: row.turn_idx, activityIdx: row.activity_idx } : null;
  },
};

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

function runMigrations(db: Database.Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)"
  );
  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map(r => r.name)
  );
  const files = ["001_initial.sql", "002_fork.sql"];
  for (const file of files) {
    if (applied.has(file)) continue;
    db.exec(readFileSync(join(__dir, "migrations", file), "utf-8"));
    db.prepare("INSERT INTO _migrations VALUES (?, ?)").run(file, Date.now());
    log.info("Migration applied", { file });
  }
}
