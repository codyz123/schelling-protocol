import type { Database } from "bun:sqlite";

// Keep the original v1 schema as the primary schema for now
const DDL = `
CREATE TABLE IF NOT EXISTS users (
  user_token       TEXT PRIMARY KEY,
  protocol_version TEXT NOT NULL DEFAULT 'schelling-2.0',
  agent_model      TEXT,
  embedding_method  TEXT,
  embedding        TEXT NOT NULL,
  city             TEXT NOT NULL,
  age_range        TEXT NOT NULL CHECK (age_range IN ('18-24','25-34','35-44','45-54','55-64','65+')),
  intent           TEXT NOT NULL,
  interests        TEXT,
  values_text      TEXT,
  description      TEXT,
  seeking          TEXT,
  identity         TEXT,
  vertical_id      TEXT NOT NULL DEFAULT 'matchmaking',
  deal_breakers    TEXT, -- JSON object for two-pass filtering
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS candidates (
  id               TEXT PRIMARY KEY,
  user_a_token     TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  user_b_token     TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  vertical_id      TEXT NOT NULL DEFAULT 'matchmaking',
  score            REAL NOT NULL,
  shared_categories TEXT NOT NULL,
  stage_a          INTEGER NOT NULL DEFAULT 0 CHECK (stage_a BETWEEN 0 AND 6),
  stage_b          INTEGER NOT NULL DEFAULT 0 CHECK (stage_b BETWEEN 0 AND 6),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (user_a_token < user_b_token),
  UNIQUE (user_a_token, user_b_token, vertical_id)
);

CREATE INDEX IF NOT EXISTS idx_candidates_user_a ON candidates(user_a_token);
CREATE INDEX IF NOT EXISTS idx_candidates_user_b ON candidates(user_b_token);
CREATE INDEX IF NOT EXISTS idx_candidates_stages ON candidates(stage_a, stage_b);
CREATE INDEX IF NOT EXISTS idx_candidates_vertical ON candidates(vertical_id);
CREATE INDEX IF NOT EXISTS idx_users_version     ON users(protocol_version);
CREATE INDEX IF NOT EXISTS idx_users_vertical    ON users(vertical_id);

CREATE TABLE IF NOT EXISTS declines (
  id               TEXT PRIMARY KEY,
  decliner_token   TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  declined_token   TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  vertical_id      TEXT NOT NULL DEFAULT 'matchmaking',
  stage_at_decline INTEGER NOT NULL,
  reason           TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (decliner_token, declined_token, vertical_id)
);

CREATE INDEX IF NOT EXISTS idx_declines_decliner ON declines(decliner_token);
CREATE INDEX IF NOT EXISTS idx_declines_declined ON declines(declined_token);
CREATE INDEX IF NOT EXISTS idx_declines_vertical ON declines(vertical_id);

CREATE TABLE IF NOT EXISTS outcomes (
  id               TEXT PRIMARY KEY,
  candidate_id     TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  reporter_token   TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  outcome          TEXT NOT NULL CHECK (outcome IN ('positive','neutral','negative')),
  met_in_person    INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (candidate_id, reporter_token)
);

-- New v2 tables for extended functionality
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('evaluate','exchange','respond_proposal','review_commitment')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_user ON pending_actions(user_token);

-- Idempotency keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  user_token TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON idempotency_keys(created_at);

-- Clean up old idempotency keys (24 hour TTL)
CREATE TRIGGER IF NOT EXISTS cleanup_idempotency_keys 
  AFTER INSERT ON idempotency_keys
  FOR EACH ROW
  BEGIN
    DELETE FROM idempotency_keys 
    WHERE created_at < datetime('now', '-1 day');
  END;
`;

export function initSchema(db: Database): void {
  db.exec(DDL);
}
