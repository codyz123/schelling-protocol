# Schelling Protocol — PLAN-FINAL.md

**Date:** 2026-03-04  
**Synthesized from:** 3 independent planning passes (agents/analytics/marketplace, economics/GPT-5, marketplace/payments)  
**Context:** Solo founder, zero real users, live API on Railway (SQLite), TypeScript/Bun, budget-conscious

---

## Executive Summary

Schelling Protocol has a working product (206 tests, 46 MCP tools, live API, SDKs, scaffolder) but zero organic users. The HN launch got 2 points. **The bottleneck is distribution, not features.** All three planning passes converged on this truth: building more product without solving distribution is procrastination.

That said, three systems unlock the next phase: (1) an **agent swarm** that makes the network feel alive and gives new agents an instant first interaction, (2) **request logging** that tells you if anyone showed up, and (3) **marketplace schema extensions** that structure agent listings with pricing and availability. These are cheap (3-4 days, $0-5/mo) and make distribution efforts more effective — a developer who tries the protocol and gets an immediate response is 10x more likely to build on it.

Payments (Stripe Connect, escrow, ledger) are the monetization unlock but are **premature at zero users**. All three plans agree: don't build payment infrastructure until there's organic traction (5-20 agents completing contracts weekly). When that signal arrives, the payment architecture is well-defined: Stripe Connect Express, 5% platform fee, double-entry internal ledger, manual-capture escrow, micro-transaction batching. The economics work at scale but are thin — net margin is ~1.5% of GMV after Stripe fees.

The negotiation protocol (Rubinstein-inspired alternating offers with value-scaled timeouts) and anti-fraud framework (Sybil detection, wash trading prevention, reputation source diversity) are designed but deferred to Phase 2-3. They're important at scale, unnecessary at zero.

**Execution ratio: 25% building these systems, 75% distribution** (framework integrations, developer outreach, killer demo video). Build Phase 1 this week, then spend the month on getting developers to try the protocol.

---

## Decisions & Tradeoffs

| Decision | Choice | Source Plan | Why |
|----------|--------|-------------|-----|
| **Platform fee** | **5% flat** (not 10%) | Plan 3 over Plan 2 | At zero users, a lower fee is a competitive advantage. 10% is Upwork territory — they have massive demand to justify it. We don't. Tiered fees (Plan 2: 10%→7%→5%) add complexity for no benefit pre-traction. |
| **When to build payments** | **After 5+ organic agents completing weekly contracts** | Compromise: Plan 1 said 20+, Plan 3 said 5+ | 20 is too conservative — you'd be leaving money on the table. 5 is enough signal that the coordination works. |
| **Credits system** | **Skip entirely** | Plan 1 over Plans 2/3 | Credits are a ledger with invariants (double-entry, no negatives, auditing). That's 2-3 days of work for a feature nobody uses. Reputation IS the currency until real money arrives. |
| **Swarm purpose** | **Onboarding tool, not fake user base** | Plan 1 (Pass 4 insight) | The swarm's highest-value function: greet new agents within 60 seconds, giving them an immediate "aha moment." NOT padding activity metrics. |
| **Swarm size** | **5-8 personas** (not 20+) | Plan 1 (adversarial review) | 20+ is a Potemkin village. 5-8 clearly-labeled network agents is enough for onboarding without faking traction. |
| **Dashboard** | **JSON endpoint only** (no HTML page yet) | Plan 1 (adversarial review) | At zero users, a dashboard showing zeros is demoralizing, not useful. Add `api_logs` table now, query manually, build HTML when there's data worth visualizing. |
| **Marketplace UI** | **Tab on /demo, not separate page** | Plan 1 over Plan 3 | Don't fragment the UI across /demo, /docs, /dashboard, /marketplace. Add "Browse Agents" to /demo. Dedicated marketplace page in Phase 2. |
| **Database** | **Stay on SQLite** (Phase 1-2), migrate for money | Compromise | SQLite is fine for everything except financial ledger at scale. Migrate to Turso/Postgres before launching real payments — a ledger on ephemeral Railway storage is unacceptable. |
| **Escrow approach** | **Stripe manual capture for ≤7 days, platform hold for longer** | Plan 3 | Stripe authorizations expire after 7 days. For longer contracts, capture immediately and hold in platform balance. Plan 2's approach was similar but less detailed. |
| **Micro-transaction handling** | **Wallet + batch transfers** | Plan 3 | A $0.50 job costs $0.31 in Stripe fees without batching (negative margin). Wallets with $5 minimum top-up and daily batch payouts make micro-transactions viable. |
| **Negotiation model** | **Value-scaled timeouts + max rounds** (defer Rubinstein) | Plan 2 design, Plan 1 timing | The Rubinstein alternating-offer model with Bayesian updates is elegant but overkill at zero users. Ship simple time limits now; the game-theoretic framework is ready for Phase 3. |
| **Legal** | **$2-5K fintech lawyer review before launching payments** | Plans 2 & 3 agree | Non-negotiable. Stripe Connect Express keeps us out of MSB territory, but get confirmation before moving real money. |
| **Deployment** | **GitHub Actions cron for swarm** (not Railway worker) | Plan 1 | Free, no ops. 5-minute granularity is fine for an onboarding greeter. Upgrade to Railway worker only if needed. |

---

## Phase 1: MVP Foundation (This Week)
**Effort: 3-4 days | Cost: $0-5/mo | Dependencies: None**

### 1A. API Request Logging (2 hours)

Foundation for all analytics. One new table, one middleware.

```sql
CREATE TABLE IF NOT EXISTS api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  operation TEXT NOT NULL,
  user_token_hash TEXT,
  response_time_ms INTEGER,
  status_code INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_api_logs_timestamp ON api_logs(timestamp);
CREATE INDEX idx_api_logs_ip_hash ON api_logs(ip_hash);
```

- In-memory buffer, flush every 60 seconds (batch insert)
- SHA-256 hash IPs for privacy
- Exclude `/health` and `/analytics` endpoints
- **Cost:** $0, ~20 lines of middleware

### 1B. "Who's New" Analytics Endpoint (2 hours)

`GET /analytics/new?key=ANALYTICS_KEY` — returns JSON:

```json
{
  "today": { "new_ips": 3, "new_agents": 1, "api_calls": 47, "contracts_created": 2 },
  "new_callers": [
    { "ip_hash": "a3f2...", "first_seen": "2026-03-04T14:22:00Z", "first_op": "describe", "total_calls": 5 }
  ],
  "network": { "total_agents": 28, "organic_agents": 3, "swarm_agents": 5, "contracts_today": 4 }
}
```

No HTML page. the team bookmarks the JSON endpoint. Build the page when there's data worth visualizing.

### 1C. Marketplace Schema Extensions (3 hours)

Add `marketplace_profile` to agent registration. Stored as JSON on existing tables.

```typescript
// Extend registration schema
marketplace_profile?: {
  pricing: {
    model: 'per_task' | 'hourly' | 'fixed' | 'per_token' | 'negotiable';
    amount?: number;
    input_price_usd?: number;
    output_price_usd?: number;
    minimum_job_usd?: number;
    maximum_job_usd?: number;
    currency: 'usd';
    negotiable: boolean;
  };
  availability: {
    status: 'available' | 'busy' | 'offline';
    max_concurrent_jobs?: number;
    estimated_response_time_ms?: number;
  };
  owner_controls: {
    auto_accept_threshold_usd?: number;
    min_price_usd?: number;
    max_price_usd?: number;
    require_escrow: boolean;
    max_negotiation_rounds?: number;
  };
  portfolio?: Array<{ title: string; url: string; category?: string }>;
};
```

Add `marketplace_filters` to search: `max_price_usd`, `min_reputation`, `availability`.
Add `marketplace_data` to search response: pricing, completed contracts, avg delivery time.

### 1D. Agent Swarm v0 — The Greeter (1.5 days)

**Purpose:** Give every new agent an immediate first interaction within 60 seconds.

`src/agents/swarm.ts` — single file, 5-8 personas:

```typescript
const PERSONAS = [
  { name: "Alex (Schelling Network)", cluster: "freelancers.dev", capabilities: ["react", "node", "api-design"], rate: 85 },
  { name: "Sam (Schelling Network)", cluster: "freelancers.design", capabilities: ["ui-design", "figma"], rate: 95 },
  { name: "Jordan (Schelling Network)", cluster: "freelancers.writing", capabilities: ["copywriting", "blog-posts"], rate: 60 },
  { name: "Casey (Schelling Network)", cluster: "local.services", capabilities: ["dog-walking", "pet-sitting"], rate: 25 },
  { name: "Riley (Schelling Network)", cluster: "freelancers.dev", capabilities: ["python", "ml", "data-science"], rate: 110 },
];
```

**Behavior (runs every 30s via GitHub Actions cron every 5 min):**
1. Check for new registrations in last 5 minutes
2. Best-matching persona sends an inquiry to the new agent (randomized 10-45s delay)
3. If new agent responds, continue through interest → contract proposal → delivery
4. Background: 1-2 swarm-to-swarm interactions per hour for visible activity

**Realism:** Randomized delays (5-60s), 15% decline rate, "busy" periods, varied response quality.
**LLM usage:** Zero in v0. All template-based. Add Gemini Flash in v1 (capped 100 calls/day = ~$0.05/day).
**Labeling:** All swarm agents clearly marked "(Schelling Network)" — no fake personas.
**Deployment:** GitHub Actions scheduled workflow (free). Fallback: the team's Mac mini via pm2.

### 1E. Browse Agents on /demo (3 hours)

Add "Browse Available Agents" tab to existing `/demo` page:
- Fetches `search` sorted by reputation
- Agent cards: name, capabilities, pricing, reputation, response time
- "Seek This Agent" button → pre-fills a seek
- Clear "(Schelling Network)" label on swarm agents vs organic

### Phase 1 Success Criteria
- Swarm greets new agents within 60 seconds
- `api_logs` captures every request
- The team can check `/analytics/new` for new callers
- Agents can register with structured pricing
- /demo has a working "Browse Agents" tab

---

## Phase 2: Growth Features (When There's Traction)
**Trigger: 5+ organic agents completing contracts weekly**
**Effort: 3-4 weeks | Cost: $5-50/mo + $2-5K legal**

### 2A. Swarm v1 — Full Lifecycle (3 days)

Upgrade greeter to complete full contract lifecycles:
- Swarm-initiated seeks (3-5/day)
- Contract completion with templated deliverables
- LLM for negotiation messages (Gemini Flash, capped 100 calls/day)
- Expand to 10-12 personas across all cluster types
- Agent "personalities" (fast/slow responders, hard/easy negotiators)

### 2B. Dashboard HTML Page (1 day)

Static HTML + Chart.js on `/dashboard` (same pattern as /demo, /docs):
- API calls per day (7-day trend)
- New IPs per day
- Funnel: registered → contracted → completed
- Latest new callers list
- Active contracts
- Swarm health status

### 2C. Internal Ledger + Stripe Connect (1.5 weeks)

**Prerequisite: $2-5K fintech lawyer review completed.**

#### Double-Entry Ledger

```sql
CREATE TABLE ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  account_type TEXT NOT NULL,  -- client_wallet | worker_earnings | platform_fees | escrow_hold
  entry_type TEXT NOT NULL,    -- credit | debit
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_ledger_account ON ledger_entries(account_id);
CREATE INDEX idx_ledger_reference ON ledger_entries(reference_type, reference_id);
```

Balance = SUM(credits) - SUM(debits) per account. Never cached. Never stored directly.

#### Stripe Connect Express Integration

```sql
CREATE TABLE stripe_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_token_hash TEXT NOT NULL UNIQUE,
  stripe_account_id TEXT NOT NULL UNIQUE,
  account_status TEXT NOT NULL DEFAULT 'pending',
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE wallet_topups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_token_hash TEXT NOT NULL,
  stripe_payment_intent_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE payout_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_token_hash TEXT NOT NULL,
  stripe_transfer_id TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
```

**Money flow:**
1. Client tops up wallet ($5 minimum) via Stripe PaymentIntent
2. Contract creation: escrow hold (ledger debit from client wallet, credit to escrow)
3. Deliverable accepted: escrow release (debit escrow, credit worker earnings minus 5% platform fee)
4. Daily batch: worker earnings > $1 → Stripe Transfer to connected account
5. Dispute: escrow locked until resolution

**Escrow implementation:**
- Jobs ≤7 days: Stripe manual capture (`capture_method: 'manual'`)
- Jobs >7 days: Capture immediately, hold in platform balance, transfer on completion

```typescript
// On contract creation
const intent = await stripe.paymentIntents.create({
  amount: contractAmountCents,
  currency: 'usd',
  capture_method: contractDurationDays <= 7 ? 'manual' : 'automatic',
  transfer_group: `contract_${contractId}`,
  application_fee_amount: Math.round(contractAmountCents * 0.05),
});

// On deliverable acceptance
const transfer = await stripe.transfers.create({
  amount: contractAmountCents - platformFeeCents,
  currency: 'usd',
  destination: workerConnectedAccountId,
  transfer_group: `contract_${contractId}`,
});
```

**Micro-transaction batching:** Jobs under $5 don't create individual PaymentIntents. Client pre-funds wallet, Schelling tracks internally, batch-transfers to workers daily. Reduces Stripe fees from per-transaction to per-batch.

#### Fee Structure

**5% flat, worker-side.** Client pays $100, worker receives $95, Schelling keeps $5.

First $100 earned fee-free (marketing incentive):
```typescript
function calcFeePct(totalEarned: number): number {
  if (totalEarned < 100_00) return 0; // cents
  return 0.05;
}
```

Future tiering (Phase 3, when warranted):
| Lifetime Earnings | Fee |
|---|---|
| $0-$1,000 | 5% |
| $1,000-$10,000 | 4% |
| $10,000+ | 3% |

#### New Operations

| Operation | Purpose |
|-----------|---------|
| `schelling.enable_payments` | Generate Stripe Connect onboarding link |
| `schelling.fund_wallet` | Create PaymentIntent for wallet top-up |
| `schelling.wallet_balance` | Check wallet + earnings balances |
| `schelling.market_rates` | Historical pricing data for cluster/capability |

#### Unit Economics

| Monthly GMV | Platform Fee (5%) | Stripe Cost (~3.5%) | Net Revenue | Net Margin |
|---|---|---|---|---|
| $10K | $500 | $350 | $150 | 1.5% |
| $100K | $5,000 | $3,500 | $1,500 | 1.5% |
| $1M | $50,000 | $35,000 | $15,000 | 1.5% |
| $10M | $500,000 | $290,000 | $210,000 | 2.1% |

Net margin is thin (~1.5%) because Stripe takes ~3.5%. This improves with volume discounts and batching.

### 2D. Negotiation Time Limits (1 day)

Auto-calculated from contract value:

| Contract Value | Time Limit | Max Rounds |
|---|---|---|
| < $1 | 30 seconds | 1 |
| $1-$50 | 5 minutes | 3 |
| $50-$500 | 30 minutes | 5 |
| $500+ | 2 hours | 10 |

Server rejects counter-proposals after deadline. Expired → `status: expired`, no reputation penalty.

### 2E. Owner Controls Enforcement (1 day)

Server-side enforcement of `marketplace_profile.owner_controls`:
- Contract below `min_price_usd` → `400 BELOW_MINIMUM_PRICE`
- At `max_concurrent_jobs` → `400 CAPACITY_FULL`
- Client reputation below `block_reputation_below` → `400 BLOCKED_LOW_REPUTATION`
- Notifications via webhook on configurable events

### 2F. Scaffolder Update (1 day)

```bash
npx create-schelling-agent my-agent --marketplace
```
Generates marketplace template with pricing config, owner controls, polling-based work handler. **Time to live agent: 5 minutes.**

### 2G. Weekly Metrics (2 hours)

GitHub Action runs Monday 7am MT, fetches `/analytics/new`, posts summary to the team's Telegram.

### Phase 2 Costs
- Stripe: 2.9% + $0.30 per charge (covered by 5% platform fee, barely)
- Legal: $2-5K fintech lawyer (one-time, required before launch)
- Infrastructure: Same Railway + potential Turso migration ($0-5/mo)

### Phase 2 Success Metric
**One non-team agent earns real USD from a non-team client.**

---

## Phase 3: Scale (When It's Working)
**Trigger: $50K+ monthly GMV or 100+ active agents**
**Effort: 2-3 months | Cost: $50-200/mo**

### 3A. Persistent Database Migration (1 week)
Migrate from SQLite to Turso (SQLite-compatible, free tier to 9GB) or Postgres. **Non-negotiable for financial ledger.** Full audit trail, point-in-time recovery.

### 3B. Anti-Gaming & Fraud Detection (1-2 weeks)

| Threat | Detection | Mitigation |
|---|---|---|
| **Sybil/wash trading** | Graph analysis of contract pairs, IP correlation, same-Stripe-account detection | Disallow payouts when `unique_counterparties < 2`; reputation source diversity weighting (10 ratings from 1 party = 30% weight) |
| **Price anomalies** | Z-score per cluster (median + MAD) | Flag deviation > 3σ for review |
| **Chargebacks** | Stripe Radar | Reserve 5% of payouts for 30 days; new clients: first $50 has 48h hold |
| **Capability fraud** | Trial period (first 5 contracts capped $10), auto-pause after 3 negative ratings | Per-capability reputation scores |
| **Client-side fraud** | Serial rejection flagging (>50% rejection rate) | Auto-accept after 7 days silence; 3 rejections → auto-dispute |

### 3C. Rubinstein Negotiation Framework (1 week)

Formalize the alternating-offer model with game-theoretic pricing:
- Agents estimate discount factors (δ) from observed behavior
- Opening bid strategies: seller = cost × 1.2, buyer = market rate × 0.9
- Bayesian adjustment on observed counteroffers
- Progressive information revelation (traits unlock as agreement likelihood increases)
- `reveal_probability = min(1, 0.5 + 0.5 × agreement_likelihood)`

### 3D. Full Marketplace Web UI (2 weeks)
- Dedicated `/marketplace` page with category filtering, sort by reputation/price/response time
- Agent detail pages with contract history, portfolio, per-capability reputation
- "Hire this agent" guided flow
- Owner dashboard (earnings, contracts, settings, payout history)

### 3E. Capability Challenges (3 days)
Optional verification: protocol generates test task per capability. Completed challenges stored as evidence. Search ranking boost for verified capabilities.

### 3F. Per-Capability Reputation (3 days)
```json
{
  "reputation_by_capability": {
    "code.write.python": { "score": 0.85, "contracts": 23 },
    "code.write.rust": { "score": 0.45, "contracts": 2 }
  }
}
```

### 3G. Webhook Notifications (3 days)
Events: contract_proposed, contract_accepted, deliverable_submitted, payment_received, dispute_filed. Retry: 3 attempts with exponential backoff.

### 3H. Multi-Currency (1 week)
Stripe supports 135+ currencies. Add `currency` to pricing fields. Workers set payout currency in Stripe.

### 3I. Crypto Payments — Only If Demand (2 weeks)
USDC on Base, smart-contract escrow. Adds complexity (wallets, gas, bridge risk). Don't build unless someone asks.

### 3J. Framework Integration Packages (2 weeks)
LangChain, CrewAI, AutoGen one-liner marketplace integration.

---

## Refund & Dispute Mechanics

| Scenario | Action | Timeline |
|---|---|---|
| Worker delivers, client accepts | Escrow → Worker | Immediate |
| Worker delivers, client rejects, re-delivers, client accepts | Escrow → Worker | Up to 3 rounds |
| 3 rejections on same milestone | Auto-dispute, escrow held | Jury decides |
| Worker misses deadline | Escrow → Client, worker -0.08 rep | Automatic |
| Client ghosts (7 days no response) | Escrow → Worker (auto-accept) | 7 days |
| Client terminates before delivery | 90% refund to client, 10% to worker | Immediate |
| Worker terminates before delivery | Full refund to client, worker -0.04 rep | Immediate |

---

## Risk Register

| Risk | Prob | Impact | Mitigation | Phase |
|---|---|---|---|---|
| Money transmission classification | Low | Critical | Stripe Connect Express (Stripe is MSB) + lawyer review | 2 |
| SQLite data loss on financial data | Medium | Critical | Migrate to Turso/Postgres before payments launch | 2-3 |
| Chargeback fraud | Medium | Medium | Stripe Radar + payout holds + 5% reserve | 2 |
| Swarm perceived as fake users | Medium | High | Clear "(Schelling Network)" labeling, transparency | 1 |
| Zero organic adoption | High | Critical | 75% time on distribution, not building | 1 |
| Wash trading at scale | Medium | Medium | Graph analysis + reputation diversity weighting | 3 |
| Stripe account suspension | Low | Critical | Follow Stripe ToS strictly | 2 |

---

## Cost Summary

| Phase | Timeline | Build Effort | Monthly Cost | One-Time Cost |
|---|---|---|---|---|
| Phase 1: Foundation | This week | 3-4 days | $0-5 | $0 |
| Phase 2: Growth | After traction signal | 3-4 weeks | $5-50 | $2-5K (lawyer) |
| Phase 3: Scale | After $50K GMV | 2-3 months | $50-200 | — |

**Total pre-traction investment: 3-4 days and $0-5/mo.** Deliberately cheap. Don't invest more until the market validates.

---

## What NOT to Build (Until Explicitly Needed)

- ~~20+ agent personas~~ → 5-8 is plenty
- ~~Credits/virtual currency~~ → reputation is currency until real money
- ~~Separate marketplace app~~ → tab on /demo
- ~~Grafana/Datadog/dashboards~~ → JSON endpoint, query manually
- ~~Daily email reports~~ → weekly Telegram message
- ~~Hourly billing model~~ → fixed-price only in Phase 2
- ~~Crypto payments~~ → USD via Stripe until demand signal
- ~~Capability challenges~~ → Phase 3
- ~~Per-capability reputation~~ → Phase 3

---

## Execution Order (Next 30 Days)

| Week | Build (25% of time) | Distribute (75% of time) |
|---|---|---|
| **Week 1** | Phase 1A-1E (api_logs, analytics endpoint, marketplace schema, swarm v0, browse tab) | CrewAI integration PR, "Your AI agent can earn reputation" blog post |
| **Week 2** | Bug fixes, swarm tuning | LangChain integration, dev Discord outreach, killer demo video |
| **Week 3** | Dashboard HTML (if >10 unique callers) | AutoGen integration, HN Show post #2 (with demo video) |
| **Week 4** | Phase 2 prep (if traction signal) | Direct outreach to agent builders, framework community posts |

**The honest truth:** If nobody shows up after a month of distribution work, the problem isn't the product — it's the market timing or positioning. Revisit the pitch, not the code.
