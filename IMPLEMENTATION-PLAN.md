# Agent Marketplace — Implementation Plan

## Pass 1: Initial Implementation Plan

### Architecture Overview

The marketplace is NOT a separate service. It's 7 additions to the existing Bun/Hono API server:

```
src/
  transports/rest.ts          ← add 6 new POST routes
  services/
    marketplace.ts            ← NEW: marketplace logic (listing, search filters, market rates)
    negotiation.ts            ← NEW: time-limited negotiation engine
    ledger.ts                 ← NEW: double-entry accounting
    stripe.ts                 ← NEW: Stripe Connect integration
    escrow.ts                 ← NEW: escrow state machine
  db/
    schema.sql                ← add 4 new tables
    migrations/
      001-marketplace.sql     ← marketplace schema additions
```

### Implementation Order (dependency-driven)

#### Step 1: Database Schema (30 min)
Add to existing SQLite:

```sql
-- Marketplace profiles (extends registrations)
CREATE TABLE marketplace_profiles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  registration_id TEXT NOT NULL REFERENCES registrations(id),
  hourly_rate_cents INTEGER,
  per_task_rate_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  min_price_cents INTEGER DEFAULT 0,
  max_concurrent_jobs INTEGER DEFAULT 5,
  auto_accept_below_cents INTEGER,  -- auto-accept jobs below this price
  availability TEXT DEFAULT 'available', -- available, busy, offline
  capabilities_json TEXT,  -- structured capabilities for marketplace search
  stripe_account_id TEXT,  -- Stripe Connect account
  stripe_onboarded INTEGER DEFAULT 0,
  total_earned_cents INTEGER DEFAULT 0,
  total_jobs_completed INTEGER DEFAULT 0,
  avg_delivery_seconds INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Double-entry ledger
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  account_id TEXT NOT NULL,  -- user_token_hash or 'platform'
  account_type TEXT NOT NULL, -- client_wallet, worker_earnings, platform_fees, escrow_hold
  entry_type TEXT NOT NULL,   -- credit, debit
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  reference_type TEXT,  -- contract, payout, topup, refund
  reference_id TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Escrow records
CREATE TABLE escrow_records (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contract_id TEXT NOT NULL,
  client_account_id TEXT NOT NULL,
  worker_account_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'held', -- held, released, refunded, disputed
  held_at TEXT DEFAULT (datetime('now')),
  released_at TEXT,
  ledger_hold_id TEXT,  -- reference to ledger debit
  ledger_release_id TEXT  -- reference to ledger credit
);

-- Negotiation sessions
CREATE TABLE negotiation_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  seeker_token_hash TEXT NOT NULL,
  offerer_token_hash TEXT NOT NULL,
  cluster_id TEXT,
  status TEXT DEFAULT 'active', -- active, agreed, expired, rejected, withdrawn
  current_price_cents INTEGER,
  initial_ask_cents INTEGER,
  initial_bid_cents INTEGER,
  rounds INTEGER DEFAULT 0,
  max_rounds INTEGER DEFAULT 10,
  deadline_ms INTEGER NOT NULL,
  deadline_at TEXT NOT NULL,
  agreed_price_cents INTEGER,
  market_rate_cents INTEGER,  -- reference rate at negotiation start
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE negotiation_moves (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT NOT NULL REFERENCES negotiation_sessions(id),
  agent_token_hash TEXT NOT NULL,
  move_type TEXT NOT NULL, -- offer, counter, accept, reject, withdraw
  price_cents INTEGER,
  message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_marketplace_avail ON marketplace_profiles(availability);
CREATE INDEX idx_ledger_account ON ledger_entries(account_id, account_type);
CREATE INDEX idx_escrow_contract ON escrow_records(contract_id);
CREATE INDEX idx_escrow_status ON escrow_records(status);
CREATE INDEX idx_neg_status ON negotiation_sessions(status);
CREATE INDEX idx_neg_deadline ON negotiation_sessions(deadline_at);
```

#### Step 2: Marketplace Profile Operations (2 hours)
New Schelling operations:

**`schelling.marketplace_register`**
- Input: `user_token`, `registration_id`, `hourly_rate_cents`, `per_task_rate_cents`, `min_price_cents`, `max_concurrent_jobs`, `auto_accept_below_cents`, `capabilities`
- Creates marketplace_profiles row
- Returns: `marketplace_id`, `stripe_onboarding_url` (if Stripe configured)

**`schelling.marketplace_update`**
- Update pricing, availability, capabilities, controls
- Validates: min_price >= 0, max_concurrent >= 1

**`schelling.marketplace_search`**
- Sugar over existing search with marketplace filters:
  - `max_price_cents`, `min_reputation`, `capabilities`, `availability`
- Returns enriched results with: price, completed_jobs, avg_delivery_time, reputation

**`schelling.market_rates`**
- Returns computed market rates by capability/cluster
- Source: completed contracts with accepted deliverables
- Median, p25, p75 for each capability

#### Step 3: Negotiation Engine (3 hours)
**`schelling.negotiate_start`**
- Input: `seeker_token`, `offerer_token`, `initial_bid_cents`, `job_description`
- Computes `deadline_ms` from bid amount:
  - <100 ($1): 30,000ms
  - 100-5000 ($1-$50): 300,000ms  
  - 5000-50000 ($50-$500): 1,800,000ms
  - 50000+ ($500+): 7,200,000ms
- Fetches market_rate for reference
- Creates negotiation_session + first move
- Auto-notifies offerer (or offerer polls)

**`schelling.negotiate_respond`**
- Input: `session_id`, `agent_token`, `move_type` (counter|accept|reject|withdraw), `price_cents`
- Validates: deadline not passed, agent is party, it's their turn
- On counter: records move, increments rounds
- On accept: creates contract with agreed price, transitions to contract lifecycle
- On reject/withdraw: closes session
- Enforces `max_rounds` (default 10)
- Enforces agent's `min_price_cents` server-side (auto-reject below floor)

**`schelling.negotiate_status`**
- Returns current session state, all moves, time remaining

**Deadline enforcement:**
- Background interval (every 10s) checks for expired negotiations
- Expired → status='expired', no reputation penalty
- Optionally: auto-accept if last offer was within auto_accept threshold

#### Step 4: Ledger Service (2 hours)
Pure accounting — no Stripe dependency.

Functions:
- `credit(account_id, account_type, amount_cents, reference)` → creates credit entry
- `debit(account_id, account_type, amount_cents, reference)` → creates debit entry, fails if balance < amount
- `balance(account_id, account_type)` → SUM(credits) - SUM(debits)
- `transfer(from_account, from_type, to_account, to_type, amount, reference)` → atomic debit + credit
- `ledger_history(account_id)` → all entries for account

Balance is ALWAYS computed, never cached. At this scale (< 1M entries), this is fine.

#### Step 5: Escrow Service (2 hours)
Connects ledger to contract lifecycle:

- **On contract creation** (after negotiation accept):
  - Verify client has sufficient wallet balance
  - `debit(client, client_wallet, agreed_price + platform_fee)`
  - `credit(escrow, escrow_hold, agreed_price + platform_fee)`
  - Create escrow_record(status='held')

- **On deliverable accepted:**
  - `debit(escrow, escrow_hold, agreed_price + platform_fee)`
  - `credit(worker, worker_earnings, agreed_price * 0.95)` (95% to worker)
  - `credit(platform, platform_fees, agreed_price * 0.05)` (5% fee)
  - Update escrow_record(status='released')

- **On contract terminated/cancelled:**
  - `debit(escrow, escrow_hold, full_amount)`
  - `credit(client, client_wallet, full_amount)` (full refund)
  - Update escrow_record(status='refunded')

- **On dispute:**
  - Escrow stays locked (status='disputed')
  - Resolution triggers either release or refund path

- **Auto-accept timeout (7 days):**
  - If deliverable submitted but client hasn't responded in 7 days
  - Auto-accept → release to worker

#### Step 6: Stripe Connect Integration (4 hours)
Using Stripe Connect Express (simplest):

**`schelling.stripe_onboard`**
- Input: `user_token`
- Creates Stripe Connect Express account
- Returns onboarding URL (Stripe-hosted flow)
- Webhook: `account.updated` → set `stripe_onboarded=1`

**`schelling.wallet_topup`**
- Input: `user_token`, `amount_cents`, `payment_method_id`
- Creates PaymentIntent with manual capture
- On success: `credit(user, client_wallet, amount_cents)`
- Webhook: `payment_intent.succeeded` → confirm ledger credit

**`schelling.wallet_balance`**
- Returns: `client_balance`, `earnings_balance`, `pending_payouts`

**`schelling.payout_request`**
- Transfers from `worker_earnings` to Stripe connected account
- Minimum: $1.00 (100 cents)
- Creates Stripe Transfer to connected account
- `debit(worker, worker_earnings, amount)`

**Daily batch payouts (optional):**
- Cron: check all workers with earnings > $1
- Auto-payout to Stripe connected accounts
- Email/webhook notification

#### Step 7: Wire It All Together (2 hours)
- Add all new operations to `src/transports/rest.ts`
- Add Stripe webhook endpoint: `POST /webhooks/stripe`
- Add marketplace data to existing `search` response when `format=marketplace`
- Add negotiation deadline checker to server startup (setInterval)
- Add auto-accept checker (7-day timeout on deliverables)
- Update MCP server with new tools
- Update tests

---

## Pass 2: Edge Cases, Polish & Improvements

### Edge Cases to Handle

**Negotiation:**
1. **Both agents counter simultaneously** → enforce turn-based: only the agent whose turn it is can move. Track `current_turn` in session.
2. **Agent's owner changes min_price mid-negotiation** → the new min_price applies to the NEXT negotiation, not the current one. Lock controls at negotiation start.
3. **Network timeout during accept** → idempotent accept: if contract already created from this session, return it. Don't create duplicate.
4. **Market rate is $0 (no history)** → don't provide market_rate reference. Agents negotiate blind. Log for analytics.
5. **Negotiation between two agents owned by same person** → allow it (legitimate use case: testing). Flag in analytics for wash trade detection later.

**Escrow:**
6. **Client wallet has insufficient funds when contract is created** → reject contract creation with clear error: "Insufficient funds. Balance: $X, Required: $Y. Top up with schelling.wallet_topup"
7. **Stripe payout fails (bank account invalid)** → mark payout as failed, credit back to worker_earnings. Notify via webhook. Don't retry automatically.
8. **Deliverable rejected but no dispute filed** → worker can re-submit. If 3 rejections without dispute, auto-escalate to dispute system.
9. **Client disappears after creating contract** → 14-day inactivity timeout on contracts. After 14 days, refund escrow to client, no reputation penalty for worker.

**Payments:**
10. **Stripe webhook arrives before our API response** → use idempotency keys on all Stripe calls. Process webhooks idempotently (check if ledger entry exists before creating).
11. **Fractional cents from fee calculation** → always round in platform's favor (ceiling for fees). `Math.ceil(amount * 0.05)`.
12. **$0 contract** → allow. No escrow needed. Useful for reputation-building. Track separately in analytics.
13. **Chargeback** → Stripe webhook `charge.disputed`: freeze worker_earnings for that amount. If dispute lost, debit worker. This is the "chargeback reserve" — hold 5% of each payout for 30 days.

**Security:**
14. **Rate limiting on financial operations** → separate rate limit: 10 financial ops/min per user (vs 120 general). Financial ops = topup, payout, negotiate, contract_create.
15. **SQL injection on ledger** → all queries parameterized (already standard in the codebase). Extra validation: amount_cents must be positive integer, account_id must match user_token_hash.
16. **Replay attacks on negotiations** → each move has sequential ID. Server rejects moves with out-of-order IDs.

### Schema Improvements

```sql
-- Add to negotiation_sessions:
ALTER TABLE negotiation_sessions ADD COLUMN current_turn TEXT; -- which agent's turn
ALTER TABLE negotiation_sessions ADD COLUMN locked_controls_json TEXT; -- snapshot of both agents' controls at start

-- Add to marketplace_profiles:
ALTER TABLE marketplace_profiles ADD COLUMN payout_hold_cents INTEGER DEFAULT 0; -- chargeback reserve
ALTER TABLE marketplace_profiles ADD COLUMN last_payout_at TEXT;
```

### API Response Improvements

All financial operations return:
```json
{
  "success": true,
  "balance": { "client_wallet": 5000, "worker_earnings": 1200, "pending_escrow": 3000 },
  "transaction_id": "led_abc123"
}
```

Negotiation responses include time remaining:
```json
{
  "session_id": "neg_xyz",
  "status": "active",
  "your_turn": true,
  "current_price_cents": 500,
  "market_rate_cents": 450,
  "time_remaining_ms": 240000,
  "rounds_remaining": 7,
  "moves": [...]
}
```

### MCP Tools to Add (for Claude Desktop)
```
schelling.marketplace_register    — List your agent for hire
schelling.marketplace_update      — Update pricing/availability
schelling.marketplace_search      — Find agents for hire
schelling.market_rates            — Get market rate reference
schelling.negotiate_start         — Start price negotiation
schelling.negotiate_respond       — Counter/accept/reject
schelling.negotiate_status        — Check negotiation state
schelling.stripe_onboard          — Connect Stripe account
schelling.wallet_topup            — Add funds
schelling.wallet_balance          — Check balances
schelling.payout_request          — Withdraw earnings
```

11 new MCP tools (46 → 57 total).

### Testing Plan
1. **Ledger invariant:** SUM(all credits) = SUM(all debits) always. Test after every operation sequence.
2. **Escrow round-trip:** topup → negotiate → contract → deliver → accept → payout. Verify all balances.
3. **Negotiation timeout:** start negotiation, wait past deadline, verify auto-expire.
4. **Concurrent negotiations:** same agent in 2 negotiations simultaneously. Verify isolation.
5. **Auto-accept:** submit deliverable, wait 7 days (mocked), verify auto-release.
6. **Fee calculation:** verify 5% fee on various amounts including fractional cents.
7. **Insufficient funds:** try to create contract without balance. Verify rejection.

### Implementation Notes
- **No Stripe dependency for development:** all ledger/escrow/negotiation logic works without Stripe. Stripe is just the funding source and payout destination. Can develop and test everything with manual `credit()` calls.
- **Stripe env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`
- **Feature flag:** `MARKETPLACE_ENABLED=true` to gate all marketplace endpoints. Default off until ready.
