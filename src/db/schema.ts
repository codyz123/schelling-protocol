import type { Database } from "bun:sqlite";

// Base schema (v1 tables — created fresh on new databases)
const DDL = `
CREATE TABLE IF NOT EXISTS users (
  user_token       TEXT PRIMARY KEY,
  protocol_version TEXT NOT NULL DEFAULT 'schelling-2.0',
  agent_model      TEXT,
  embedding_method  TEXT,
  embedding        TEXT NOT NULL,
  city             TEXT,
  age_range        TEXT CHECK (age_range IS NULL OR age_range IN ('18-24','25-34','35-44','45-54','55-64','65+')),
  intent           TEXT,
  interests        TEXT,
  values_text      TEXT,
  description      TEXT,
  seeking          TEXT,
  identity         TEXT,
  vertical_id      TEXT NOT NULL DEFAULT 'matchmaking',
  deal_breakers    TEXT,
  verification_level TEXT NOT NULL DEFAULT 'anonymous' CHECK (verification_level IN ('anonymous','verified','attested')),
  phone_hash       TEXT,
  agent_attestation TEXT,
  role             TEXT,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','suspended','delisted')),
  media_refs       TEXT,
  marketplace_data TEXT,
  -- v2 intent space columns
  intent_embedding TEXT,
  intents          TEXT,
  intent_tags      TEXT,
  primary_cluster  TEXT,
  cluster_affinities TEXT,
  last_registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  structured_attributes TEXT,
  reputation_score REAL NOT NULL DEFAULT 0.5,
  interaction_count INTEGER NOT NULL DEFAULT 0,
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
  -- v2 bidirectional scores
  score_your_fit   REAL,
  score_their_fit  REAL,
  intent_similarity REAL,
  combined_score   REAL,
  computed_at      TEXT NOT NULL DEFAULT (datetime('now')),
  algorithm_variant TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (user_a_token < user_b_token),
  UNIQUE (user_a_token, user_b_token, vertical_id)
);

CREATE INDEX IF NOT EXISTS idx_candidates_user_a ON candidates(user_a_token);
CREATE INDEX IF NOT EXISTS idx_candidates_user_b ON candidates(user_b_token);
CREATE INDEX IF NOT EXISTS idx_candidates_stages ON candidates(stage_a, stage_b);
CREATE INDEX IF NOT EXISTS idx_candidates_vertical ON candidates(vertical_id);
CREATE INDEX IF NOT EXISTS idx_candidates_scores ON candidates(score DESC, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_user_tokens ON candidates(user_a_token, user_b_token);
CREATE INDEX IF NOT EXISTS idx_users_version     ON users(protocol_version);
CREATE INDEX IF NOT EXISTS idx_users_vertical    ON users(vertical_id);
CREATE INDEX IF NOT EXISTS idx_users_primary_cluster ON users(primary_cluster);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS declines (
  id               TEXT PRIMARY KEY,
  decliner_token   TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  declined_token   TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  vertical_id      TEXT NOT NULL DEFAULT 'matchmaking',
  stage_at_decline INTEGER NOT NULL,
  reason           TEXT,
  expiry_at        TEXT,
  reconsidered     INTEGER NOT NULL DEFAULT 0,
  reconsidered_at  TEXT,
  feedback         TEXT,
  repeat_count     INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (decliner_token, declined_token, vertical_id)
);

CREATE INDEX IF NOT EXISTS idx_declines_decliner ON declines(decliner_token);
CREATE INDEX IF NOT EXISTS idx_declines_declined ON declines(declined_token);
CREATE INDEX IF NOT EXISTS idx_declines_vertical ON declines(vertical_id);
CREATE INDEX IF NOT EXISTS idx_declines_expiry ON declines(expiry_at);
CREATE INDEX IF NOT EXISTS idx_declines_active ON declines(decliner_token, expiry_at, reconsidered);

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

CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('evaluate','exchange','respond_proposal','review_commitment','review_dispute','provide_verification','new_message','direct_request','jury_duty','profile_refresh','mutual_gate_expired')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_actions_user ON pending_actions(user_token);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  user_token TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON idempotency_keys(created_at);

CREATE TRIGGER IF NOT EXISTS cleanup_idempotency_keys 
  AFTER INSERT ON idempotency_keys
  FOR EACH ROW
  BEGIN
    DELETE FROM idempotency_keys 
    WHERE created_at < datetime('now', '-1 day');
  END;

CREATE TABLE IF NOT EXISTS reputation_events (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reporter_reputation REAL,
  vertical_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('outcome','dispute','completion','abandonment')),
  rating TEXT CHECK (rating IN ('positive','neutral','negative')),
  dimensions TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reputation_events_identity ON reputation_events(identity_id);
CREATE INDEX IF NOT EXISTS idx_reputation_events_vertical ON reputation_events(vertical_id);

CREATE TABLE IF NOT EXISTS negotiations (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  from_identity TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  proposal TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','countered','expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_negotiations_candidate ON negotiations(candidate_id);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  filed_by TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  filed_against TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  vertical_id TEXT NOT NULL,
  stage_at_filing INTEGER NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','resolved_for_filer','resolved_for_defendant','dismissed')),
  resolved_at INTEGER,
  resolution_notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_disputes_candidate ON disputes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  requested_from TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  verification_type TEXT NOT NULL CHECK (verification_type IN ('request','provide')),
  artifacts TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','provided','expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);

-- v2 new tables
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

CREATE TABLE IF NOT EXISTS decline_pair_history (
  decliner_token TEXT NOT NULL,
  declined_token TEXT NOT NULL,
  total_declines INTEGER NOT NULL DEFAULT 0,
  last_declined_at TEXT NOT NULL DEFAULT (datetime('now')),
  permanent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (decliner_token, declined_token)
);

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

CREATE TABLE IF NOT EXISTS idempotency_cache (
  fingerprint TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS user_attributes (
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  attr_key TEXT NOT NULL,
  attr_value TEXT NOT NULL,
  PRIMARY KEY (user_token, attr_key, attr_value)
);
CREATE INDEX IF NOT EXISTS idx_user_attrs_kv ON user_attributes(attr_key, attr_value);

-- Phase 6: Message relay tables
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  sender_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'markdown')),
  read INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_candidate ON messages(candidate_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_token);

CREATE TABLE IF NOT EXISTS direct_optins (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  opted_in_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (candidate_id, user_token)
);

CREATE TABLE IF NOT EXISTS relay_blocks (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  blocker_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  blocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (candidate_id, blocker_token)
);

-- Phase 7: Feedback & Learning tables
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  dimension_scores TEXT,
  rejection_reason TEXT,
  rejection_freeform TEXT,
  what_i_wanted TEXT,
  satisfaction TEXT CHECK (satisfaction IS NULL OR satisfaction IN ('very_satisfied','satisfied','neutral','dissatisfied','very_dissatisfied')),
  would_recommend INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_token);
CREATE INDEX IF NOT EXISTS idx_feedback_candidate ON feedback(candidate_id);

CREATE TABLE IF NOT EXISTS learned_preferences (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL,
  dimension_importance TEXT,
  ideal_ranges TEXT,
  rejection_patterns TEXT,
  stage_decline_distribution TEXT,
  feedback_count INTEGER NOT NULL DEFAULT 0,
  feedback_quality_score REAL NOT NULL DEFAULT 0.0,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_token, cluster_id)
);
CREATE INDEX IF NOT EXISTS idx_learned_prefs_user ON learned_preferences(user_token);
CREATE INDEX IF NOT EXISTS idx_learned_prefs_cluster ON learned_preferences(cluster_id);

-- Phase 9: Jury system tables
CREATE TABLE IF NOT EXISTS jury_assignments (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  juror_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  verdict TEXT CHECK (verdict IS NULL OR verdict IN ('for_filer','for_defendant','dismissed')),
  reasoning TEXT,
  voted_at TEXT,
  replaced INTEGER NOT NULL DEFAULT 0,
  replaced_at TEXT,
  deadline_at TEXT,
  UNIQUE (dispute_id, juror_token)
);
CREATE INDEX IF NOT EXISTS idx_jury_dispute ON jury_assignments(dispute_id);
CREATE INDEX IF NOT EXISTS idx_jury_juror ON jury_assignments(juror_token);

-- Phase 11: Analytics tables
CREATE TABLE IF NOT EXISTS algorithm_variants (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_token)
);
CREATE INDEX IF NOT EXISTS idx_variants_variant ON algorithm_variants(variant_id);

CREATE TABLE IF NOT EXISTS stage_transitions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_token TEXT NOT NULL,
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  transitioned_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transitions_candidate ON stage_transitions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_transitions_user ON stage_transitions(user_token);

CREATE TABLE IF NOT EXISTS similar_users (
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  similar_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  similarity REAL NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (user_token, similar_token)
);
`;

export function initSchema(db: Database): void {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(DDL);
}
