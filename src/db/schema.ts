import type { Database } from "bun:sqlite";

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  user_token       TEXT PRIMARY KEY,
  protocol_version TEXT NOT NULL DEFAULT 'schelling-1.0',
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
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS candidates (
  id               TEXT PRIMARY KEY,
  user_a_token     TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  user_b_token     TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  score            REAL NOT NULL,
  shared_categories TEXT NOT NULL,
  stage_a          INTEGER NOT NULL DEFAULT 0 CHECK (stage_a BETWEEN 0 AND 5),
  stage_b          INTEGER NOT NULL DEFAULT 0 CHECK (stage_b BETWEEN 0 AND 5),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (user_a_token < user_b_token),
  UNIQUE (user_a_token, user_b_token)
);

CREATE INDEX IF NOT EXISTS idx_candidates_user_a ON candidates(user_a_token);
CREATE INDEX IF NOT EXISTS idx_candidates_user_b ON candidates(user_b_token);
CREATE INDEX IF NOT EXISTS idx_candidates_stages ON candidates(stage_a, stage_b);
CREATE INDEX IF NOT EXISTS idx_users_version     ON users(protocol_version);

CREATE TABLE IF NOT EXISTS declines (
  id               TEXT PRIMARY KEY,
  decliner_token   TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  declined_token   TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  stage_at_decline INTEGER NOT NULL,
  reason           TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (decliner_token, declined_token)
);

CREATE INDEX IF NOT EXISTS idx_declines_decliner ON declines(decliner_token);
CREATE INDEX IF NOT EXISTS idx_declines_declined ON declines(declined_token);

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
`;

export function initSchema(db: Database): void {
  db.exec(DDL);
}
