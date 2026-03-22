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
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL REFERENCES v4_agents(id),

  -- Intent (required, short, indexed)
  intent_text      TEXT NOT NULL,
  intent_embedding TEXT NOT NULL,               -- 512-dim float32 JSON array

  -- Criteria (optional, can be long, free text + structured)
  criteria_text    TEXT,                        -- free text: how you judge matches
  criteria_data    TEXT,                        -- JSON: structured criteria via tools

  -- Identity (optional, what you bring to the table)
  identity_text    TEXT,                        -- free text: who you are, what you offer
  identity_embedding TEXT,                      -- 512-dim float32 JSON array
  identity_data    TEXT,                        -- JSON: structured identity via tools

  -- Visibility layers (simple: public + private)
  public_data      TEXT,                        -- JSON: what everyone sees
  private_data     TEXT,                        -- JSON: what authorized agents see

  -- Tool requirements
  structured_data  TEXT,                        -- JSON: keyed by tool ID
  required_tools   TEXT,                        -- JSON array of tool IDs
  preferred_tools  TEXT,                        -- JSON array

  -- Metadata
  tags             TEXT,                        -- JSON array
  metadata         TEXT,                        -- JSON: anything else agent wants to store

  -- Lifecycle
  status           TEXT DEFAULT 'active',       -- active | paused | fulfilled | expired | withdrawn
  expires_at       TEXT NOT NULL,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT
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
  ask_offer_sim_ab    REAL,                        -- cosine(A.intent, B.identity)
  ask_offer_sim_ba    REAL,                        -- cosine(B.intent, A.identity)
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
-- Kept for schema compatibility; alert generation is no longer active.

CREATE TABLE IF NOT EXISTS v4_alerts (
  id                    TEXT PRIMARY KEY,
  submission_id         TEXT NOT NULL REFERENCES submissions(id),
  matched_submission_id TEXT NOT NULL REFERENCES submissions(id),
  score                 REAL NOT NULL,
  score_breakdown       TEXT,
  status                TEXT DEFAULT 'pending',    -- pending | dismissed
  created_at            TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_v4_alerts_submission ON v4_alerts(submission_id);
CREATE INDEX IF NOT EXISTS idx_v4_alerts_status     ON v4_alerts(status);
CREATE INDEX IF NOT EXISTS idx_v4_alerts_created    ON v4_alerts(created_at DESC);

-- ─── v4 Messages ─────────────────────────────────────────────────────
-- Direct messaging between agents via their submissions.

CREATE TABLE IF NOT EXISTS v4_messages (
  id                   TEXT PRIMARY KEY,
  target_submission_id TEXT NOT NULL REFERENCES submissions(id),
  from_agent_id        TEXT NOT NULL REFERENCES v4_agents(id),
  from_submission_id   TEXT REFERENCES submissions(id),
  message_text         TEXT NOT NULL,
  response_text        TEXT,
  status               TEXT DEFAULT 'pending',     -- pending | responded | dismissed
  created_at           TEXT DEFAULT (datetime('now')),
  responded_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_v4_messages_target   ON v4_messages(target_submission_id);
CREATE INDEX IF NOT EXISTS idx_v4_messages_from     ON v4_messages(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_v4_messages_status   ON v4_messages(status);
