-- Marketplace Schema Migration
-- Migration: 002 - Agent Marketplace (profiles, ledger, escrow, negotiations)

-- ─── Marketplace Profiles ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_profiles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  registration_id TEXT NOT NULL REFERENCES users(user_token),
  hourly_rate_cents INTEGER,
  per_task_rate_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  min_price_cents INTEGER DEFAULT 0,
  max_concurrent_jobs INTEGER DEFAULT 5,
  auto_accept_below_cents INTEGER,
  availability TEXT DEFAULT 'available'
    CHECK (availability IN ('available','busy','offline')),
  capabilities_json TEXT,
  stripe_account_id TEXT,
  stripe_onboarded INTEGER DEFAULT 0,
  total_earned_cents INTEGER DEFAULT 0,
  total_jobs_completed INTEGER DEFAULT 0,
  avg_delivery_seconds INTEGER,
  payout_hold_cents INTEGER DEFAULT 0,
  last_payout_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_marketplace_avail ON marketplace_profiles(availability);
CREATE INDEX IF NOT EXISTS idx_marketplace_reg ON marketplace_profiles(registration_id);

-- ─── Double-Entry Ledger ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  account_id TEXT NOT NULL,
  account_type TEXT NOT NULL
    CHECK (account_type IN ('client_wallet','worker_earnings','platform_fees','escrow_hold')),
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('credit','debit')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT DEFAULT 'usd',
  reference_type TEXT,
  reference_id TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_id, account_type);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON ledger_entries(reference_type, reference_id);

-- ─── Escrow Records ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escrow_records (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contract_id TEXT NOT NULL,
  client_account_id TEXT NOT NULL,
  worker_account_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'held'
    CHECK (status IN ('held','released','refunded','disputed')),
  held_at TEXT DEFAULT (datetime('now')),
  released_at TEXT,
  ledger_hold_id TEXT,
  ledger_release_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_escrow_contract ON escrow_records(contract_id);
CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_records(status);

-- ─── Negotiation Sessions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS negotiation_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  seeker_token_hash TEXT NOT NULL,
  offerer_token_hash TEXT NOT NULL,
  cluster_id TEXT,
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active','agreed','expired','rejected','withdrawn')),
  current_turn TEXT,
  current_price_cents INTEGER,
  initial_ask_cents INTEGER,
  initial_bid_cents INTEGER,
  rounds INTEGER DEFAULT 0,
  max_rounds INTEGER DEFAULT 10,
  deadline_ms INTEGER NOT NULL,
  deadline_at TEXT NOT NULL,
  agreed_price_cents INTEGER,
  market_rate_cents INTEGER,
  locked_controls_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_neg_status ON negotiation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_neg_deadline ON negotiation_sessions(deadline_at);

-- ─── Negotiation Moves ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS negotiation_moves (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT NOT NULL REFERENCES negotiation_sessions(id),
  agent_token_hash TEXT NOT NULL,
  move_type TEXT NOT NULL
    CHECK (move_type IN ('offer','counter','accept','reject','withdraw')),
  price_cents INTEGER,
  message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_negmoves_session ON negotiation_moves(session_id);
