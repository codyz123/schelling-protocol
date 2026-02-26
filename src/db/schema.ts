import type { Database } from "bun:sqlite";

// ─── Schelling Protocol v3.0 Schema ────────────────────────────────────

const DDL = `
-- ─── Drop all tables for clean v3 schema (v3 is a full migration) ────

DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS pending_actions;
DROP TABLE IF EXISTS enforcement_actions;
DROP TABLE IF EXISTS verifications;
DROP TABLE IF EXISTS jury_verdicts;
DROP TABLE IF EXISTS jury_assignments;
DROP TABLE IF EXISTS disputes;
DROP TABLE IF EXISTS reputation_events;
DROP TABLE IF EXISTS tool_feedback;
DROP TABLE IF EXISTS tools;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS relay_blocks;
DROP TABLE IF EXISTS direct_contacts;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS inquiries;
DROP TABLE IF EXISTS deliverables;
DROP TABLE IF EXISTS contract_amendments;
DROP TABLE IF EXISTS contracts;
DROP TABLE IF EXISTS outcomes;
DROP TABLE IF EXISTS declines;
DROP TABLE IF EXISTS candidates;
DROP TABLE IF EXISTS cluster_norms;
DROP TABLE IF EXISTS clusters;
DROP TABLE IF EXISTS preferences;
DROP TABLE IF EXISTS traits;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS negotiations;
DROP TABLE IF EXISTS verticals;
DROP TABLE IF EXISTS vertical_descriptors;

-- ─── Core: Users ─────────────────────────────────────────────────────
-- Each row is one registration. A user may have multiple registrations
-- across clusters, each with its own user_token.

CREATE TABLE IF NOT EXISTS users (
  user_token               TEXT PRIMARY KEY,
  protocol_version         TEXT NOT NULL DEFAULT '3.0',
  cluster_id               TEXT NOT NULL,
  role                     TEXT,
  funnel_mode              TEXT NOT NULL DEFAULT 'bilateral'
    CHECK (funnel_mode IN ('bilateral','broadcast','group','auction')),
  group_size               INTEGER CHECK (group_size IS NULL OR (group_size >= 2 AND group_size <= 50)),
  auto_fill                INTEGER DEFAULT 1,      -- boolean for group mode
  group_deadline           TEXT,                    -- ISO 8601
  intent_embedding         TEXT,                    -- JSON array of 16 floats
  intents                  TEXT,                    -- JSON array of strings
  personality_embedding    TEXT,                    -- JSON array of floats
  appearance_embedding     TEXT,                    -- JSON array of floats
  text_profile             TEXT,                    -- JSON: {description, seeking, interests, values_text}
  identity                 TEXT,                    -- JSON: {name, contact, phone_hash}
  phone_hash               TEXT,
  agent_model              TEXT,
  agent_capabilities       TEXT,                    -- JSON array of Capability objects
  agent_attestation        TEXT,                    -- JSON: {model, method, interaction_hours, generated_at}
  media_refs               TEXT,                    -- JSON array of URLs
  auto_interest_opt_out    INTEGER NOT NULL DEFAULT 0,
  behavioral_inference_opt_out INTEGER NOT NULL DEFAULT 0,
  status                   TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','delisted')),
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_cluster   ON users(cluster_id);
CREATE INDEX IF NOT EXISTS idx_users_status    ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_phone     ON users(phone_hash);

-- ─── Core: Traits ────────────────────────────────────────────────────
-- Universal traits stored as rows (not JSON blobs) for efficient querying.

CREATE TABLE IF NOT EXISTS traits (
  id                TEXT PRIMARY KEY,
  user_token        TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  key               TEXT NOT NULL,               -- snake_case, e.g. "dating.height_inches"
  value             TEXT NOT NULL,               -- JSON-encoded value
  value_type        TEXT NOT NULL CHECK (value_type IN ('string','number','boolean','enum','array')),
  visibility        TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','after_interest','after_commit','after_connect','private')),
  verification      TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification IN ('unverified','self_verified','cross_verified','authority_verified')),
  display_name      TEXT,
  category          TEXT,
  enum_values       TEXT,                        -- JSON array; required when value_type='enum'
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_token, key)
);

CREATE INDEX IF NOT EXISTS idx_traits_user     ON traits(user_token);
CREATE INDEX IF NOT EXISTS idx_traits_key      ON traits(key);
CREATE INDEX IF NOT EXISTS idx_traits_vis      ON traits(visibility);

-- ─── Core: Preferences ───────────────────────────────────────────────
-- What a participant is looking for. References trait keys in OTHER profiles.

CREATE TABLE IF NOT EXISTS preferences (
  id                TEXT PRIMARY KEY,
  user_token        TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  trait_key         TEXT NOT NULL,
  operator          TEXT NOT NULL
    CHECK (operator IN ('eq','neq','gt','gte','lt','lte','in','contains','exists','range','contains_any','regex','contains_all')),
  value             TEXT NOT NULL,               -- JSON-encoded value
  weight            REAL NOT NULL CHECK (weight >= 0.0 AND weight <= 1.0),
  label             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_token, trait_key)
);

CREATE INDEX IF NOT EXISTS idx_prefs_user      ON preferences(user_token);
CREATE INDEX IF NOT EXISTS idx_prefs_weight    ON preferences(weight);

-- ─── Core: Clusters ──────────────────────────────────────────────────
-- Dynamic clusters — created implicitly on first registration.

CREATE TABLE IF NOT EXISTS clusters (
  cluster_id               TEXT PRIMARY KEY,
  display_name             TEXT,
  description              TEXT,
  created_by               TEXT,                 -- user_token of first registrant
  symmetric                INTEGER NOT NULL DEFAULT 1,
  exclusive_commitment     INTEGER NOT NULL DEFAULT 0,
  age_restricted           INTEGER NOT NULL DEFAULT 0,
  default_funnel_mode      TEXT NOT NULL DEFAULT 'bilateral',
  max_negotiation_rounds   INTEGER NOT NULL DEFAULT 5,
  proposal_timeout_hours   INTEGER NOT NULL DEFAULT 48,
  population               INTEGER NOT NULL DEFAULT 0,
  phase                    TEXT NOT NULL DEFAULT 'nascent'
    CHECK (phase IN ('nascent','growing','active','popular','declining','dead')),
  metadata                 TEXT,                 -- JSON: additional cluster settings
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clusters_phase  ON clusters(phase);
CREATE INDEX IF NOT EXISTS idx_clusters_pop    ON clusters(population);

-- ─── Core: Cluster Norms ────────────────────────────────────────────
-- Emergent trait norms per cluster, updated as registrations accumulate.

CREATE TABLE IF NOT EXISTS cluster_norms (
  id                TEXT PRIMARY KEY,
  cluster_id        TEXT NOT NULL REFERENCES clusters(cluster_id) ON DELETE CASCADE,
  trait_key         TEXT NOT NULL,
  value_type        TEXT,
  enum_values       TEXT,                        -- JSON array of common enum values
  display_name      TEXT,
  frequency         REAL NOT NULL DEFAULT 0,     -- fraction of participants with this trait
  signal_strength   REAL NOT NULL DEFAULT 0,     -- learned from outcomes
  prompt            TEXT,                        -- suggested question to ask
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cluster_id, trait_key)
);

CREATE INDEX IF NOT EXISTS idx_norms_cluster   ON cluster_norms(cluster_id);

-- ─── Funnel: Candidates ─────────────────────────────────────────────
-- Each row is a discovered pair. Stages are per-side and independent.
-- v3 stages: 1=DISCOVERED, 2=INTERESTED, 3=COMMITTED, 4=CONNECTED

CREATE TABLE IF NOT EXISTS candidates (
  id                TEXT PRIMARY KEY,
  user_a_token      TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  user_b_token      TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  cluster_id        TEXT NOT NULL,
  funnel_mode       TEXT NOT NULL DEFAULT 'bilateral',
  score             REAL NOT NULL DEFAULT 0,     -- advisory score
  fit_a             REAL NOT NULL DEFAULT 0,     -- how well B fits A's prefs
  fit_b             REAL NOT NULL DEFAULT 0,     -- how well A fits B's prefs
  intent_similarity REAL,                        -- cosine similarity of intent embeddings
  stage_a           INTEGER NOT NULL DEFAULT 0 CHECK (stage_a BETWEEN 0 AND 4),
  stage_b           INTEGER NOT NULL DEFAULT 0 CHECK (stage_b BETWEEN 0 AND 4),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (user_a_token < user_b_token),
  UNIQUE (user_a_token, user_b_token, cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_candidates_user_a   ON candidates(user_a_token);
CREATE INDEX IF NOT EXISTS idx_candidates_user_b   ON candidates(user_b_token);
CREATE INDEX IF NOT EXISTS idx_candidates_stages   ON candidates(stage_a, stage_b);
CREATE INDEX IF NOT EXISTS idx_candidates_cluster  ON candidates(cluster_id);

-- ─── Funnel: Declines ───────────────────────────────────────────────
-- TTL escalation: 1st=30d, 2nd=90d, 3rd+=permanent

CREATE TABLE IF NOT EXISTS declines (
  id                TEXT PRIMARY KEY,
  decliner_token    TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  declined_token    TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  cluster_id        TEXT NOT NULL,
  candidate_id      TEXT,                        -- may be null if candidate was removed
  stage_at_decline  INTEGER NOT NULL,
  reason            TEXT CHECK (reason IS NULL OR reason IN ('not_interested','dealbreaker','timing','logistics','other')),
  feedback          TEXT,                        -- JSON: structured feedback
  permanent         INTEGER NOT NULL DEFAULT 0,
  expires_at        TEXT,                        -- ISO 8601; null if permanent
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_declines_decliner   ON declines(decliner_token);
CREATE INDEX IF NOT EXISTS idx_declines_declined   ON declines(declined_token);
CREATE INDEX IF NOT EXISTS idx_declines_cluster    ON declines(cluster_id);
CREATE INDEX IF NOT EXISTS idx_declines_expires    ON declines(expires_at);

-- ─── Funnel: Outcomes ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outcomes (
  id                TEXT PRIMARY KEY,
  candidate_id      TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  reporter_token    TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  outcome           TEXT NOT NULL CHECK (outcome IN ('positive','neutral','negative')),
  feedback          TEXT,                        -- JSON: structured feedback
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (candidate_id, reporter_token)
);

-- ─── Coordination: Contracts ────────────────────────────────────────
-- Full contract lifecycle: proposed → accepted → active → completing → completed

CREATE TABLE IF NOT EXISTS contracts (
  contract_id              TEXT PRIMARY KEY,
  candidate_id             TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  proposed_by              TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  type                     TEXT NOT NULL CHECK (type IN ('match','service','task','custom')),
  terms                    TEXT NOT NULL,         -- JSON: opaque contract terms
  terms_schema_version     TEXT,
  milestones               TEXT,                  -- JSON array of milestone definitions
  dispute_content_disclosure INTEGER NOT NULL DEFAULT 0,
  safe_types               TEXT,                  -- JSON array of allowed MIME types
  status                   TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','counter_proposed','superseded','accepted','active','completing','completed','expired','expired_stale','terminated','rejected')),
  supersedes               TEXT,                  -- contract_id this replaces
  round                    INTEGER NOT NULL DEFAULT 1,
  proposed_at              TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at              TEXT,
  completed_at             TEXT,
  expires_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contracts_candidate ON contracts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status    ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_proposer  ON contracts(proposed_by);

-- ─── Coordination: Contract Amendments ──────────────────────────────

CREATE TABLE IF NOT EXISTS contract_amendments (
  amendment_id     TEXT PRIMARY KEY,
  contract_id      TEXT NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,
  proposed_by      TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  updated_terms    TEXT,                          -- JSON
  updated_milestones TEXT,                        -- JSON
  status           TEXT NOT NULL DEFAULT 'amendment_proposed'
    CHECK (status IN ('amendment_proposed','amendment_accepted','amendment_rejected')),
  proposed_at      TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_amendments_contract ON contract_amendments(contract_id);

-- ─── Coordination: Deliverables ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS deliverables (
  delivery_id      TEXT PRIMARY KEY,
  contract_id      TEXT NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,
  deliverer_token  TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  milestone_id     TEXT,
  type             TEXT NOT NULL CHECK (type IN ('file','url','message','structured')),
  content          TEXT NOT NULL,
  content_type     TEXT,                          -- MIME type
  filename         TEXT,
  metadata         TEXT,                          -- JSON
  checksum         TEXT,                          -- SHA-256
  message          TEXT,
  status           TEXT NOT NULL DEFAULT 'delivered'
    CHECK (status IN ('delivered','accepted','rejected','expired','cancelled_withdrawal')),
  feedback         TEXT,
  rating           REAL CHECK (rating IS NULL OR (rating >= 0.0 AND rating <= 1.0)),
  delivered_at     TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at     TEXT,
  expires_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliverables_contract  ON deliverables(contract_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_deliverer ON deliverables(deliverer_token);
CREATE INDEX IF NOT EXISTS idx_deliverables_status    ON deliverables(status);

-- ─── Communication: Inquiries ───────────────────────────────────────
-- Pre-commitment Q&A between agents at INTERESTED stage.

CREATE TABLE IF NOT EXISTS inquiries (
  id                TEXT PRIMARY KEY,
  candidate_id      TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  from_token        TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  question          TEXT NOT NULL,
  category          TEXT CHECK (category IS NULL OR category IN ('dealbreakers','logistics','compensation','lifestyle','custom')),
  required          INTEGER NOT NULL DEFAULT 0,
  answer            TEXT,
  answer_confidence REAL,
  answer_source     TEXT CHECK (answer_source IS NULL OR answer_source IN ('agent_knowledge','human_confirmed')),
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','answered')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_inquiries_candidate ON inquiries(candidate_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_from      ON inquiries(from_token);

-- ─── Communication: Messages ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id                TEXT PRIMARY KEY,
  candidate_id      TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  sender_token      TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  content           TEXT NOT NULL,
  sent_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_candidate  ON messages(candidate_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender     ON messages(sender_token);
CREATE INDEX IF NOT EXISTS idx_messages_sent       ON messages(sent_at);

-- ─── Communication: Direct Contacts ─────────────────────────────────
-- Mutual opt-in to share real contact information.

CREATE TABLE IF NOT EXISTS direct_contacts (
  id                TEXT PRIMARY KEY,
  candidate_id      TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_token        TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  contact_info      TEXT NOT NULL,
  shared_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (candidate_id, user_token)
);

-- ─── Communication: Relay Blocks ────────────────────────────────────

CREATE TABLE IF NOT EXISTS relay_blocks (
  id                TEXT PRIMARY KEY,
  blocker_token     TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  blocked_token     TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  candidate_id      TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (blocker_token, blocked_token, candidate_id)
);

-- ─── Coordination: Lifecycle Events ─────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  event_id          TEXT PRIMARY KEY,
  candidate_id      TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  contract_id       TEXT REFERENCES contracts(contract_id) ON DELETE SET NULL,
  emitter_token     TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  event_type        TEXT NOT NULL
    CHECK (event_type IN ('milestone_reached','schedule_change','issue_reported','completion_signal','status_update','custom')),
  payload           TEXT,                        -- JSON
  requires_ack      INTEGER NOT NULL DEFAULT 0,
  ack_deadline      TEXT,                        -- ISO 8601
  acked             INTEGER NOT NULL DEFAULT 0,
  acked_at          TEXT,
  ack_response      TEXT,
  emitted_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_candidate  ON events(candidate_id);
CREATE INDEX IF NOT EXISTS idx_events_contract   ON events(contract_id);
CREATE INDEX IF NOT EXISTS idx_events_emitter    ON events(emitter_token);

-- ─── Discovery: Subscriptions ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id   TEXT PRIMARY KEY,
  user_token        TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  cluster_filter    TEXT,
  intent_embedding  TEXT,                        -- JSON array of 16 floats
  threshold         REAL NOT NULL,
  trait_filters     TEXT,                        -- JSON array of TraitFilter
  capability_filters TEXT,                       -- JSON array of strings
  mode_filter       TEXT,
  max_notifications_per_day INTEGER NOT NULL DEFAULT 10,
  notification_count INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subs_user       ON subscriptions(user_token);
CREATE INDEX IF NOT EXISTS idx_subs_expires    ON subscriptions(expires_at);

-- ─── Discovery: Notifications ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  notification_id   TEXT PRIMARY KEY,
  subscription_id   TEXT NOT NULL REFERENCES subscriptions(subscription_id) ON DELETE CASCADE,
  candidate_token_hash TEXT NOT NULL,
  advisory_score    REAL NOT NULL,
  intent_similarity REAL,
  matched_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_sub       ON notifications(subscription_id);

-- ─── Tools: Registry ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tools (
  tool_id           TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  description       TEXT NOT NULL,
  one_line_description TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'third_party'
    CHECK (type IN ('default','third_party')),
  endpoint          TEXT,                        -- HTTPS URL for third-party tools
  input_schema      TEXT NOT NULL,               -- JSON Schema
  output_schema     TEXT NOT NULL,               -- JSON Schema
  owner_token       TEXT REFERENCES users(user_token) ON DELETE SET NULL,
  version           TEXT NOT NULL,
  cluster_scope     TEXT,                        -- JSON array of cluster prefixes; null=global
  pricing           TEXT,                        -- JSON: {model, per_call_amount, currency, details}
  health_check_endpoint TEXT,
  reputation        REAL NOT NULL DEFAULT 0.5,
  usage_count       INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','pending_review','beta','deprecated','delisted')),
  registered_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tools_type      ON tools(type);
CREATE INDEX IF NOT EXISTS idx_tools_status    ON tools(status);
CREATE INDEX IF NOT EXISTS idx_tools_owner     ON tools(owner_token);

-- ─── Tools: Feedback ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tool_feedback (
  id                TEXT PRIMARY KEY,
  tool_id           TEXT NOT NULL REFERENCES tools(tool_id) ON DELETE CASCADE,
  user_token        TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  rating            TEXT NOT NULL CHECK (rating IN ('positive','negative')),
  comment           TEXT,
  invocation_id     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_toolfb_tool     ON tool_feedback(tool_id);

-- ─── Enforcement: Reputation Events ─────────────────────────────────

CREATE TABLE IF NOT EXISTS reputation_events (
  id                TEXT PRIMARY KEY,
  identity_id       TEXT NOT NULL,               -- user this event is about
  reporter_id       TEXT NOT NULL,               -- who reported it (or "system")
  reporter_reputation REAL,
  cluster_id        TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  rating            TEXT CHECK (rating IS NULL OR rating IN ('positive','neutral','negative')),
  dimensions        TEXT,                        -- JSON
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rep_identity    ON reputation_events(identity_id);
CREATE INDEX IF NOT EXISTS idx_rep_cluster     ON reputation_events(cluster_id);
CREATE INDEX IF NOT EXISTS idx_rep_type        ON reputation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_rep_created     ON reputation_events(created_at);

-- ─── Enforcement: Disputes ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS disputes (
  id                TEXT PRIMARY KEY,
  candidate_id      TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  filed_by          TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  filed_against     TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  cluster_id        TEXT NOT NULL,
  stage_at_filing   INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  evidence          TEXT,                        -- JSON array of URLs/references
  trait_claims      TEXT,                        -- JSON array of {trait_key, claimed_value, actual_value}
  delivery_claims   TEXT,                        -- JSON array of {delivery_id, issue}
  status            TEXT NOT NULL DEFAULT 'filed'
    CHECK (status IN ('filed','jury_selected','in_deliberation','resolved','operator_review',
      'resolved_for_filer','resolved_for_defendant','dismissed')),
  jury_size         INTEGER,
  resolved_at       TEXT,
  resolution_notes  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_disputes_candidate  ON disputes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_disputes_filed_by   ON disputes(filed_by);
CREATE INDEX IF NOT EXISTS idx_disputes_against    ON disputes(filed_against);
CREATE INDEX IF NOT EXISTS idx_disputes_status     ON disputes(status);

-- ─── Enforcement: Jury Assignments ──────────────────────────────────

CREATE TABLE IF NOT EXISTS jury_assignments (
  id                TEXT PRIMARY KEY,
  dispute_id        TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  juror_token       TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  assigned_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deadline          TEXT NOT NULL,
  replaced          INTEGER NOT NULL DEFAULT 0,
  UNIQUE (dispute_id, juror_token)
);

CREATE INDEX IF NOT EXISTS idx_jury_dispute    ON jury_assignments(dispute_id);
CREATE INDEX IF NOT EXISTS idx_jury_juror      ON jury_assignments(juror_token);

-- ─── Enforcement: Jury Verdicts ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS jury_verdicts (
  id                TEXT PRIMARY KEY,
  dispute_id        TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  juror_token       TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  verdict           TEXT NOT NULL CHECK (verdict IN ('for_filer','for_defendant','dismissed')),
  reasoning         TEXT NOT NULL,
  submitted_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dispute_id, juror_token)
);

CREATE INDEX IF NOT EXISTS idx_verdicts_dispute ON jury_verdicts(dispute_id);

-- ─── Enforcement: Verifications ─────────────────────────────────────
-- v3 verifications: submit evidence for own traits, or request from counterpart.

CREATE TABLE IF NOT EXISTS verifications (
  id                TEXT PRIMARY KEY,
  user_token        TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  candidate_id      TEXT REFERENCES candidates(id) ON DELETE SET NULL,
  trait_key         TEXT NOT NULL,
  action            TEXT NOT NULL CHECK (action IN ('submit','request')),
  evidence_type     TEXT CHECK (evidence_type IS NULL OR evidence_type IN ('photo','document','link','attestation')),
  evidence_data     TEXT,
  requested_tier    TEXT CHECK (requested_tier IS NULL OR requested_tier IN ('self_verified','cross_verified','authority_verified')),
  -- For requests: who we're requesting from
  requested_from    TEXT REFERENCES users(user_token) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','provided','expired')),
  current_tier      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_verif_user      ON verifications(user_token);
CREATE INDEX IF NOT EXISTS idx_verif_trait     ON verifications(trait_key);
CREATE INDEX IF NOT EXISTS idx_verif_status    ON verifications(status);

-- ─── Enforcement: Actions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enforcement_actions (
  id                TEXT PRIMARY KEY,
  user_token        TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  level             INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
  reason            TEXT NOT NULL,
  evidence          TEXT,                        -- JSON
  expires_at        TEXT,                        -- null for permanent
  disputable        INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_enforcement_user ON enforcement_actions(user_token);

-- ─── Core: Pending Actions ──────────────────────────────────────────
-- Broad action types for v3's richer notification system.

CREATE TABLE IF NOT EXISTS pending_actions (
  id                TEXT PRIMARY KEY,
  user_token        TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  candidate_id      TEXT REFERENCES candidates(id) ON DELETE CASCADE,
  action_type       TEXT NOT NULL,
  details           TEXT,                        -- JSON: action-specific details
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_user     ON pending_actions(user_token);
CREATE INDEX IF NOT EXISTS idx_pending_type     ON pending_actions(action_type);

-- ─── Core: Idempotency Keys ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key               TEXT PRIMARY KEY,
  operation         TEXT NOT NULL,
  user_token        TEXT NOT NULL,
  response          TEXT NOT NULL,               -- JSON of the full HandlerResult
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_idemp_created    ON idempotency_keys(created_at);

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
