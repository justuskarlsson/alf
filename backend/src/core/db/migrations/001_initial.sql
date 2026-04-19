CREATE TABLE IF NOT EXISTS repos (
  id         TEXT    PRIMARY KEY,
  path       TEXT    NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT    PRIMARY KEY,
  repo_id        TEXT    NOT NULL REFERENCES repos(id),
  title          TEXT    NOT NULL DEFAULT 'New session',
  sdk_session_id TEXT,
  impl           TEXT    NOT NULL DEFAULT 'test',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  id           TEXT    PRIMARY KEY,
  session_id   TEXT    NOT NULL REFERENCES sessions(id),
  prompt       TEXT    NOT NULL,
  idx          INTEGER NOT NULL,   -- sequential within session
  created_at   INTEGER NOT NULL,
  completed_at INTEGER             -- null while running
);

CREATE TABLE IF NOT EXISTS activities (
  id         TEXT    PRIMARY KEY,
  turn_id    TEXT    NOT NULL REFERENCES turns(id),
  session_id TEXT    NOT NULL,     -- denormalized for fast replay
  type       TEXT    NOT NULL,     -- 'thinking' | 'tool' | 'text'
  content    TEXT    NOT NULL,     -- formatted text (tool: "name: short summary")
  idx        INTEGER NOT NULL,     -- sequential within session for replay
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_repo  ON sessions(repo_id);
CREATE INDEX IF NOT EXISTS idx_turns_session  ON turns(session_id, idx);
CREATE INDEX IF NOT EXISTS idx_activities_turn ON activities(turn_id, idx);
