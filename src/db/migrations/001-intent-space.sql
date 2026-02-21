-- Migration 001: Add intent embedding support
PRAGMA foreign_keys = ON;
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;
PRAGMA temp_store=MEMORY;

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_token, endpoint, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON rate_limits(user_token, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- Add intent columns to users
ALTER TABLE users ADD COLUMN intent_embedding TEXT;
ALTER TABLE users ADD COLUMN intents TEXT;
ALTER TABLE users ADD COLUMN intent_tags TEXT;
ALTER TABLE users ADD COLUMN primary_cluster TEXT;
ALTER TABLE users ADD COLUMN cluster_affinities TEXT;
ALTER TABLE users ADD COLUMN last_registered_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE users ADD COLUMN structured_attributes TEXT;

-- Add bidirectional score columns to candidates
ALTER TABLE candidates ADD COLUMN score_your_fit REAL;
ALTER TABLE candidates ADD COLUMN score_their_fit REAL;
ALTER TABLE candidates ADD COLUMN intent_similarity REAL;
ALTER TABLE candidates ADD COLUMN computed_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE candidates ADD COLUMN algorithm_variant TEXT;

-- Add decline expiry columns
ALTER TABLE declines ADD COLUMN expiry_at TEXT;
ALTER TABLE declines ADD COLUMN reconsidered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE declines ADD COLUMN reconsidered_at TEXT;
ALTER TABLE declines ADD COLUMN feedback TEXT;
ALTER TABLE declines ADD COLUMN repeat_count INTEGER NOT NULL DEFAULT 1;

-- Decline pair history
CREATE TABLE IF NOT EXISTS decline_pair_history (
  decliner_token TEXT NOT NULL,
  declined_token TEXT NOT NULL,
  total_declines INTEGER NOT NULL DEFAULT 0,
  last_declined_at TEXT NOT NULL DEFAULT (datetime('now')),
  permanent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (decliner_token, declined_token)
);

-- Background jobs queue
CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3
);
CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled ON background_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON background_jobs(job_type);

-- Idempotency cache
CREATE TABLE IF NOT EXISTS idempotency_cache (
  fingerprint TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Normalized user attributes
CREATE TABLE IF NOT EXISTS user_attributes (
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  attr_key TEXT NOT NULL,
  attr_value TEXT NOT NULL,
  PRIMARY KEY (user_token, attr_key, attr_value)
);
CREATE INDEX IF NOT EXISTS idx_user_attrs_kv ON user_attributes(attr_key, attr_value);

-- Similar users for collaborative filtering
CREATE TABLE IF NOT EXISTS similar_users (
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  similar_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  similarity REAL NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (user_token, similar_token)
);
CREATE INDEX IF NOT EXISTS idx_similar_users_token ON similar_users(user_token, similarity DESC);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_users_primary_cluster ON users(primary_cluster);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_registered ON users(last_registered_at);
CREATE INDEX IF NOT EXISTS idx_users_embedding_search ON users(status, primary_cluster, last_registered_at);
CREATE INDEX IF NOT EXISTS idx_candidates_scores ON candidates(score DESC, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_user_tokens ON candidates(user_a_token, user_b_token);
CREATE INDEX IF NOT EXISTS idx_declines_expiry ON declines(expiry_at);
CREATE INDEX IF NOT EXISTS idx_declines_active ON declines(decliner_token, expiry_at, reconsidered);
