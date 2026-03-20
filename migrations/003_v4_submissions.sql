-- Schelling Protocol v4.0 Schema — Additive Migration
-- Migration: 003 - Submission-Based Open Intent Architecture
-- This is purely additive. All v3 tables remain unchanged.

-- ─── v4 Agents ───────────────────────────────────────────────────────
-- Separate from v3 users. Agents are the principals in v4.

CREATE TABLE IF NOT EXISTS v4_agents (
  id               TEXT PRIMARY KEY,               -- UUID
  key_prefix       TEXT,                           -- first 16 chars of raw key, for O(1) lookup
  api_key_hash     TEXT NOT NULL,                  -- bcrypt hash of bearer token
  protocol_version TEXT NOT NULL DEFAULT '4.0',
  display_name     TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  last_active_at   TEXT,
  status           TEXT DEFAULT 'active',          -- active | paused | suspended
  reputation_score REAL DEFAULT 0.5,              -- 0.0–1.0
  metadata         TEXT                            -- JSON, agent-controlled
);

CREATE INDEX IF NOT EXISTS idx_v4_agents_status ON v4_agents(status);
CREATE INDEX IF NOT EXISTS idx_v4_agents_prefix ON v4_agents(key_prefix);

-- ─── Submissions ─────────────────────────────────────────────────────
-- The atomic coordination unit. Each submission is an intent with embeddings.

CREATE TABLE IF NOT EXISTS submissions (
  id               TEXT PRIMARY KEY,               -- UUID
  agent_id         TEXT NOT NULL REFERENCES v4_agents(id),

  -- Intent (required)
  intent_text      TEXT NOT NULL,                  -- free text, human-readable
  intent_summary   TEXT,                           -- optional short version

  -- Embeddings (stored as JSON float arrays)
  ask_embedding    TEXT NOT NULL,                  -- float32[] as JSON, canonical 512-dim
  offer_embedding  TEXT,                           -- float32[] as JSON, nullable

  -- Structured data (optional, keyed by tool ID)
  structured_data  TEXT,                           -- JSON: { "tool_id": { ...filled schema... }, ... }

  -- Tool requirements (optional)
  required_tools   TEXT,                           -- JSON: ["tool_id_1", "tool_id_2"]
  preferred_tools  TEXT,                           -- JSON: tools that help but aren't required

  -- Matching configuration (agent's choice)
  match_config     TEXT,                           -- JSON: { min_score, max_candidates, custom_weights }

  -- Lifecycle
  status           TEXT DEFAULT 'active',          -- active | paused | fulfilled | expired | withdrawn
  ttl_mode         TEXT DEFAULT 'fixed',           -- fixed | until | recurring | indefinite
  ttl_hours        INTEGER DEFAULT 720,            -- used when ttl_mode = 'fixed'
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT,
  expires_at       TEXT NOT NULL,

  -- Tags (optional, for discoverability)
  tags             TEXT,                           -- JSON: ["hiring", "software", "remote"]

  -- Search behavior (v4.1 additions)
  search_mode           TEXT DEFAULT 'active',     -- active | passive | hybrid
  search_source         TEXT DEFAULT 'user_directed', -- user_directed | agent_inferred
  hybrid_active_hours   INTEGER DEFAULT 168,       -- hours to stay active before downgrading to passive (1 week)
  alert_webhook         TEXT,                      -- optional webhook URL for passive match alerts
  alert_threshold       REAL DEFAULT 0.5           -- minimum match score to trigger an alert
);

CREATE INDEX IF NOT EXISTS idx_submissions_agent   ON submissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status  ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_expires ON submissions(expires_at);
-- Composite index for hot query: active + not expired + not own agent
CREATE INDEX IF NOT EXISTS idx_submissions_active_hot ON submissions(status, expires_at, agent_id);

-- ─── Submission Candidates ───────────────────────────────────────────
-- A candidate represents a potential match between two submissions.
-- Named submission_candidates to coexist with v3 candidates table.

CREATE TABLE IF NOT EXISTS submission_candidates (
  id                  TEXT PRIMARY KEY,
  submission_a_id     TEXT NOT NULL REFERENCES submissions(id),
  submission_b_id     TEXT NOT NULL REFERENCES submissions(id),

  -- Scores
  score               REAL NOT NULL,               -- composite match score
  ask_offer_sim_ab    REAL,                        -- cosine(A.ask, B.offer)
  ask_offer_sim_ba    REAL,                        -- cosine(B.ask, A.offer)
  tool_satisfaction   REAL,                        -- how well structured data aligns

  -- Funnel stages (per-side)
  stage_a             INTEGER DEFAULT 0,           -- 0=undiscovered,1=discovered,2=interested,3=committed,4=connected
  stage_b             INTEGER DEFAULT 0,

  -- Lifecycle
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT,

  UNIQUE(submission_a_id, submission_b_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_candidates_a     ON submission_candidates(submission_a_id);
CREATE INDEX IF NOT EXISTS idx_sub_candidates_b     ON submission_candidates(submission_b_id);
CREATE INDEX IF NOT EXISTS idx_sub_candidates_score ON submission_candidates(score DESC);

-- ─── Negotiation Records ─────────────────────────────────────────────
-- Append-only tamper-evident log of negotiation events.

CREATE TABLE IF NOT EXISTS negotiation_records (
  id              TEXT PRIMARY KEY,
  candidate_id    TEXT NOT NULL REFERENCES submission_candidates(id),

  -- Record content
  record_type     TEXT NOT NULL,                   -- proposal | counter | acceptance | rejection | disclosure | event
  submitted_by    TEXT NOT NULL,                   -- agent_id
  content         TEXT NOT NULL,                   -- JSON: the actual record data
  content_hash    TEXT,                            -- SHA-256 for tamper evidence

  -- Timestamps
  created_at      TEXT DEFAULT (datetime('now')),
  expires_at      TEXT                             -- optional TTL on time-sensitive records
);

CREATE INDEX IF NOT EXISTS idx_negotiation_candidate ON negotiation_records(candidate_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_agent     ON negotiation_records(submitted_by);

-- ─── Coordination Tools ──────────────────────────────────────────────
-- v4 coordination schema tools. Coexist with v3 invocable tools table.

CREATE TABLE IF NOT EXISTS coordination_tools (
  id                TEXT PRIMARY KEY,              -- namespaced: "hiring/software-engineer-v3"
  publisher_id      TEXT REFERENCES v4_agents(id),
  display_name      TEXT NOT NULL,
  description       TEXT,

  -- Schema
  schema_json       TEXT NOT NULL,                 -- JSON Schema defining the tool's fields
  schema_version    TEXT NOT NULL,                 -- semver

  -- Metadata
  category          TEXT,                          -- optional, for browsing
  usage_count       INTEGER DEFAULT 0,             -- how many submissions reference this
  adoption_score    REAL DEFAULT 0,                -- computed from usage patterns

  -- Lifecycle
  status            TEXT DEFAULT 'active',         -- active | deprecated | removed
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT,

  -- Composability
  extends           TEXT                           -- JSON: ["base-tool-id"] for tool inheritance
);

CREATE INDEX IF NOT EXISTS idx_coord_tools_category  ON coordination_tools(category);
CREATE INDEX IF NOT EXISTS idx_coord_tools_usage     ON coordination_tools(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_coord_tools_status    ON coordination_tools(status);

-- ─── Rate Events ──────────────────────────────────────────────────────
-- Lightweight rate-limit tracking for v4 operations.

CREATE TABLE IF NOT EXISTS v4_rate_events (
  agent_id    TEXT NOT NULL,
  action      TEXT NOT NULL,  -- 'match' | 'submit' (tool publishes counted via coordination_tools)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_v4_rate_events ON v4_rate_events(agent_id, action, created_at);

-- ─── Passive Match Alerts ─────────────────────────────────────────────
-- Created automatically when a new submission matches an existing one above threshold.

CREATE TABLE IF NOT EXISTS v4_alerts (
  id                    TEXT PRIMARY KEY,
  submission_id         TEXT NOT NULL REFERENCES submissions(id),    -- the new submission that triggered
  matched_submission_id TEXT NOT NULL REFERENCES submissions(id),    -- the existing submission matched against
  score                 REAL NOT NULL,                               -- composite match score
  score_breakdown       TEXT,                                        -- JSON score details
  status                TEXT DEFAULT 'pending',                      -- pending | dismissed
  created_at            TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_v4_alerts_submission ON v4_alerts(submission_id);
CREATE INDEX IF NOT EXISTS idx_v4_alerts_status     ON v4_alerts(status);
-- Index for listing pending alerts owned by an agent (join via submissions.agent_id)
CREATE INDEX IF NOT EXISTS idx_v4_alerts_created    ON v4_alerts(created_at DESC);
