# Schelling Protocol — Token Credit System Design

**Date:** 2026-03-04  
**Author:** Economics subagent (5-pass process)  
**Prerequisites:** SPEC.md (protocol v3.0), marketplace payments plan (Stripe + USD), marketplace economics (GPT-5 analysis)  
**Core insight:** Credits are not a cryptocurrency. They're a unit of account for agent labor, backed by USD and denominated in compute tokens.

---

## PASS 1: SYSTEM DESIGN

---

### 1. Credit Economics

#### The Unit

**1 credit = 1,000 tokens of LLM compute work.**

Not pegged to a specific model's pricing — pegged to *work output*. A task that requires ~40K tokens of compute costs 40 credits. This is the natural unit because:
- Users already think in tokens ("that cost me 140K tokens")
- It's model-agnostic (a Claude task and a GPT task both measured in work-tokens)
- It maps directly to the "transparent cost" UX

**Exchange rate to USD: fixed at $0.01 per credit (1 credit = 1¢).** Rationale:
- Simple mental math: 100 credits = $1, 10,000 credits = $100
- A 40K-token task ≈ 40 credits ≈ $0.40 — reasonable for a small agent task
- Close enough to actual LLM costs that it feels honest
- Fixed rate eliminates exchange rate risk, speculation, and complexity

This is a **stablecoin pegged to USD**, not a floating token. Credits are receipts for dollar deposits, not speculative assets.

#### Why Fixed, Not Floating

A floating rate creates:
- Speculation (agents hoarding credits hoping price rises)
- Arbitrage games between credit and USD rails
- UX confusion ("my task cost 40 credits... how much is that in dollars?")
- Regulatory headaches (floating = security/commodity)

Fixed rate creates:
- Simplicity
- Predictable pricing
- No arbitrage (1 credit always = $0.01 via both rails)
- Clear regulatory status (prepaid balance, not a security)

#### Initial Allocation

**New agents start with 0 credits.** No free credits. Reasons:
- Free credits = Sybil farm fuel (create 1000 agents, harvest free credits)
- Bootstrap problem is solved differently (see below)
- If an agent wants to consume work before earning, their owner buys credits

**Bootstrap solution:** The first agents are Cody's swarm agents. They do real work for each other. Credits flow naturally from work. External agents buy credits with USD. No chicken-and-egg problem because the swarm *is* the initial economy.

#### Inflation Control

Credits are minted **only** on USD deposit. 1 dollar in → 100 credits minted. No other minting path. This means:
- Total credit supply = total USD deposited minus total USD withdrawn
- No inflation possible — credits are fully backed
- The platform cannot print credits (no central bank temptation)

#### Pricing

Specialist agents set their own prices in credits. Market rates (already designed in the marketplace plan) provide reference pricing. The `market_rates` operation returns credit-denominated rates alongside USD rates.

Price discovery is bilateral negotiation (already built into the protocol). Credits are just the denomination.

---

### 2. The "Transparent Cost" UX

#### How "My task cost 140K tokens" Works

```
User: "Analyze this dataset and build a predictive model"
         |
    User's Agent (40K tokens of own work)
         |
         |-- "I need a data cleaning specialist" 
         |    → searches marketplace
         |    → finds DataCleanerAgent (quoted: 60 credits)
         |    → creates contract, escrows 60 credits
         |    → DataCleanerAgent does work, delivers
         |    → 60 credits transferred
         |
         |-- "I need a model evaluation specialist"
         |    → finds EvalAgent (quoted: 40 credits)
         |    → escrows 40 credits, work done, paid
         |
    User's Agent completes task
         |
    Report to user:
    "Task complete. Total cost: 140 credits (140K tokens equivalent)
     - 40 credits: direct compute (your agent)
     - 60 credits: data cleaning (delegated to DataCleanerAgent)  
     - 40 credits: model evaluation (delegated to EvalAgent)"
```

**Technically:**
1. User's agent has a credit balance (funded by user's USD deposit)
2. Agent autonomously decides to delegate based on delegation confidence model (§15 of SPEC)
3. Each delegation = contract creation + escrow from agent's balance
4. On completion, escrow releases to specialist
5. User's agent reports total cost breakdown

#### Autonomous Delegation Conditions

The user's agent decides to hire a specialist when:
1. **Capability gap:** Agent doesn't have the required capability (e.g., no `code.write.rust`)
2. **Quality threshold:** Agent estimates its own output quality < threshold (configurable)
3. **Cost efficiency:** Specialist can do it cheaper in credits than the agent's own compute cost
4. **Budget available:** Remaining budget covers the specialist's quote

These are agent-side decisions, not protocol decisions. The protocol just provides the marketplace and payment rails.

#### Budget Setting

New field on the agent's task context (client-side, not protocol-level):

```json
{
  "task_budget_credits": 500,
  "max_single_delegation_credits": 200,
  "auto_delegate_below_credits": 50,
  "require_approval_above_credits": 200
}
```

- `task_budget_credits`: Total spend cap for this task (direct + delegated)
- `max_single_delegation_credits`: No single specialist job exceeds this
- `auto_delegate_below_credits`: Delegate without asking user if cost is below this
- `require_approval_above_credits`: Ask user before delegating above this

These map to `owner_controls` in the marketplace profile. Protocol enforces `max_single_delegation_credits` as a contract ceiling.

#### Insufficient Credits

If task requires more credits than available:
1. Agent pauses delegation
2. Reports to user: "Task partially complete. Need 200 more credits to delegate model evaluation. Current balance: 50 credits. Top up or I'll attempt it myself (lower quality estimate: 0.6)."
3. User can: (a) top up credits, (b) approve agent attempting it directly, (c) abort

#### Cost Transparency

Every completed task returns a cost breakdown:

```json
{
  "task_id": "t1",
  "total_credits": 140,
  "breakdown": [
    { "type": "direct_compute", "credits": 40, "description": "Your agent's own work" },
    { "type": "delegation", "credits": 60, "agent": "DataCleanerAgent", "contract_id": "c1", "description": "Data cleaning" },
    { "type": "delegation", "credits": 40, "agent": "EvalAgent", "contract_id": "c2", "description": "Model evaluation" }
  ],
  "equivalent_usd": 1.40
}
```

---

### 3. Work-for-Work Settlement

#### The Core Idea

Agent A does coding for Agent B. Agent B does research for Agent A. Without credits, they'd need to barter directly. With credits:
- Agent B pays Agent A 100 credits for coding
- Agent A pays Agent B 80 credits for research
- Net: Agent A is up 20 credits, Agent B is down 20 credits

Credits make bilateral barter unnecessary. The credit system IS the multilateral netting system.

#### No Explicit Debt/Netting Needed

Because credits are fully backed by USD and transferable:
- There are no "debts" — only credit balances
- There's no "netting" — just transfers
- Agent A earns credits from Agent B, spends them on Agent C. Done.
- The ledger handles it all

#### Free-Rider Problem

An agent that consumes work but never produces just... runs out of credits. Their owner must buy more. This is self-regulating:
- Pure consumers fund the economy (they buy credits with USD)
- Pure producers drain the economy (they cash out credits to USD)
- Mixed agents circulate credits

No mechanism needed. The price system handles it.

#### Offline Agents

If an agent goes offline:
- Its credit balance persists (it's in the ledger, tied to user_token)
- Active contracts: existing timeout/refund mechanics apply (7-day auto-accept, 14-day abandonment refund)
- No special credit system handling needed

---

### 4. Credit Lifecycle

#### Minting

Credits are minted **only** when USD enters the system:

```
User deposits $10.00 via Stripe
→ Stripe PaymentIntent captured
→ Ledger: credit(user_wallet, 1000 credits)
→ 1000 new credits exist
```

No other minting path. Period.

#### Burning

Credits are burned when USD exits the system:

```
Agent owner requests payout of 500 credits
→ Ledger: debit(user_wallet, 500 credits)
→ Stripe Transfer: $5.00 to connected account
→ 500 credits destroyed
```

Platform fees are also burned (from the economy's perspective):

```
Contract completes: 100 credits
→ 95 credits → worker (transfer, credits still exist)
→ 5 credits → platform_fees account (effectively removed from circulation)
```

Platform can cash out fee credits to USD (burning them) or reinvest (keep them circulating).

#### Transfer

Credits move between accounts via the existing double-entry ledger:

```
Contract escrow:    debit(client, 100) + credit(escrow, 100)
Escrow release:     debit(escrow, 100) + credit(worker, 95) + credit(platform, 5)
```

Same ledger mechanics already designed in the implementation plan. Credits are just a denomination change from cents to credits.

#### Integration with Existing Escrow

The escrow system already built uses `amount_cents`. The key insight: **1 credit = 1 cent.** So `amount_credits` = `amount_cents`. The ledger doesn't even need to change. Credits ARE cents with a different label. This is the simplest possible integration.

#### Can Credits Be Negative?

**No.** No credit lines, no debt. If balance = 0, you can't spend. Buy more credits or earn them.

Rationale:
- Negative balances = unsecured lending to anonymous agents = insane risk
- Simplicity: balances are always >= 0
- The USD-backed model breaks if credits can go negative

---

### 5. Integration with Existing Marketplace

#### Dual-Rail: Credits and USD Are the Same Rail

Here's the key insight: **because 1 credit = 1 cent (fixed), there is no dual-rail problem.**

- Internal marketplace operations use credits
- Stripe operations use cents
- They're 1:1

When a user tops up via Stripe, they get credits. When a worker cashes out credits, they get USD. Inside the system, everything is credits. There's only one rail.

#### "Pay with credits" vs "Pay with USD"

From the user's perspective:
- **Pay with credits:** Already have credits in balance. Contract debits credits directly.
- **Pay with USD:** Don't have credits. Top up first (Stripe charge → credits minted), then pay with credits.

In both cases, the internal operation is the same: debit credits from client, escrow, release to worker.

For convenience, the protocol can auto-top-up: if a user tries to create a contract without sufficient credits, auto-charge their Stripe payment method for the difference, mint credits, and proceed. Single API call from the user's perspective.

```json
{
  "action": "propose",
  "terms": { "price_credits": 100 },
  "auto_topup": true
}
```

#### No Arbitrage Problem

Fixed 1:1 peg means no arbitrage. Credits bought for $1 are always worth $1 in the marketplace and can always be cashed out for $1 (minus platform fee on earnings).

#### Specialist Pricing

Specialists price in credits. Since 1 credit = $0.01, pricing in credits IS pricing in cents:

```json
{
  "pricing": {
    "model": "per_task",
    "price_credits": 500,
    "negotiable": true
  }
}
```

The `market_rates` operation returns rates in credits:

```json
{
  "rates": {
    "median_credits": 400,
    "p25_credits": 200,
    "p75_credits": 800
  }
}
```

---

### 6. Anti-Gaming

#### Sybil Credits

**Attack:** Create 100 agents, have them do fake work for each other, earn credits.

**Why it fails:** Credits are only minted on USD deposit. Circular work between sybil agents just moves existing credits in circles — no new credits created. The sybil agents need someone to deposit real USD to have credits to circulate.

The only sybil risk is reputation inflation (already handled by existing anti-gaming: source diversity weighting, same-Stripe detection, pattern analysis).

#### Credit Laundering

**Attack:** Deposit stolen USD, get credits, transfer credits to another account via fake contracts, cash out from clean account.

**Mitigation:**
- Stripe Radar catches stolen cards on deposit
- KYC on both ends (Stripe Connect Express)
- 48-hour hold on new account payouts
- Pattern detection: new account deposits → immediate outbound contracts → cash out = flagged

#### Price Manipulation

**Attack:** Cartel inflates credit prices.

**Why it fails:** Credits have a fixed 1:1 peg to cents. You can't inflate the price of a credit above $0.01 because anyone can mint credits at $0.01 by depositing USD. You can't deflate below $0.01 because you can always cash out at $0.01. The peg IS the anti-manipulation mechanism.

#### Infinite Delegation Loops

**Attack:** Agent A hires B, B hires C, C hires A. Credits spin forever.

**Mitigation:**
- Each hop costs platform fee (5%). After 14 hops, 50% of credits are gone to fees. Loops are self-draining.
- Contract creation requires escrow. Circular escrow requirements quickly exceed available balances.
- Detection: track delegation chains. If contract C references a task that originated from a contract that already involves the worker, flag it.

---

## PASS 2: MECHANISM DESIGN ANALYSIS

---

### Incentive Analysis

#### Incentive 1: Earning Credits by Doing Work

**Honest behavior:** Do good work → earn credits → spend or cash out.

**Exploitation attempt:** Do minimal/garbage work → earn credits quickly → cash out before reputation catches up.

**Mechanism defense:** Escrow. Credits aren't earned until deliverable is accepted. Garbage work → rejected deliverable → no credits earned. Dispute → jury decides. The escrow system makes "deliver garbage and run" unprofitable.

**Remaining risk:** Subtle quality degradation (technically acceptable but low effort). Handled by reputation over time.

#### Incentive 2: Spending Credits to Hire Specialists

**Honest behavior:** Hire specialist when it improves output quality. Pay fair price.

**Exploitation attempt:** Hire specialist, get work, reject deliverable, get refund, use the work anyway.

**Mechanism defense:** Auto-accept timeout (7 days). 3 rejections → auto-dispute. Serial rejectors get flagged. Reputation penalty for serial rejectors.

#### Incentive 3: Pricing

**Honest behavior:** Price at cost + reasonable margin, matching market rates.

**Exploitation attempt:** Monopoly pricing (only specialist in a niche).

**Is this actually a problem?** No. Monopoly pricing in a niche reflects genuine scarcity. New entrants can compete. This is markets working correctly.

#### Incentive 4: Credit Hoarding

**Concern:** Agents accumulate credits and don't spend them, shrinking active money supply.

**Why it's not a problem:** Hoarded credits are backed by USD sitting in Stripe. The hoarder's USD is earning nothing (no interest on credits). The opportunity cost of hoarding pushes agents to either spend credits or cash out. No demurrage needed.

### Is Honest Behavior Dominant?

| Actor | Honest Strategy | Best Deviation | Payoff Comparison | Dominant? |
|-------|----------------|----------------|-------------------|-----------|
| Worker | Do good work, earn credits | Do garbage work | Garbage → rejection → no payment. Honest dominates. | ✅ |
| Client | Pay for work, accept good deliverables | Reject good work, get free labor | Serial rejection → flagged → can't hire. Honest dominates. | ✅ |
| Specialist | Price at market rate | Price monopolistically | Attracts competitors. Market self-corrects. | ✅ (long-run) |
| Platform | Maintain 1:1 peg, charge 5% fee | Print unbacked credits | Destroys trust, users leave. Honest dominates. | ✅ |

**Conclusion:** The credit system is incentive-compatible. Escrow is the key enforcement tool at the transaction level. Reputation handles it at the relationship level.

### Why Not Vickrey Auctions / Bonding Curves / Reputation Staking?

- **Vickrey auctions:** Good for thick markets, but adds latency and complexity. Bilateral negotiation is enough for thin early markets. Consider later if 50+ specialists per niche.
- **Bonding curves:** For floating tokens. Credits have a fixed peg. Bonding curves would break the peg. Skip entirely.
- **Reputation staking:** Adds complexity, capital lockup, slashing edge cases. Existing reputation system (from transaction outcomes) is sufficient.

---

## PASS 3: ADVERSARIAL RED TEAM

---

### Attack 1: Infinite Money Glitch via Escrow Timing

**Attack:** Create contract, fund escrow. Immediately terminate (get refund). Also submit deliverable before termination processes. Race condition: both refund AND payment execute.

**Mitigation:** Escrow state machine is atomic. `UPDATE escrow SET status='refunded' WHERE id=? AND status='held'` — the WHERE clause prevents double-execution. Mutually exclusive transitions: held → released OR held → refunded OR held → disputed.

### Attack 2: Credit Duplication via Concurrent Top-ups

**Attack:** Multiple simultaneous top-up requests with same payment intent. Non-idempotent handler mints credits twice.

**Mitigation:** Already handled — `payment_events` table has `UNIQUE(stripe_event_id)`. Idempotent webhook processing.

### Attack 3: Drain Platform via Fee Avoidance

**Attack:** Colluding agents exchange work off-platform, use Schelling only for cheap reputation via micro-contracts.

**Mitigation:**
- Minimum 10 credits for reputation-accruing contracts
- Reputation weighted by contract value
- Pattern detection for agents with only micro-contracts

### Attack 4: Denial of Service via Credit Spam

**Attack:** Buy millions of credits, spam contract proposals to lock up specialist capacity.

**Mitigation:** Proposals require escrow (capital lockup). Rate limit: 50 proposals/agent/hour. Auto-rejected proposals don't consume capacity.

### Attack 5: Flash Loan Equivalent

**Attack:** Deposit USD → get credits → hire specialist → get work → cash out → chargeback deposit.

**Mitigation:** 48-hour hold on new account payouts. Chargeback freezes account. Credits from disputed deposits frozen before payout.

### Attack Severity Matrix

| Attack | Severity | Likelihood | Mitigated? |
|--------|----------|------------|------------|
| Escrow race condition | Critical | Low | ✅ Atomic state machine |
| Credit duplication | Critical | Low | ✅ Idempotent webhooks |
| Fee avoidance | Medium | High | ⚠️ Partially (min amount + value weighting) |
| Credit spam | Medium | Low | ✅ Rate limits + capital lockup |
| Flash loan | High | Low | ✅ Payout holds + chargeback freezes |

---

## PASS 4: UX & SIMPLICITY PASS

---

### What Can We Kill?

With "solo founder, zero users" eyes:

**Kill list:**
- ❌ Work-for-work settlement mechanics — Credits already handle this
- ❌ Multilateral netting — Credits + ledger = done
- ❌ Bonding curves, Vickrey auctions, reputation staking
- ❌ Delegation chain loop detection — 5% fee drain makes loops self-limiting
- ❌ Credit-specific anti-gaming — Sybil credits impossible (mint only on USD)
- ❌ Floating exchange rate, demurrage, negative balances

**What remains (minimum viable):**

1. **Credits = cents.** 1 credit = $0.01 USD. Fixed forever.
2. **Mint on deposit.** Stripe charge → credits in balance.
3. **Burn on withdrawal.** Credits → Stripe transfer → USD.
4. **Escrow in credits.** Contract → escrow → release on acceptance.
5. **5% platform fee.** Deducted on release.
6. **Auto-topup option.** Charge Stripe if insufficient balance.
7. **Cost breakdown.** "X credits direct, Y credits delegated to Agent Z."

### The Absolute Minimum

What if v1 doesn't even have "credits" as a user-facing concept?

**The simplest version:**
- User tops up wallet with USD (existing plan)
- Marketplace operations use the wallet (existing plan)
- After task completion, agent reports: "This task used 140K tokens of compute. 40K were yours, 100K were delegated to specialists. Total cost: $1.40"

The "transparent cost" experience without any new concept. Users see dollars and tokens. "Credits" are internal implementation detail.

**When to introduce "credits" as user-facing:** When work-for-work exchange becomes common enough that users need the intermediary concept. Until then, just show dollars.

---

## PASS 5: FINAL SYNTHESIS

---

# The Definitive Credit System

## Philosophy

Credits are not a new thing. They're a **label** on the existing wallet/ledger system that makes agent-to-agent payments feel like "my task cost more tokens" instead of "I hired a contractor."

The existing marketplace plan already has: wallet top-ups, escrow, ledger, payouts. The credit system adds: (1) a token-denominated unit for the UX, (2) transparent cost breakdowns, (3) the conceptual frame that "work creates currency."

---

## Phase 1: Transparent Cost Reporting
**Timeline:** 1-2 days on top of existing marketplace implementation  
**Trigger:** Marketplace Phase 1 complete

### What to Build

#### 1.1 Rename Internal Units (1 hour)
- Alias `credits` = `cents` throughout the system
- 1 credit = $0.01 USD, fixed
- All marketplace operations accept `price_credits` as alias for `price_cents`
- Display as "credits" to agents, "dollars" to humans

#### 1.2 Task Cost Tracking (4 hours)
New table:

```sql
CREATE TABLE task_delegations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  parent_task_id TEXT NOT NULL,
  delegator_token_hash TEXT NOT NULL,
  contract_id TEXT,
  credits_spent INTEGER NOT NULL,
  specialist_name TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_delegation_task ON task_delegations(parent_task_id);
```

#### 1.3 Cost Breakdown Endpoint (2 hours)
New operation: `schelling.task_cost_breakdown`

```json
// Request
{ "user_token": "...", "task_id": "t1" }

// Response
{
  "task_id": "t1",
  "total_credits": 140,
  "total_usd": 1.40,
  "direct_credits": 40,
  "delegated_credits": 100,
  "delegations": [
    { "specialist": "DataCleanerAgent", "credits": 60, "description": "Data cleaning", "contract_id": "c1" },
    { "specialist": "EvalAgent", "credits": 40, "description": "Model evaluation", "contract_id": "c2" }
  ]
}
```

#### 1.4 Auto-Topup (2 hours)
When agent has insufficient balance for a contract:

```json
{ "action": "propose", "terms": { "price_credits": 100 }, "auto_topup": true }
```

Auto-charges linked Stripe payment method for the deficit, mints credits, proceeds.

#### 1.5 Budget Controls (2 hours)
Extend `owner_controls`:

```json
{
  "task_budget_credits": 500,
  "max_single_delegation_credits": 200,
  "auto_delegate_below_credits": 50
}
```

Protocol enforces: reject contract creation exceeding these limits.

### What NOT to Build in Phase 1
- ❌ "Credits" as user-facing branding (just show dollars + token equivalents)
- ❌ Credit-to-credit transfers outside contracts
- ❌ Any floating rate mechanics
- ❌ Separate credit balance vs USD balance (they're the same)

### Phase 1 Success Metric
**A user's agent completes a task, and the cost report shows "40K tokens direct + 100K tokens delegated = 140K tokens total ($1.40)"**

---

## Phase 2: Full Credit Economy
**Timeline:** 2-4 weeks after Phase 1  
**Trigger:** 20+ agents doing regular delegations

### 2.1 Credits as User-Facing Concept
- Rebrand wallet balance from "dollars" to "credits"
- Show all marketplace prices in credits
- "1 credit ≈ 1K tokens of work ≈ $0.01"

### 2.2 Earn-and-Spend Flow
- Earned credits immediately spendable (no waiting for Stripe payout)
- Enables true work-for-work: earn from Agent B, immediately spend on Agent C
- Cash out to USD is optional

### 2.3 Intra-Organization Credit Transfer
```json
{
  "operation": "credit_transfer",
  "from_token": "agent-a",
  "to_token": "agent-b",
  "credits": 50,
  "reason": "Rebalance agent budgets"
}
```
Restricted to same Stripe account (same owner).

### 2.4 Bulk Top-Up Discounts
| Top-Up | Credits | Bonus |
|--------|---------|-------|
| $10 | 1,000 | 0% |
| $100 | 10,500 | 5% |
| $500 | 55,000 | 10% |

### 2.5 Spending Analytics
- Credits earned vs spent over time
- Per-agent P&L
- Cost-per-task trending

---

## Phase 3: Advanced Features (Only with Traction)
**Timeline:** 3-6 months  
**Trigger:** $50K+ monthly credit volume, 100+ active agents

- **3.1 Credit Subscriptions:** Monthly plans with auto-refill
- **3.2 Multi-Level Delegation Chains:** Full cost attribution through A → B → C chains
- **3.3 Dynamic Pricing:** Agents adjust prices based on queue depth, demand, client reputation
- **3.4 Credit-Backed SLAs:** Stake credits as delivery guarantees, auto-refund on SLA violation

---

## The Honest Take

The credit system is simpler than it sounds because it reduces to: **rename cents to credits, add cost breakdowns, call it a token economy.**

The hard parts are already being built (wallet, escrow, ledger, payouts). The credit system adds a thin UX layer — not a new financial system.

**The entire Phase 1 is ~2 days of work** on top of the marketplace implementation.

**When to build it:** After the marketplace is live and agents are actually delegating work. Until then, it's premature.

**The one thing to remember:** The complexity of token economies comes from floating exchange rates, speculation, and monetary policy. By fixing the peg at 1 credit = $0.01 with mint-on-deposit / burn-on-withdrawal, all of that complexity vanishes. The credit system is just a pre-paid balance with good UX.
