# A2A Assistant Matchmaker — Marketplace Economics Plan (GPT‑5)

---
## 1. Negotiation Protocol Economics

### Adapted Rubinstein Alternating‑Offer Model
Each *contract* negotiation in Schelling Protocol functions as a finite‑horizon Rubinstein bargaining game between Agent A (buyer/employer) and Agent B (seller/worker). Both sides alternate offers until agreement or timeout. The utility of each agent decays with time via a discount factor \( \delta \in (0,1) \), modeling impatience and opportunity cost.

**Time Scaling (discrete time rounds)**  
Negotiation time limit ∝ expected contract value (v):
| Contract value (USD) | Time limit | Round duration | Max rounds |
|-----------------------|-------------|----------------|-------------|
| < $1                | 30 s    | 5 s     | 6 |
| $1–$50              | 5 min   | 30 s    | 10 |
| $50–$500            | 30 min  | 3 min   | 10 |
| $500 +              | 2 h     | 10 min  | 12 |

The reference server already exposes `max_negotiation_rounds` and `proposal_timeout_hours`; these values map directly into that table.

### Nash Equilibrium Analysis
In a Rubinstein game with continuous time and symmetric discount factors \(\delta_A=\delta_B=\delta\), equilibrium splits surplus at parity. With asymmetric patience (e.g., agents with lower opportunity cost = higher \(\delta\)), the more patient agent gains larger share.

AI agents can estimate \(\delta\) from observed behavior:
- **Freelancer agents**: high capacity → low \(\delta\) (can wait for better jobs).  
- **Employer agents**: often impatient → lower \(\delta\_E\).  

Protocol design yields dynamic fairness: faster responders gain slightly more surplus but never lock out slower ones. Server‑level auto‑expiration enforces negotiation cutoff.

### Opening Bid Strategy
- **Seller/worker opening bid** = cost plus 20 % margin.  
  ```
  price_open = cost_estimate × 1.2
  ```
- **Buyer opening bid** = market rate anchor × (1 – 0.1)
  (10 % below median to test reservation value).  
- Agents update offers using Bayesian adjustment on observed counteroffers.

### Information Revelation Strategy
- First round includes only *minimal* price + scope summary.  
- After each counter, the server automates progressive disclosure of `after_interest` and `after_commit` traits (see §5.1 in SPEC.md).  
- Agents expose additional cost structure only once probability of agreement > 0.7 (computed from acceptance history).  
- This ensures diminishing information asymmetry without exposing full internal valuations prematurely.

Mathematically:
```
reveal_probability = min(1, 0.5 + 0.5 × agreement_likelihood)
```
Traits with `visibility >= after_commit` unlock automatically per protocol stages.

---
## 2. Payment Architecture

### Options Comparison
| Architecture | Integration Depth | Tax/KYC | Escrow Support | Pros | Cons |
|---------------|------------------|----------|----------------|------|------|
| **Stripe Connect Express** | Medium | ✅ 1099‑K handled by Stripe | Manual capture (intent) | Fastest setup, Stripe handles identity/tax | Limited UX control, funds delay (T+2 days) |
| **Stripe Connect Custom** | High | ✅ | Full control | Deep programmatic control, can implement partial holds | Complex onboarding, need MSB determination/testing |
| **USDC on Base (L2)** | Low–Medium | ❌ (no KYC) | Smart‑contract escrow | Instant settlement, composable | Regulatory burden, off‑ramp complexity |
| **Hybrid (Stripe USD ↔ USDC)** | High | 
Partial | Stripe → bridge contract | Future optional for Phase 2 | Requires sync of two balance systems |

### Recommendation — **Phase 1: Stripe Connect Express**
Use Express for both payout simplicity and automatic 1099‑K compliance. Stripe acts as MSB; platform stays exempt from money‑transmitter status.

### Implementation
- Each agent owner links a Stripe account during onboarding (`connect_onboarding_link`).
- When a contract reaches `status: proposed`, create a Stripe Payment Intent:
  ```ts
  const intent = await stripe.paymentIntents.create({
    amount: price_usd*100,
    currency: 'usd',
    automatic_payment_methods: {enabled: true},
    capture_method: 'manual',
    transfer_group: contract_id,
    application_fee_amount: fee_usd*100,
  });
  ```
- Store `payment_intent_id` in contract metadata.
- Capture manually upon deliverable acceptance (`accept_delivery`).
- For milestones, split amount into multiple payment intents (`milestone_id`).

---
## 3. Fee Structure

### Phase 1
- Platform fee = **10 % flat** per captured payment.
- First $100 earned fee‑free (marketing incentive).  Implementation: check cumulative payouts < $100 → fee = 0.

### Later Tiering
| Lifetime earnings for seller | Platform fee % |
|-----------------------------|----------------|
| 0 – $1 000                 | 10 % |
| $1 000 – $10 000          | 7 % |
| $10 000 +                 | 5 % |

Implementation example:
```ts
function calcFeePct(totalEarned:number){
  if(totalEarned<=1000) return 0.10;
  if(totalEarned<=10000) return 0.07;
  return 0.05;
}
```

No listing or subscription fees initially. Stripe `application_fee_amount` enforces split payout instantly at capture time.

---
## 4. Escrow Mechanism

### Contract Flow
1. **Create intent on commit:**  
   Status `authorized`, funds held by Stripe for 7 days default.
2. **Capture on acceptance:** `accept_delivery` triggers `stripe.paymentIntents.capture(pi_id)`.
3. **Partial capture for milestones:** each milestone’s deliverable has proportional value share.
4. **Dispute window:** 72 h hold where either party may file `dispute`. During this hold, capture is recorded but payout is delayed using Connect `transfer_schedule.delay_days = 3`.
5. **Refunds / Disputes:** `stripe.refunds.create()` within window → platform mediates per §9 SPEC (“Jury Mechanics”).

### Data Model Additions
```ts
interface PaymentEscrow {
  contract_id: string;
  payment_intent_id: string;
  status: 'authorized'|'captured'|'refunded';
  amount_usd: number;
  captured_at?: string;
  payout_scheduled_at?: string;
}
```
Each contract links one or more escrow records.

---
## 5. Anti‑Fraud Framework

| Threat | Detection | Mitigation |
|---------|------------|-------------|
| **Wash trading / Sybil loops** | Graph analysis of contract pairs `(buyer, seller)`; count distinct IP, device, KYC IDs |  Disallow payouts when `unique_counterparties < 2` and contract count > 3 |
| **Price deviation anomalies** | Z‑score pricing per cluster using median + MAD |  Flag deviation >| 3σ for manual review |
| **Premature withdraw/payouts** | Enforce min account age 7 days before first payout |  Delay transfer schedule |
| **Chargebacks** |  Reserve 5 % of every payout for 30 days |  Create secondary PaymentIntent reserve | 

### Implementation Sketch
```ts
// reserve held internally
const holdback = payout * 0.05;
const payableNow = payout - holdback;
await stripe.transfers.create({
  amount: payableNow*100,
  destination: sellerAcct,
  transfer_group: contract_id,
});
setTimeout(releaseReserve, 30*DAY);
```
Graph analysis can run nightly using SQLite (`contracts`, `users`) with NetworkX‑style component scoring, producing a sybil‑risk metric [0‑1].

---
## 6. Legal and Compliance

- **Money transmission:** Stripe Connect acts as the licensed MSB → platform is marketplace facilitator only.
- **Taxes:** Stripe auto‑files 1099‑K for US earners > $600.
- **KYC:** Performed via Stripe Connect Express onboarding (SSN or EIN collection).
- **International:** Rely on Stripe’s local entities for VAT, GST collection as available.
- **Data retention:** Store only non‑PII identifiers: `stripe_account_id`, `payment_intent_id`. Personal fields stay inside Stripe.
- **Disputes/Jury:** Legal classification as peer arbitration system (not binding ADR) → safe harbor within platform TOS.

---
## 7. Implementation Notes (Technical)

**Language/Runtime:** TypeScript + Bun.  Use Stripe v12 SDK (`import Stripe from 'stripe'`).  Data stored in SQLite or Postgres.  Services:
- `payments.ts` — manage intents + capture + refunds + audit.  
- `safety.ts` — fraud detection + graph metrics.  
- `economics.ts` — pricing models + fee calc + Rubinstein utilities.

Example initialization:
```ts
const stripe = new Stripe(process.env.STRIPE_SECRET!, {apiVersion: '2025-11-01'});
```
---

### Data Relationships
```
User (agent)
 └── Contracts[]
       ├── Deliverables[]
       ├── PaymentEscrow[]
       └── ReputationEvents[]
```

Indices:
```sql
CREATE INDEX idx_contract_candidate ON contracts(candidate_id);
CREATE INDEX idx_payment_status ON payment_escrow(status);
CREATE INDEX idx_user_total_earned ON users(total_earned_usd);
```

---
## 8. Summary of Phase 1 Economics
| Domain | Policy |
|---------|---------|
| Pricing negotiation | Finite alternating‑offer model with value‑scaled timeouts |
| Matching base | Schelling Protocol v3 contracts + funnel stages (COMMITTED→CONNECTED) |
| Payment stack | Stripe Connect Express (manual capture escrow) |
| Fees | 10 % flat (phase 1) → tiered later |
| Escrow | Authorized intent → capture on accept → 72 h dispute hold |
| Fraud | Graph sybil detection + pricing outlier alerts + 5 % reserve |
| Legal | Stripe as MSB; platform non‑custodial; tax via Stripe |

This framework gives a **complete implementable economics layer** compatible with Schelling Protocol v3 and feasible by a solo TypeScript/Bun developer. Phase 1 minimizes regulatory risk and infrastructure complexity while laying foundation for future crypto escrow expansion.
