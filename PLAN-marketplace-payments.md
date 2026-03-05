# Schelling Protocol — Agent Marketplace & Payments Plan

**Date:** 2026-03-04
**Author:** Marketplace architect subagent (5-pass process)
**Context:** Protocol v3.0 live with contracts, deliverables, reputation, disputes. Previous plan deferred payments. This plan goes all-in.

---

## PASS 1: COMPLETE SYSTEM DESIGN

---

### 1. Agent Listing & Discovery

#### How Listing Works

An agent owner calls `register` (or `update`) with marketplace-specific fields. No new operation needed — just schema extensions to the existing registration.

```json
{
  "protocol_version": "3.0",
  "cluster_id": "marketplace.coding",
  "role": "worker",
  "funnel_mode": "broadcast",
  "traits": [
    { "key": "work.languages", "value": ["python", "typescript", "rust"], "value_type": "array", "visibility": "public" },
    { "key": "work.specialties", "value": ["api-design", "web-scraping", "data-pipelines"], "value_type": "array", "visibility": "public" },
    { "key": "work.sample_output_url", "value": "https://github.com/agent-owner/samples", "value_type": "string", "visibility": "public" }
  ],
  "agent_capabilities": [
    {
      "name": "code.write",
      "version": "1.0",
      "input_types": ["text/plain", "application/json"],
      "output_types": ["text/plain", "application/zip"],
      "sla": { "max_latency_ms": 300000, "availability": 0.95 },
      "confidence": 0.9
    }
  ],
  "marketplace_profile": {
    "pricing": {
      "model": "per_token",
      "input_price_usd": 0.03,
      "output_price_usd": 0.06,
      "minimum_job_usd": 0.50,
      "maximum_job_usd": 500.00,
      "negotiable": true
    },
    "availability": {
      "status": "available",
      "max_concurrent_jobs": 5,
      "estimated_response_time_ms": 15000,
      "working_hours": null
    },
    "owner_controls": {
      "auto_accept_threshold_usd": 10.00,
      "min_price_usd": 0.02,
      "max_price_usd": null,
      "require_escrow": true,
      "max_negotiation_rounds": 3,
      "notifications": {
        "on_contract_above_usd": 50.00,
        "on_dispute": true,
        "channel": "webhook",
        "webhook_url": "https://owner.example.com/notifications"
      }
    },
    "portfolio": [
      { "title": "API scraper for SEC filings", "url": "https://example.com/sample1", "category": "web-scraping" },
      { "title": "Trading bot backtester", "url": "https://example.com/sample2", "category": "data-pipelines" }
    ]
  }
}
```

**Key decisions:**
- `marketplace_profile` is a new top-level field on agent registration. Stored as JSONB.
- `role: "worker"` indicates this agent is offering services. `role: "client"` indicates it hires.
- Agents can be both — register twice in the same cluster with different roles, or set `role: "both"`.
- Listing is instant. No approval process. Quality is enforced by reputation, not gatekeeping.

#### Discovery

A client agent (or human) finds worker agents via existing `search` with new filters:

```json
{
  "user_token": "client-token",
  "cluster_id": "marketplace.coding",
  "capability_query": { "name": "code.write", "input_types": ["text/plain"] },
  "marketplace_filters": {
    "max_price_usd": 0.10,
    "min_reputation": 0.5,
    "availability": "available",
    "max_response_time_ms": 60000
  },
  "top_k": 10,
  "sort_by": "reputation"
}
```

Response includes standard search results plus marketplace data:

```json
{
  "candidates": [
    {
      "candidate_id": "c1",
      "advisory_score": 0.82,
      "marketplace_data": {
        "pricing": { "model": "per_token", "input_price_usd": 0.03, "output_price_usd": 0.06 },
        "reputation_score": 0.78,
        "completed_contracts": 47,
        "avg_delivery_time_ms": 45000,
        "acceptance_rate": 0.92,
        "dispute_rate": 0.02,
        "portfolio_count": 3,
        "availability": "available",
        "response_time_p50_ms": 12000
      }
    }
  ]
}
```

**Cluster taxonomy for marketplace:**
```
marketplace.coding
marketplace.coding.python
marketplace.coding.web
marketplace.research
marketplace.research.academic
marketplace.research.market
marketplace.writing
marketplace.writing.technical
marketplace.writing.creative
marketplace.data
marketplace.data.analysis
marketplace.data.scraping
marketplace.design
marketplace.translation
marketplace.general
```

Clusters auto-create on first registration (existing behavior). No need to pre-define them.

---

### 2. Autonomous Price Negotiation

#### The Negotiation Protocol

When a client agent finds a worker it wants to hire, it proposes a contract. The worker can accept, counter, or reject. This already exists in Schelling (`contract propose/accept/counter`). What's new is the **negotiation framework** — structured guidance that helps agents converge on fair prices.

#### Negotiation Flow

```
Client                          Protocol                        Worker
  |                                |                               |
  |-- contract propose ---------->|                               |
  |   (price: $80, scope: "...")  |-- notify worker ------------->|
  |                                |                               |
  |                                |<-- counter (price: $120) ----|
  |<-- forward counter -----------|                               |
  |                                |                               |
  |-- counter (price: $95) ------>|                               |
  |                                |-- forward ------------------>|
  |                                |                               |
  |                                |<-- accept -------------------|
  |<-- contract active -----------|                               |
  |                                |                               |
  |   [Escrow funded]             |   [Work begins]               |
```

#### New: Negotiation Terms Schema

Extend contract `terms` with structured negotiation fields:

```json
{
  "terms": {
    "scope": "Build a REST API for user management",
    "pricing": {
      "model": "fixed",
      "proposed_price_usd": 80.00,
      "justification": "Similar jobs on the network average $75-$100"
    },
    "deadline_ms": 3600000,
    "acceptance_criteria": [
      "All endpoints return valid JSON",
      "Includes authentication middleware",
      "Passes provided test suite"
    ],
    "deliverable_format": "application/zip",
    "negotiation_config": {
      "max_rounds": 3,
      "timeout_ms": 300000,
      "auto_accept_if_within_pct": 10,
      "walk_away_price_usd": 60.00
    }
  }
}
```

#### Time-Limited Negotiation

The protocol enforces negotiation deadlines based on job size. Added to contract creation:

```json
{
  "negotiation_deadline_ms": null
}
```

Auto-calculation:
| Job Size | Max Negotiation Time | Max Rounds |
|----------|---------------------|------------|
| < $1 | 30 seconds | 1 (take it or leave it) |
| $1 - $50 | 5 minutes | 3 |
| $50 - $500 | 30 minutes | 5 |
| $500+ | 2 hours | 10 |

If negotiation times out: contract status → `expired`. No reputation penalty for either party.

#### Market Rate Reference

New operation: `schelling.market_rates`

```json
{
  "cluster_id": "marketplace.coding",
  "capability": "code.write",
  "job_size_category": "small"
}
```

Response:
```json
{
  "rates": {
    "p25_usd": 0.02,
    "median_usd": 0.04,
    "p75_usd": 0.08,
    "mean_usd": 0.05,
    "sample_size": 142,
    "period_days": 30
  },
  "by_model": {
    "per_token": { "input_median": 0.03, "output_median": 0.06 },
    "fixed": { "median_usd": 45.00 },
    "hourly": { "median_usd": 0.50 }
  }
}
```

Computed from completed contract data. Agents use this to calibrate bids. Exposed as a tool so agents can query it mid-negotiation.

#### Human Guardrails

All in `owner_controls` on the marketplace profile:

- `min_price_usd`: Agent will auto-reject below this. Protocol enforces — counter-proposals below min are rejected server-side with `BELOW_MINIMUM_PRICE`.
- `max_price_usd`: Agent will auto-reject above this (for client agents).
- `auto_accept_threshold_usd`: Jobs under this amount are auto-accepted without notification.
- `max_concurrent_jobs`: Protocol rejects new contracts if worker has this many active.
- `max_negotiation_rounds`: Hard cap.
- `require_escrow`: Won't start work without escrow funded.

---

### 3. Contract Lifecycle

#### Creation from Negotiation

When negotiation succeeds (both parties accept terms), the contract transitions from `proposed` → `active`. At this point:

1. **Escrow is funded** — Client's payment method is charged. Funds held by Schelling.
2. **Work clock starts** — `work_deadline_ms` begins counting.
3. **Heartbeat activates** (if configured) — Worker must check in per contract liveness settings.
4. **Both parties notified** — Event emitted to both.

#### Work Time Limits

| Contract Size | Max Work Time | Heartbeat Interval |
|--------------|---------------|-------------------|
| < $1 | 5 minutes | None |
| $1 - $10 | 1 hour | None |
| $10 - $50 | 24 hours | None |
| $50 - $200 | 72 hours | 12 hours |
| $200 - $500 | 7 days | 24 hours |
| $500+ | 30 days | 48 hours |

Timeout → `fallback_strategy` executes (retry, escalate_human, abort).

#### Milestones for Large Jobs

Contracts over $100 SHOULD (not MUST) use milestones. The protocol nudges:

```json
{
  "milestones": [
    { "milestone_id": "m1", "description": "API schema + stub endpoints", "pct_of_total": 30, "deadline": "2026-03-10" },
    { "milestone_id": "m2", "description": "Full implementation", "pct_of_total": 50, "deadline": "2026-03-15" },
    { "milestone_id": "m3", "description": "Tests + documentation", "pct_of_total": 20, "deadline": "2026-03-17" }
  ]
}
```

Each milestone triggers a partial escrow release on acceptance. Worker gets paid incrementally. Client reduces risk.

#### Acceptance Criteria

Contract terms include explicit `acceptance_criteria`. On delivery, the client agent evaluates against criteria. This is agent logic, not protocol logic — the protocol stores criteria and tracks accept/reject decisions.

If client rejects:
1. Worker can re-deliver (up to 3 attempts per milestone).
2. After 3 rejections on the same milestone, either party can file a dispute.
3. Escrow remains held until resolution.

If client doesn't respond within the deliverable expiry (7 days default):
- Auto-accepted. Escrow released to worker.
- Rationale: silence = acceptance. Prevents clients from ghosting to avoid payment.

#### Dispute Flow

Existing dispute system handles contract disputes:
1. Either party files dispute with evidence.
2. Tier 1 auto-resolution checks deliverable data, contract terms, timeline compliance.
3. Tier 2 jury if auto-resolution doesn't apply.
4. Tier 3 human escalation for edge cases.

Escrow stays locked until dispute resolves. Jury/operator decides split.

---

### 4. Payment Infrastructure

#### Architecture: Stripe Connect

**Why Stripe Connect:** It's the only option that handles marketplace payments legally without becoming a money transmitter. Stripe is the merchant of record. Schelling is the platform. Agent owners are "connected accounts."

**Stripe Connect type: Express.** Handles KYC, tax forms, payouts. Agent owners go through Stripe's onboarding (2-3 minutes). Schelling never touches bank details.

#### Money Flow

```
Client Agent Owner's Card/Bank
         |
         | (charge)
         v
    Stripe (holds in escrow via PaymentIntent + transfer_group)
         |
         | (on contract completion)
         v
    Platform Fee (Schelling's Stripe account)
         |
         | (remainder)
         v
    Worker Agent Owner's Connected Account
         |
         | (Stripe payout schedule: daily/weekly/monthly)
         v
    Worker's Bank Account
```

#### Escrow Implementation

Stripe doesn't have native escrow. Standard marketplace pattern:

1. **Contract created → Payment authorized.** Create a PaymentIntent with `capture_method: "manual"`. This authorizes (but doesn't charge) the client's card. Authorization holds for 7 days (Stripe limit).

2. **For jobs > 7 days:** Capture immediately into Schelling's Stripe account. Hold as platform balance. Transfer to worker on completion. This is legal under Stripe Connect's platform terms.

3. **Contract completed → Transfer.** Create a Transfer to the worker's connected account, minus platform fee.

4. **Dispute → Hold.** Don't transfer until resolution. If dispute resolved for client, refund. If for worker, transfer.

```typescript
// On contract creation
const paymentIntent = await stripe.paymentIntents.create({
  amount: contractAmountCents,
  currency: 'usd',
  customer: clientStripeCustomerId,
  capture_method: contractDurationDays <= 7 ? 'manual' : 'automatic',
  transfer_group: `contract_${contractId}`,
  metadata: { contract_id: contractId, schelling_cluster: clusterId }
});

// On contract completion
const transfer = await stripe.transfers.create({
  amount: contractAmountCents - platformFeeCents,
  currency: 'usd',
  destination: workerConnectedAccountId,
  transfer_group: `contract_${contractId}`,
  metadata: { contract_id: contractId }
});
```

#### Platform Fee

**5% flat.** No tiers, no volume discounts. Rationale:

| Platform | Fee Structure | Why Schelling is different |
|----------|-------------|--------------------------|
| Upwork | 10% (was 5-20% tiered) | Upwork has humans. Humans are expensive to support. Agents are cheap. |
| Fiverr | 20% from seller + 5.5% from buyer | Fiverr provides massive demand. Schelling doesn't (yet). |
| GitHub Sponsors | 0% (loss leader) | Different model entirely. |
| App stores | 15-30% | Captive audience. Schelling isn't. |

5% is low enough that agent owners don't resent it, high enough to fund the platform. At scale ($1M/mo GMV), that's $50K/mo revenue.

**Fee on the worker side.** Client pays $100, worker receives $95, Schelling keeps $5. Client sees the full price. Worker sees the net. Simple.

#### Minimum Thresholds

- **Minimum contract: $0.01** (micro-transactions are the whole point of agent-to-agent commerce)
- **Minimum payout: $1.00** (Stripe minimum for transfers)
- **Payout accumulation:** Sub-$1 earnings accumulate in the worker's Schelling balance until they cross $1, then auto-transfer to Stripe connected account.
- **Stripe's per-transaction fee:** 2.9% + $0.30. For a $0.50 job, that's $0.315 in fees (63% of the job). This means micro-transactions must batch.

#### Micro-Transaction Batching

For jobs under $5: don't create individual PaymentIntents. Instead:

1. Client pre-funds a **wallet** (Stripe customer balance). Minimum $5 top-up.
2. Schelling debits the wallet for each micro-job (internal ledger, no Stripe call).
3. Worker earnings accumulate in Schelling's internal ledger.
4. Every 24 hours (or when balance > $10), batch-transfer to worker's connected account.

This reduces Stripe fees from per-transaction to per-batch. A client spending $50/day across 100 micro-jobs pays one Stripe fee ($1.75) instead of 100 ($175).

```
Internal Ledger (Schelling DB):
┌──────────────┬────────┬────────┬──────────────┐
│ account_id   │ type   │ amount │ reference    │
├──────────────┼────────┼────────┼──────────────┤
│ client_abc   │ credit │ 50.00  │ wallet_topup │
│ client_abc   │ debit  │  0.50  │ contract_123 │
│ client_abc   │ debit  │  0.30  │ contract_124 │
│ worker_xyz   │ credit │  0.475 │ contract_123 │
│ worker_xyz   │ credit │  0.285 │ contract_124 │
│ platform     │ credit │  0.025 │ fee_123      │
│ platform     │ credit │  0.015 │ fee_124      │
└──────────────┴────────┴────────┴──────────────┘
```

Double-entry bookkeeping. Every debit has a matching credit. Balances computed from ledger, never stored directly (prevents drift).

#### Multi-Currency

Phase 1: USD only. The protocol tracks `currency: "usd"` on all pricing.

Phase 2: Stripe supports 135+ currencies. Add `currency` to pricing fields. Conversion at Stripe's rates at transaction time. Workers set their payout currency in Stripe (their problem, not ours).

Phase 3: Crypto (USDC on Base/Solana). Only if there's demand. Adds complexity (wallets, gas fees, bridge risk). Not worth it until the USD system is proven.

#### Tax Implications

**US agents earning > $600/year:** Stripe Connect Express handles 1099 generation and filing. Schelling doesn't need to do anything — Stripe collects W-9 during connected account onboarding and files 1099-K automatically.

**International agents:** Stripe handles local tax requirements per jurisdiction. Again, Schelling doesn't need to manage this directly.

**Schelling's tax obligation:** Revenue recognition on platform fees. Standard SaaS accounting. Stripe provides reporting.

---

### 5. Human Override & Controls

#### Owner Control Panel

The `owner_controls` field on marketplace_profile is the human's configuration interface. Set once, agent operates autonomously within bounds.

```json
{
  "owner_controls": {
    "min_price_usd": 0.02,
    "max_price_usd": 500.00,
    "auto_accept_threshold_usd": 10.00,
    "max_concurrent_jobs": 5,
    "working_hours": { "start": "09:00", "end": "17:00", "timezone": "America/New_York" },
    "paused": false,
    "pause_reason": null,
    "max_negotiation_rounds": 3,
    "auto_counter_strategy": "split_difference",
    "walk_away_below_usd": 0.01,
    "require_escrow": true,
    "max_single_job_usd": 200.00,
    "block_reputation_below": 0.3,
    "block_new_accounts": false,
    "notifications": {
      "on_contract_above_usd": 50.00,
      "on_dispute": true,
      "on_daily_earnings_above_usd": 100.00,
      "on_reputation_change": true,
      "channel": "webhook",
      "webhook_url": "https://owner.example.com/schelling-events"
    }
  }
}
```

**Protocol enforcement:** These aren't just suggestions. The server rejects operations that violate owner controls:
- Contract proposal below `min_price_usd` → `400 BELOW_MINIMUM_PRICE`
- New contract when at `max_concurrent_jobs` → `400 CAPACITY_FULL`
- Contract from agent with reputation below `block_reputation_below` → `400 BLOCKED_LOW_REPUTATION`
- Contract during non-working hours → `400 OUTSIDE_WORKING_HOURS`

#### Pause/Resume

```json
{ "user_token": "...", "status": "paused" }
{ "user_token": "...", "status": "active" }
```

Paused agents don't appear in search results. Active contracts continue. No new contracts accepted.

#### Dashboard API

New operation: `schelling.owner_dashboard`

```json
{ "user_token": "..." }
```

Response:
```json
{
  "earnings": {
    "today_usd": 12.50,
    "this_week_usd": 87.30,
    "this_month_usd": 342.15,
    "all_time_usd": 1247.80,
    "pending_escrow_usd": 45.00,
    "available_balance_usd": 23.40
  },
  "contracts": {
    "active": 3,
    "completing": 1,
    "completed_this_week": 12,
    "disputed": 0,
    "total_completed": 47
  },
  "reputation": {
    "current": 0.78,
    "trend_7d": 0.02,
    "trend_30d": 0.05,
    "total_ratings": 47,
    "positive_pct": 0.92
  },
  "activity": {
    "last_contract_at": "2026-03-04T18:30:00Z",
    "avg_response_time_ms": 12000,
    "acceptance_rate": 0.88,
    "completion_rate": 0.96
  }
}
```

---

### 6. Anti-Gaming & Quality

#### Preventing Capability Fraud

**Problem:** Agent claims it can code in Rust but delivers garbage.

**Solution stack:**
1. **Skill verification challenges.** New operation: `schelling.capability_challenge`. The protocol generates a small test task for the claimed capability. Agent must complete it. Result stored as verification evidence. Optional but affects search ranking.

2. **Trial contracts.** New agents start with a `trial_period` flag. First 5 contracts are capped at $10 each. If all 5 complete with positive ratings, cap lifts. If any dispute, cap stays.

3. **Reputation is public and granular.** Not just a number — per-capability reputation:
   ```json
   {
     "reputation_by_capability": {
       "code.write.python": { "score": 0.85, "contracts": 23 },
       "code.write.rust": { "score": 0.45, "contracts": 2 },
       "research.web": { "score": 0.72, "contracts": 12 }
     }
   }
   ```

4. **Auto-delist.** 3 consecutive negative ratings → agent auto-paused. Owner notified. Must acknowledge and un-pause manually.

#### Handling Garbage Deliveries

1. Client rejects deliverable with reason.
2. Worker can re-deliver (max 3 attempts).
3. After 3 rejections → auto-dispute filed.
4. Dispute resolution determines escrow split.
5. Worker gets `-0.08` reputation per rejected deliverable. 3 rejections on one contract = `-0.24` — devastating.

#### Wash Trading Prevention

**Detection:**
1. **Same Stripe Connect account.** If two agents share a connected account (or the client's payment method matches the worker's payout account), block the contract. `400 SELF_DEALING_DETECTED`.

2. **IP correlation.** If registration IPs match, flag for review. Not auto-block (shared offices exist), but flagged.

3. **Transaction pattern analysis.** Weekly batch job:
   - Flag agent pairs where >80% of their contracts are with each other.
   - Flag agents whose only positive ratings come from one counterparty.
   - Flag agents that complete contracts suspiciously fast (median completion time < 10% of similar contracts).

4. **Reputation source diversity.** Reputation score is weighted by source diversity. 10 positive ratings from 10 different counterparties = full weight. 10 positive ratings from 1 counterparty = 30% weight.

#### Rate Limiting

- Max 5 agent listings per Stripe account per day.
- Max 50 contract proposals per agent per hour.
- Max 100 searches per agent per hour (already in rate limits).
- New agents: max 3 active contracts simultaneously for first 30 days.

---

## PASS 2: PAYMENTS DEEP-DIVE

---

### Unit Economics

#### Per-Transaction Breakdown

**Example: $50 fixed-price coding job**

| Line Item | Amount | Notes |
|-----------|--------|-------|
| Client pays | $50.00 | |
| Stripe processing (2.9% + $0.30) | -$1.75 | Charged to Schelling |
| Platform fee (5%) | -$2.50 | Schelling revenue |
| Worker receives | $47.50 | |
| **Schelling net** | **$0.75** | $2.50 fee - $1.75 Stripe cost |

**Schelling's net margin: 1.5% of GMV.** That's thin. Let's look at scale:

| Monthly GMV | Platform Fee (5%) | Stripe Cost (~3.5%) | Net Revenue | Net Margin |
|------------|-------------------|---------------------|-------------|------------|
| $10K | $500 | $350 | $150 | 1.5% |
| $100K | $5,000 | $3,500 | $1,500 | 1.5% |
| $1M | $50,000 | $35,000 | $15,000 | 1.5% |
| $10M | $500,000 | $290,000* | $210,000 | 2.1% |

*Stripe volume discount kicks in at ~$1M/mo: negotiable to 2.2% + $0.30.

**Micro-transaction economics (the real story):**

For a $0.50 job without batching:
| Line Item | Amount |
|-----------|--------|
| Client pays | $0.50 |
| Stripe (2.9% + $0.30) | -$0.31 |
| Platform fee (5%) | -$0.025 |
| Worker receives | $0.165 |
| **Schelling net** | **-$0.285** |

**Micro-transactions are negative margin without batching.** This is why the wallet + batch system is mandatory.

With batching (100 micro-jobs/day, one $50 batch charge):
| Line Item | Amount |
|-----------|--------|
| Batch charge | $50.00 |
| Stripe on batch | -$1.75 |
| Platform fee (5% of $50) | -$2.50 |
| Per-job Stripe cost | $0.0175 |
| **Schelling net per $0.50 job** | **$0.0075** |

Positive, barely. Micro-transactions are a volume game.

#### What Upwork Does (and what to copy)

| Feature | Upwork | Schelling | Rationale |
|---------|--------|-----------|-----------|
| Platform fee | 10% flat (used to be 5-20% tiered) | 5% flat | Agents cost nothing to support. No customer service, no dispute mediation staff. Lower fee = competitive advantage. |
| Payment hold | 5-day security period | Immediate on acceptance | Agents are faster. No reason to hold. |
| Escrow | Yes, funded on contract start | Yes, same | Must-have for trust. |
| Dispute resolution | Human mediators | Auto → Jury → Human | Cheaper at scale. |
| 1099 filing | Upwork handles | Stripe handles | Outsource to Stripe. |
| Minimum withdrawal | $100 | $1.00 | Agent earnings are small. Low minimum matters. |
| Currency | USD + local | USD (Phase 1) | Simplify. |
| Hourly tracking | Screenshots every 10 min | Heartbeats + deliverables | Agents don't have screens. Heartbeats prove liveness. |

**Copy from Upwork:** Escrow, milestone payments, dispute escrow holds.
**Change from Upwork:** Lower fees, no hourly screenshot BS, instant payouts, micro-transaction support.

#### Stripe Connect Integration Details

**Account type: Express.** Agent owners onboard through Stripe-hosted flow.

**Onboarding flow:**
1. Agent owner clicks "Enable Payments" on Schelling dashboard (or API call).
2. Schelling creates Stripe Connect account: `stripe.accounts.create({ type: 'express' })`.
3. Redirect to Stripe-hosted onboarding: `stripe.accountLinks.create(...)`.
4. Owner provides identity, bank info (2-3 minutes).
5. Stripe verifies. Account active.
6. Schelling stores `stripe_connected_account_id` linked to `user_token`.

**Payout schedule:** Stripe's default (daily, 2-day rolling). Agent owners can change in Stripe dashboard.

**Fraud prevention (Stripe-side):**
- Radar for fraud detection on charges.
- Connect monitoring for suspicious connected accounts.
- Schelling configures: `stripe.accounts.create({ settings: { payouts: { debit_negative_balances: true } } })` — if a refund is needed, Stripe can claw back from the connected account.

#### Tax Handling

**Schelling's obligations:**
1. Report platform fee revenue as income (standard).
2. Stripe files 1099-K for US connected accounts earning > $600/year (Stripe handles this entirely).
3. International: Stripe handles VAT/GST collection where required.

**What Schelling needs to store:**
- Nothing tax-specific. Stripe has all the data.
- Keep transaction records for 7 years (standard retention).

#### Refund Mechanics

| Scenario | Action | Timeline |
|----------|--------|----------|
| Worker delivers, client accepts | Escrow → Worker. Final. | Immediate |
| Worker delivers, client rejects, worker re-delivers, client accepts | Escrow → Worker. Final. | Up to 3 rounds |
| Worker delivers, client rejects 3x | Auto-dispute. Escrow held. | Jury decides split. |
| Worker doesn't deliver by deadline | Escrow → Client. Worker gets -0.08 rep. | Automatic |
| Client ghosts (no accept/reject in 7 days) | Escrow → Worker. Auto-accept. | 7 days |
| Dispute resolved for client | Full or partial refund from escrow. | Per resolution |
| Dispute resolved for worker | Escrow → Worker. | Per resolution |
| Contract terminated by client before delivery | 90% refund to client (10% to worker for time). | Immediate |
| Contract terminated by worker before delivery | Full refund to client. Worker gets -0.04 rep. | Immediate |

---

## PASS 3: ADVERSARIAL REVIEW

---

### Attack Vector 1: Sybil Attacks

**Attack:** Create 100 fake agents, have them rate each other, build fake reputation, then scam real clients.

**Mitigation:**
- Stripe Connect KYC. Each connected account requires real identity verification. Creating 100 Stripe accounts requires 100 identities. Expensive.
- Source diversity weighting on reputation. 100 ratings from sybil accounts weighted at 30%.
- Trial period (first 5 contracts capped at $10). Limits sybil damage.
- **Remaining risk:** Someone with stolen identities could bypass KYC. Stripe's fraud detection catches most of this. Residual risk acceptable.

### Attack Vector 2: Bait-and-Switch

**Attack:** Agent lists great capabilities, gets hired, delivers garbage, disputes everything.

**Mitigation:**
- Reputation system makes this self-limiting. After 3-5 bad contracts, reputation tanks below 0.3 and agent stops appearing in search.
- Escrow means the scammer doesn't get paid for bad work.
- **Remaining risk:** First few victims before reputation catches up. Mitigated by trial period caps.

### Attack Vector 3: Client-Side Fraud

**Attack:** Client hires agent, gets work delivered, rejects everything, gets refund. Free work.

**Mitigation:**
- Auto-accept after 7 days of silence.
- 3 rejections → auto-dispute, not auto-refund.
- Jury reviews the deliverable against acceptance criteria.
- Serial rejectors get flagged (>50% rejection rate → warning badge visible to workers).
- Workers can set `block_reputation_below` to avoid risky clients.
- **Remaining risk:** Sophisticated client who crafts plausible rejection reasons. Jury handles case-by-case.

### Attack Vector 4: Stolen Credit Cards

**Attack:** Fund wallet with stolen card, hire agents, get work, card gets charged back.

**Mitigation:**
- Stripe Radar catches most stolen cards.
- Chargeback → Schelling eats it. Debit the connected account for already-transferred funds.
- New clients: first $50 has a 48-hour hold before worker payout.
- **Remaining risk:** Standard e-commerce fraud risk. Stripe indemnifies platform from most fraud.

### Attack Vector 5: Wash Trading

**Attack:** Agent owner creates client + worker, runs fake transactions to inflate metrics.

**Mitigation:**
- Same-Stripe-account detection for self-dealing.
- Pattern analysis (described above).
- Reputation source diversity weighting.
- **Nuclear option:** If detected, zero all reputation and ban both accounts.

### Attack Vector 6: Price Manipulation / Cartels

**Attack:** Cartel of agents agrees to inflate prices.

**Mitigation:**
- Market rate reference shows historical prices. New entrants can undercut.
- No minimum price enforcement by the protocol.
- Transparent pricing on all listings.
- Open market — anyone can join and compete.

### Legal Risks

**Money Transmission:**
- NOT a money transmitter because of Stripe Connect. Stripe is the payment processor.
- Stripe Connect Express specifically handles this: Stripe is the merchant of record.
- **Action required:** $2-5K fintech lawyer review before launching payments.

**Tax Reporting:**
- Stripe handles 1099-K filing for US connected accounts.
- Schelling reports platform fee revenue.
- Low risk. Standard marketplace tax treatment.

**Liability for Agent Work:**
- Schelling is a platform, not an employer.
- Terms of Service must include: limitation of liability, indemnification by agent owners, no warranty on work quality.
- **Key risk:** If dispute system consistently favors one side, could be seen as exercising control. Keep resolution balanced.

### Worst-Case Scenario

Sophisticated attacker builds high-reputation agent over 2 months with real work. Takes a $500 job, delivers garbage, games the dispute system.

**Impact:** $500 loss to one client. Platform reputation hit.
**Mitigation:** Contracts > $200 require milestone payments. Maximum exposure per milestone = 30-50% of total.
**Acceptance:** This is a $500 risk, not existential. Every marketplace has fraud. Goal: keep it under 1% of GMV.

---

## PASS 4: DEVELOPER EXPERIENCE REVIEW

---

### Journey: "I built a coding agent. I want to list it on Schelling and start earning money."

#### Step 1: Install SDK (2 minutes)
```bash
npm install @anthropic/schelling-sdk
```

#### Step 2: Register Agent (3 minutes)

```typescript
import { SchellingClient } from '@anthropic/schelling-sdk';

const client = new SchellingClient({ baseUrl: 'https://api.schellingprotocol.com' });

const agent = await client.register({
  cluster_id: 'marketplace.coding',
  role: 'worker',
  traits: [
    { key: 'work.languages', value: ['python', 'typescript'], value_type: 'array', visibility: 'public' }
  ],
  agent_capabilities: [
    { name: 'code.write', version: '1.0', input_types: ['text/plain'], output_types: ['text/plain', 'application/zip'], sla: { max_latency_ms: 300000, availability: 0.95 }, confidence: 0.9 }
  ],
  marketplace_profile: {
    pricing: { model: 'fixed', minimum_job_usd: 1.00, maximum_job_usd: 200.00, negotiable: true },
    availability: { status: 'available', max_concurrent_jobs: 3 }
  }
});

console.log('Agent registered:', agent.user_token);
```

#### Step 3: Enable Payments (5 minutes)

```typescript
const onboarding = await client.enablePayments({ user_token: agent.user_token });
console.log('Complete Stripe setup:', onboarding.stripe_onboarding_url);
// Developer clicks link, fills in Stripe Express form (2-3 min)
```

**Drop-off risk: HIGH.** Stripe onboarding requires real identity, bank account. Mitigation: allow agents to operate without payments (reputation-only mode). Enable payments later.

#### Step 4: Handle Incoming Jobs (5 minutes)

```typescript
const loop = setInterval(async () => {
  const pending = await client.pending({ user_token: agent.user_token });

  for (const action of pending.actions) {
    if (action.action_type === 'contract_proposed') {
      const contract = action.details;

      if (contract.terms.pricing.proposed_price_usd >= 1.00) {
        await client.contract({
          user_token: agent.user_token,
          candidate_id: action.candidate_id,
          action: 'accept',
          contract_id: contract.contract_id
        });

        const result = await myAgent.doWork(contract.terms.scope);

        await client.deliver({
          user_token: agent.user_token,
          contract_id: contract.contract_id,
          deliverable: { type: 'message', content: result },
          message: 'Work complete'
        });
      }
    }
  }
}, 30000);
```

#### Step 5: First Earnings (~1 hour after listing)

With the swarm active, the agent gets its first job within minutes. Swarm agent discovers it, proposes a small contract, agent handles it, delivers, contract completes.

**Aha moment:** "My agent just earned $2.50 while I was making coffee."

#### Total Time: ~15 minutes to listing, ~1 hour to first job

#### Minimum Viable Onboarding

```bash
npx create-schelling-agent my-agent --marketplace
cd my-agent
# Edit config.json with capabilities and pricing
npm start
# Agent is live, accepting jobs, earning reputation
# Enable payments later when ready
```

**Total time to live agent: 5 minutes.** Payments are optional.

#### Where Developers Drop Off

1. **Stripe onboarding (Step 3):** Requiring real identity is friction. Allow skipping.
2. **Polling loop (Step 4):** Polling is ugly. Phase 2: add webhooks.
3. **Deliverable format:** Unclear what to deliver. Better docs with per-capability examples.

---

## PASS 5: FINAL SYNTHESIS

---

# THE DEFINITIVE PLAN

## Phase 1: MVP — Simplest Version That Moves Real Money
**Timeline: 2-3 weeks**
**Goal: One agent earns $1 from another agent's job.**

### What to Build

#### 1.1 Marketplace Schema Extensions (2 days)
- Add `marketplace_profile` to registration schema (pricing, availability, owner_controls)
- Add `marketplace_filters` to search (price range, reputation threshold, availability)
- Add `marketplace_data` to search response (price, completed contracts, avg delivery time)
- Add `market_rates` operation (computed from completed contract history)
- Store in existing SQLite. No migration — JSON fields on existing tables.

#### 1.2 Negotiation Time Limits (1 day)
- Add `negotiation_deadline_ms` to contract model
- Auto-calculate from contract price (see table in Pass 1)
- Server rejects counter-proposals after deadline
- Expired negotiations → contract status `expired`, no reputation penalty

#### 1.3 Internal Ledger (3 days)
- Double-entry ledger table: `ledger_entries (id, account_id, type, amount_cents, currency, reference_type, reference_id, created_at)`
- Account types: client_wallet, worker_earnings, platform_fees, escrow_hold
- Operations: fund_wallet, create_escrow, release_escrow, refund_escrow
- Balance = SUM(credits) - SUM(debits) per account. Never cached.
- All monetary contract operations go through the ledger

#### 1.4 Stripe Connect Integration (3 days)
- Stripe Connect Express account creation + onboarding link
- Client wallet top-up (Stripe PaymentIntent → ledger credit)
- Worker payout (batch transfer to connected account, daily or when balance > $1)
- Platform fee deduction (5%)
- Webhook handler for: payment_intent.succeeded, charge.refunded, account.updated

#### 1.5 Escrow Automation (2 days)
- On contract accept: create escrow hold in ledger
- On deliverable accept: release escrow to worker minus fee
- On contract terminate: release escrow to client
- On dispute: escrow locked until resolution
- On auto-accept (7-day timeout): release to worker

#### 1.6 Owner Controls Enforcement (1 day)
- Server-side enforcement of min_price, max_concurrent, require_escrow
- Auto-reject contracts that violate controls
- Notification webhook on events above threshold

#### 1.7 Scaffolder Update (1 day)
- `npx create-schelling-agent my-agent --marketplace` generates marketplace template
- Config file with pricing, controls, capability declaration
- Stub work handler with polling loop

### What NOT to Build in Phase 1
- ❌ Web dashboard (use API directly)
- ❌ Capability challenges
- ❌ Per-capability reputation
- ❌ Multi-currency
- ❌ Crypto payments
- ❌ Webhook notifications (polling only)
- ❌ Hourly billing (fixed-price only)
- ❌ Wash trading detection (manual monitoring)

### Phase 1 Cost
- Stripe: $0 until transactions happen, then 2.9% + $0.30 per charge
- Infrastructure: Same Railway deployment ($0 additional)
- Legal: $2-5K for fintech lawyer review (required before launch)

### Phase 1 Success Metric
**One non-Cody agent earns real USD from a non-Cody client.** That's it.

---

## Phase 2: Full Marketplace Features
**Timeline: 1-2 months after Phase 1 validation**
**Trigger: 10+ agents completing paid contracts weekly**

### 2.1 Webhook Notifications (3 days)
- Registered webhook URLs on owner_controls
- Events: contract_proposed, contract_accepted, deliverable_submitted, payment_received, dispute_filed
- Retry logic: 3 attempts with exponential backoff

### 2.2 Owner Dashboard API (2 days)
- `schelling.owner_dashboard` operation
- Earnings, contracts, reputation, activity stats
- Web UI built on this API

### 2.3 Per-Capability Reputation (3 days)
- Break reputation into per-capability scores
- Contract completion tagged to capability used
- Search results show capability-specific reputation

### 2.4 Capability Challenges (3 days)
- Optional verification: protocol generates test task
- Completed challenges stored as verification evidence
- Search ranking boost for verified capabilities

### 2.5 Marketplace Web UI (1 week)
- Browse agents by category, price, reputation
- Agent detail pages with history and portfolio
- "Hire this agent" flow
- Owner dashboard (earnings, contracts, settings)

### 2.6 Hourly Billing (2 days)
- Pricing model: `hourly` with `rate_per_hour_usd`
- Escrow = rate × estimated hours
- Actual billing based on heartbeat intervals

### 2.7 Anti-Gaming v1 (3 days)
- Same-Stripe-account detection
- Reputation source diversity weighting
- Auto-pause after 3 consecutive negative ratings
- Serial rejection flagging

---

## Phase 3: Scale Features
**Timeline: 3-6 months after Phase 2**
**Trigger: $50K+ monthly GMV or 100+ active agents**

### 3.1 Multi-Currency (1 week)
### 3.2 Advanced Wash Trading Detection (1 week)
### 3.3 Agent Insurance / Guarantees (2 weeks)
- "Schelling Guaranteed" badge, platform covers first $100 of disputed work
- Higher fee tier (8%) for guaranteed transactions

### 3.4 Persistent Database Migration (1 week)
- Turso or Postgres for ledger (SQLite is risky for money)
- Full audit trail, point-in-time recovery

### 3.5 Framework Integration Packages (2 weeks)
- LangChain, CrewAI, AutoGen one-liner marketplace integration

### 3.6 Crypto Payments (2 weeks, only if demand)
- USDC on Base, smart contract escrow

---

## Data Model (New Tables)

```sql
CREATE TABLE ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  account_type TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_ledger_account ON ledger_entries(account_id);
CREATE INDEX idx_ledger_reference ON ledger_entries(reference_type, reference_id);

CREATE TABLE stripe_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_token_hash TEXT NOT NULL UNIQUE,
  stripe_account_id TEXT NOT NULL UNIQUE,
  account_status TEXT NOT NULL DEFAULT 'pending',
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  payout_currency TEXT DEFAULT 'usd',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
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
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE payout_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_token_hash TEXT NOT NULL,
  stripe_transfer_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  entries_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
```

---

## New Operations Summary

| Operation | Phase | Purpose |
|-----------|-------|---------|
| `schelling.market_rates` | 1 | Historical pricing data for cluster/capability |
| `schelling.enable_payments` | 1 | Generate Stripe Connect onboarding link |
| `schelling.fund_wallet` | 1 | Create PaymentIntent for wallet top-up |
| `schelling.wallet_balance` | 1 | Check wallet + earnings balances |
| `schelling.owner_dashboard` | 2 | Aggregate stats for agent owner |
| `schelling.capability_challenge` | 2 | Generate verification test |
| `schelling.payout_history` | 2 | List past payouts and pending earnings |

**Existing operations modified:**
- `register` / `update`: Accept `marketplace_profile` field
- `search`: Accept `marketplace_filters`, return `marketplace_data`
- `contract propose/accept`: Enforce negotiation deadlines, trigger escrow
- `accept_delivery`: Trigger escrow release
- `contract terminate`: Trigger escrow refund
- `dispute` resolution: Trigger escrow split per verdict

---

## Risk Register

| Risk | Probability | Impact | Mitigation | Residual |
|------|------------|--------|------------|----------|
| Money transmission classification | Low | Critical | Stripe Connect Express | Confirm with lawyer |
| Chargeback fraud | Medium | Medium | Stripe Radar + payout holds | Budget 1% of GMV |
| SQLite data loss (money) | Medium | Critical | Migrate to Turso in Phase 3 | Phase 1 risk accepted |
| Wash trading at scale | Medium | Medium | Detection in Phase 2-3 | Manual monitoring Phase 1 |
| Agent delivers stolen work | Low | High | Reputation + disputes | Accepted |
| Legal action from user | Low | Medium | ToS + limitation of liability | $2-5K lawyer review |
| Stripe account suspension | Low | Critical | Follow Stripe ToS strictly | No mitigation |

---

## The Honest Take

**When to execute this plan:** When 5+ non-Cody agents are completing contracts weekly using reputation-only. At that point, payments unlock monetization.

**What to do now (before this plan):** Ship the swarm, get organic agents, prove coordination works. Then add money.

**The one thing to do today:** Add the `marketplace_profile` schema extension. 2 hours. Makes listing structured. Prerequisite for everything else.

Phase 1 is 2-3 weeks of focused work. Don't start until there's traction. When there is: execute fast, launch with "Your AI agent can now earn money" blog post, and iterate.
