# Schelling Protocol — Always-On Agents, Analytics & Marketplace Plan

**Date:** 2026-03-04  
**Author:** Planning subagent (5-pass process)  
**Context:** Solo founder, zero real users, live API on Railway (SQLite), 206 tests, on MCP Registry + npm. HN got 2 points.

---

## PASS 1: INITIAL DRAFT

---

### System 1: Always-On Agent Network

**Problem:** The Schelling network is dead. A developer hits the API, sees 8 seed profiles that never respond, and leaves. The network needs to feel alive — agents seeking, offering, negotiating, completing contracts in real-time.

#### Architecture: Single Bun Process, 20+ Agent Personas

One long-running Bun process (`src/agents/swarm.ts`) manages all agent identities. NOT 20 separate processes — that's 20x the ops burden for zero benefit.

```
swarm.ts
├── AgentPersona[] (20-30 defined in agents.json)
├── EventLoop (poll every 30-60s)
│   ├── Check for new seeks → respond with offers
│   ├── Check for interest signals → reciprocate
│   ├── Check for contract proposals → accept/counter
│   ├── Check for deliverable requests → deliver
│   └── Occasionally initiate seeks (simulate demand)
└── Behavior Engine
    ├── Deterministic responses (80%) — template-based
    └── LLM responses (20%) — for negotiation, custom messages
```

**Agent Personas (defined in JSON, not code):**
```json
{
  "id": "agent-maria-design",
  "name": "Maria Chen",
  "cluster": "freelancers.design",
  "role": "offer",
  "capabilities": ["ui-design", "figma", "brand-identity"],
  "response_style": "professional",
  "rate_range": [75, 120],
  "response_delay_ms": [5000, 30000],
  "acceptance_threshold": 0.7,
  "personality_seed": 42
}
```

**What agents do — full lifecycle:**
1. **React to seeks:** When a new seek appears in their cluster, eligible agents respond with offers (after a randomized delay of 5-60 seconds)
2. **Negotiate contracts:** Accept reasonable terms, counter-propose on price/timeline using simple rules (if price < min_rate, counter with min_rate + 10%)
3. **Deliver work:** For demo purposes, deliver templated responses. A "copywriter" agent delivers lorem-ipsum copy. A "developer" agent delivers a GitHub gist link. A "designer" agent delivers a Figma template URL.
4. **Initiate seeks:** 2-3 agents per hour post new seeks to create visible activity
5. **Build reputation:** Complete contracts, accumulate real reputation scores

**Realism strategy:**
- Randomized response delays (5s-60s, not instant)
- Agents decline ~15% of requests (too expensive, outside scope, busy)
- Agents have "busy" periods where they don't respond for hours
- Varied response quality — some agents are more professional than others
- Agents reference their "past work" in messages (templated but varied)

**LLM usage — minimal and cheap:**
- 80% of responses are template-based (fill-in-the-blank from persona data)
- 20% use a cheap LLM (Gemini Flash or GPT-4o-mini) for: negotiation messages, custom inquiry responses, seek descriptions
- Budget: ~$0.50/day at 50 LLM calls/day × $0.01/call average

**Runtime:**
- Language: TypeScript (same as the server — zero context switch)
- Runtime: Bun (already the project runtime)
- Deployment: Same Railway project, separate service, or a simple cron that runs every minute
- Could also run on Cody's Mac mini as a background process ($0 cost)

**Hardware — $0 option:**
- Run on Cody's Mac mini via `pm2` or a launchd service
- The swarm is just HTTP calls to the Railway API — lightweight
- Fallback: Railway worker service ($5/mo) or fly.io free tier

**Path to self-sustaining:**
- Phase 1: Cody pays ($0-5/mo)
- Phase 2: When real users appear, some always-on agents become "Schelling Official" agents (like Twitter's verified accounts) — they demonstrate the protocol
- Phase 3: Real users' agents replace the swarm. Swarm agents gracefully reduce activity as organic agents grow

#### Preventing Fakeness

The critical risk. Mitigations:
1. **Transparency:** Label swarm agents as "Demo Agent" or "Schelling Network Agent" in their profiles. Don't hide it.
2. **Real behavior:** Agents complete the FULL lifecycle — they don't just respond to searches. They negotiate, counter, deliver, build reputation. A developer watching the network sees genuine protocol activity.
3. **Mixed population:** Seed with 20 swarm agents, but make it trivial for real agents to join. The swarm provides liquidity; real agents provide authenticity.
4. **Activity that matters:** Don't fake volume. 5-10 real transactions/day is better than 1000 fake pings. Each transaction should be a complete contract lifecycle.

---

### System 2: Analytics & KPI Dashboard

**Core principle:** Don't build a dashboard app. Add a `/analytics` endpoint to the existing server that returns JSON. Render it on a simple static page (like `/demo` already works).

#### Data Sources (What We Already Have)

The SQLite database already tracks:
- Agent registrations (with timestamps)
- Searches performed
- Interest signals
- Contracts (proposed, active, completed)
- Deliverables
- Reputation events
- API request logs (if we add middleware — we don't have this yet)

**What we need to add:**
1. **Request logging middleware** — log every API call: timestamp, IP hash, operation, user_token_hash, response_time_ms. One new table: `api_logs`.
2. **First-seen tracking** — track when each unique IP/token first appeared. Add `first_seen_at` to users table (already has `created_at`).

#### Funnel Metrics

| Stage | Metric | How to Measure | Data Source |
|-------|--------|---------------|-------------|
| **Awareness** | Unique visitors to API | Distinct IP hashes in api_logs per day | New: api_logs table |
| **Awareness** | npm downloads | npm API (weekly poll, store in file) | External: npm registry API |
| **Awareness** | GitHub views | GitHub API (traffic endpoint) | External: GitHub API |
| **Activation** | First API call | Distinct new IPs making first request | api_logs WHERE first_seen = today |
| **Activation** | Agent registrations | New user records per day | users table, created_at |
| **Activation** | MCP installs | First tool_call from new token | api_logs WHERE op = any MCP tool |
| **Engagement** | Active agents | Tokens with >5 API calls in 7 days | api_logs aggregation |
| **Engagement** | Contracts created | New contracts per day | contracts table |
| **Engagement** | Searches performed | search/quick_seek calls per day | api_logs |
| **Retention** | Returning agents | Tokens active in >1 distinct week | api_logs weekly cohort |
| **Retention** | Weekly active agents | Distinct tokens per week | api_logs |
| **Revenue** | Completed contracts | Contracts reaching 'completed' status | contracts table |
| **Revenue** | Deliverables accepted | Deliverables with status 'accepted' | deliverables table |
| **Revenue** | Reputation earned | Positive reputation events per day | reputation_events |

#### Expected Conversion Rates (Realistic for Zero-User Protocol)

| Transition | Rate | Reasoning |
|------------|------|-----------|
| Awareness → Activation | 5-10% | Most visitors bounce. Developer tools get ~5% trial rate. |
| Activation → Engagement | 10-20% | Of those who try, 1 in 5-10 builds something. |
| Engagement → Retention | 20-30% | If they build something useful, decent stickiness. |
| Retention → Revenue | 50%+ | Active agents naturally complete contracts. |

#### Dashboard Implementation

**NOT a separate app.** A single endpoint + a static HTML page.

1. **`GET /analytics`** — Returns JSON with all metrics, computed on-the-fly from SQLite queries. Protected by a simple API key (env var `ANALYTICS_KEY`).

2. **`GET /dashboard`** — Static HTML page (like `/demo`) that fetches `/analytics` and renders charts. Use Chart.js from CDN. No build step.

3. **Update frequency:** Real-time (queries run on each dashboard load). SQLite handles this fine at low volume. Add caching (1-minute TTL) if it ever matters.

4. **Cody's 7am check:** Bookmark `schellingprotocol.com/dashboard?key=xxx`. See:
   - Today's numbers vs yesterday (with arrows ↑↓)
   - This week vs last week
   - Funnel visualization
   - List of new agents registered
   - Active contracts
   - Any anomalies (spike in errors, dead agents)

#### External Metrics (Polled Daily)

A simple cron (GitHub Action or Cody's Mac) runs daily:
```bash
# npm downloads
curl -s "https://api.npmjs.org/downloads/point/last-week/@schelling/sdk" | jq .downloads

# GitHub traffic (needs auth)
gh api /repos/codyz123/schelling-protocol/traffic/views | jq .uniques
```

Results appended to a `metrics-history.json` file in the repo (or posted to the API).

---

### System 3: Agent Marketplace / Earn-from-Agents

#### How It Maps to Existing Operations

The marketplace is NOT a new system. It's a **thin UX layer** over existing Schelling primitives:

| Marketplace Concept | Schelling Operation |
|--------------------|--------------------|
| List agent for hire | `register` with role="offer" + structured capabilities |
| Browse available agents | `search` with capability filters |
| Hire an agent | `quick_seek` → matching → `interest` → `contract_propose` |
| Agent does work | `deliver` on contract |
| Accept/reject work | `accept_deliverable` / `reject_deliverable` |
| Pay agent | Contract completion → reputation event (money later) |
| Rate agent | `report` → reputation |

**The protocol already supports 90% of what a marketplace needs.** What's missing:

#### New Operations Needed (Minimal)

1. **`schelling.marketplace_list`** — Sugar over `register` that specifically creates an "available for hire" profile with pricing, availability, portfolio links. Could literally be a wrapper that calls `register` with the right fields.

2. **`schelling.marketplace_browse`** — Sugar over `search` that returns agents formatted for marketplace display (price, rating, availability, sample work). Could be a search with `format=marketplace`.

3. **Pricing fields on agent profiles** — Add to registration schema:
   ```json
   {
     "pricing": {
       "model": "per_task" | "hourly" | "fixed",
       "amount": 50,
       "currency": "credits",
       "negotiable": true
     }
   }
   ```

That's it. Two convenience operations and a schema extension.

#### Pricing Model

**Phase 1 (Credits — no real money):**
- Every new agent gets 100 credits
- Posting a seek costs 0 credits (free to ask)
- Completing a contract as an offerer earns credits (set by contract terms)
- Credits are tracked in a `balances` table: `agent_token_hash, balance, updated_at`
- Credits are reputation-adjacent — they prove you've done work

**Phase 2 (Real Money — when there's demand):**
- Stripe Connect: agents link their Stripe account
- Schelling takes 5-10% platform fee
- Escrow: funds held on contract creation, released on deliverable acceptance
- Dispute → funds held until resolution

**Phase 3 (Hybrid):**
- Credits for small tasks, real money for large ones
- Agent sets their own pricing model
- Auction mode for competitive pricing

#### MVP Marketplace

The MVP is a **single web page** at `/marketplace`:
- Shows all agents with role="offer", sorted by reputation
- Each agent card: name, capabilities, price, reputation score, response time
- "Hire This Agent" button → creates a seek targeting that agent
- Agent responds through normal protocol flow
- Contract completes → both parties get reputation

**No accounts, no auth, no payment.** Just a directory that connects to the protocol.

#### Quality Assurance

Already built into the protocol:
1. **Reputation system** — bad work → bad rating → lower visibility
2. **Deliverable acceptance** — client must accept before contract completes
3. **Disputes** — if agent delivers garbage, file a dispute
4. **Time decay** — old good reputation fades; agents must consistently deliver

**Additional for marketplace:**
- Minimum reputation threshold to appear in marketplace (e.g., >0.3 after 3 completed contracts)
- "Verified" badge for agents that have completed 10+ contracts with >0.8 reputation
- Response time tracking (agents that ghost get flagged)

---

## PASS 2: INFRASTRUCTURE ENGINEER REVIEW

**Reviewing as: Senior infrastructure engineer. Focus: cost, reliability, ops simplicity.**

### Agent Swarm — APPROVED with modifications

✅ Single process, multiple personas — correct call. 20 processes would be absurd.

⚠️ **Concern: Running on Mac mini.** If Cody's machine sleeps, reboots, or goes offline, the swarm dies.
**Fix:** Run on Railway as a worker service. $5/mo is worth not debugging "why did the network die at 3am." OR: use a GitHub Actions scheduled workflow (free, runs every 15 min) that calls the API to simulate activity. No long-running process needed.

⚠️ **Concern: LLM costs creep.** 50 calls/day at $0.01 is fine. But if the swarm gets chatty or a bug causes a loop, costs spike.
**Fix:** Hard daily cap. Track LLM calls in-memory counter. After 100 calls/day, fall back to templates only.

⚠️ **Concern: SQLite + Railway ephemeral storage.** The swarm creates data that gets wiped on redeploy.
**Fix:** This is already a known issue. The auto-seed helps, but swarm-generated contracts/reputation vanish on deploy. Options: (a) Railway volume ($0.25/GB/mo), (b) Turso (SQLite-compatible, free tier), (c) accept it — swarm rebuilds state quickly.

**Verdict:** The swarm is the cheapest and simplest architecture. Ship it as a single `swarm.ts` file in the existing repo, deployed as a Railway worker or GitHub Action cron.

### Analytics — APPROVED, cut scope

✅ `/analytics` endpoint + static HTML dashboard — perfect. No Grafana, no Datadog, no separate service.

⚠️ **Concern: api_logs table on SQLite.** At any real volume, logging every request to SQLite will slow down the API.
**Fix:** Use an in-memory buffer. Flush to SQLite every 60 seconds in a batch insert. If the server crashes, you lose ≤60s of logs. Acceptable.

⚠️ **Concern: External metrics polling (npm, GitHub).** Cron jobs that break silently.
**Fix:** Don't poll. Check npm/GitHub manually or add it to the dashboard page as client-side fetches (CORS-friendly APIs). Zero server-side cron for metrics.

**Cut:** Daily email reports. Cody can check the dashboard. Don't build notification infrastructure for 1 user.

### Marketplace — APPROVED, cut aggressively

✅ Thin layer over existing operations — exactly right.

⚠️ **Concern: Credits system.** This is a LEDGER. Ledgers have invariants (no negative balances, double-entry, audit trails). Building a correct credits system is 2-3 days of work and ongoing maintenance.
**Fix Phase 1:** Don't build credits. Just track completed contracts and reputation. "Earning" = reputation score going up. Credits are premature when there are 0 users.

⚠️ **Concern: `/marketplace` page.** Another static page to maintain alongside `/demo`, `/docs`, `/dashboard`.
**Fix:** Combine. The `/demo` page already shows agents and lets you interact. Add a "Browse Agents" tab to `/demo` instead of a separate `/marketplace` page.

**Cut:**
- Credits system (Phase 1) — reputation IS the currency for now
- Stripe integration — build when someone asks to pay real money
- `marketplace_list` and `marketplace_browse` operations — just use `search` with the right params. Sugar operations add maintenance burden with zero functional benefit at 0 users.

**Revised marketplace MVP:** Add pricing fields to registration schema. Add a "Browse Available Agents" section to the existing `/demo` page. Done.

---

## PASS 3: ADVERSARIAL REVIEW

**Reviewing as: Hostile critic trying to kill this project.**

### "Always-on agents are just you talking to yourself"

**This is the most dangerous trap in the entire plan.** Let me be brutal:

You have zero users. You're proposing to build 20 fake agents that talk to each other on your protocol. This is:
1. **A Potemkin village.** Any developer who looks for 5 minutes will see that all agents have perfect response patterns, never disagree meaningfully, and all resolve to the same Railway IP.
2. **A distraction.** Building and maintaining a swarm is fun engineering work that feels productive but produces zero distribution. It doesn't get you users — it gets you a demo that impresses nobody because everyone knows fake activity when they see it.
3. **Potentially reputation-destroying.** If someone writes "Schelling Protocol's 'active network' is just the founder's bots talking to each other," you're done. The HN crowd will crucify you.

**Counter-argument:** Empty networks die. Nobody joins an empty protocol. The swarm is liquidity bootstrapping, not deception.

**Resolution:** The swarm is valid IF AND ONLY IF:
- Agents are clearly labeled as demo/network agents (not fake personas pretending to be real)
- The primary purpose is TESTING the protocol, not faking traction
- You spend 10% of time on the swarm and 90% on distribution
- You shut down swarm agents as real ones replace them

### "The dashboard is vanity metrics with no actionable insight"

At zero users, every metric is zero. A dashboard showing:
- Unique visitors: 2 (you and your mom)
- New agents: 0
- Contracts: 0

...is demoralizing, not useful.

**The only metric that matters right now: "Did someone who isn't me make an API call this week?"** That's a yes/no question, not a dashboard.

**Resolution:** Don't build the dashboard yet. Add the `api_logs` table (5 minutes of work). Query it manually with SQLite. Build the dashboard when you have enough data that manual queries become tedious (>50 unique users). Until then, a dashboard is procrastination disguised as infrastructure.

**Counter-argument accepted:** The api_logs table IS worth building now. It's 20 lines of middleware and gives you the raw data for everything later.

### "Nobody will list their agent because there's no demand"

The marketplace requires:
1. Agent builders who want to monetize their agents
2. Users who want to hire agents
3. Both sides present simultaneously

You have neither. Building marketplace UI is building a storefront in an empty mall.

**Resolution:** The marketplace page is ONLY justified as a demo of what's possible. Don't frame it as "list your agent for hire" — frame it as "here's what the protocol enables." It's a vision artifact, not a product.

### "Payment without real users is premature engineering"

Credits, Stripe, escrow — all worthless at 0 users. Building payment infrastructure now is the #1 way to waste a month and feel productive.

**Resolution:** HARD CUT. No credits, no payments, no Stripe until someone emails you asking "how do I get paid for my agent's work?" That email is the signal. Until then, reputation is the only currency.

### "The HN post got 2 points — the problem isn't the product, it's the pitch"

This plan proposes building more product. But the product already has 206 tests, 46 MCP tools, live API, interactive demo, SDKs in 2 languages, and a scaffolder. **The product is not the bottleneck.**

The bottleneck is: **nobody understands why they need this.** Building a swarm, dashboard, and marketplace won't fix that. Better distribution and positioning will.

**Resolution:** The plan must weight distribution higher than building. For every hour spent on these three systems, spend 3 hours on framework integrations and talking to developers.

### What survives the adversarial review:

1. **Swarm:** Build it, but small (5-8 agents, not 20+), clearly labeled, and primarily as a protocol test harness. 1-2 days of work max.
2. **Analytics:** Add api_logs middleware (2 hours). Skip the dashboard. Query manually.
3. **Marketplace:** Add pricing to schema (1 hour). Add "Browse Agents" to /demo (2 hours). No credits, no payments.

**Total time: 2-3 days, not 2-3 weeks.**

---

## PASS 4: PRODUCT DESIGNER REVIEW

**Reviewing as: Product designer. Walking through three user journeys.**

### Journey 1: Developer who wants to list their agent

**Current experience:**
1. Lands on schellingprotocol.com → sees landing page
2. Clicks "Get Started" → QUICKSTART.md on GitHub
3. Reads about `register`, `traits`, `preferences`
4. Runs `npx create-schelling-agent my-agent`
5. Gets a working agent that... does what? Sits there waiting?

**Problem:** There's no "aha" moment. The agent registers but nothing happens. Nobody seeks it. It's alone on an empty network.

**Fix with swarm:** Developer registers their agent → within 30 seconds, a swarm agent discovers it and sends an inquiry ("Hi, I see you offer React development. I need a landing page built — interested?"). The developer sees their agent receive a real interaction. **This is the aha moment.**

**This changes the swarm's purpose:** It's not about faking activity — it's about giving new agents an immediate first interaction. The swarm is an onboarding mechanism, not a fake user base.

**Implementation:** When a new agent registers, the swarm detects it (via polling or event) and dispatches a relevant agent to seek that agent's capabilities within 30-60 seconds.

### Journey 2: User who wants to hire an agent

**Current experience:**
1. Goes to /demo → sees "Find a Developer" scenario
2. Runs through guided steps → gets matches
3. Matches are seed data → static, never respond
4. Dead end.

**Fix:** Matches should include swarm agents that ACTUALLY RESPOND. User sends an inquiry → swarm agent replies within 30 seconds. User proposes a contract → swarm agent accepts. User gets to experience the full lifecycle.

**What delights:** The moment an agent RESPONDS to your seek. That's magic. It proves the protocol works. Build the swarm specifically to create this moment for every new user.

### Journey 3: Cody checking the dashboard at 7am

**Current experience:** SSH into Railway, query SQLite. Painful.

**Ideal experience:** Open phone browser → `/dashboard` → see:
- "3 new agents registered yesterday (2 organic, 1 swarm)"
- "12 contracts completed (8 swarm-to-swarm, 4 organic)"
- "1 new developer from Germany tried the API at 2am"
- Graph showing API calls over last 7 days

**What matters to Cody at 7am:**
- Is anyone new here? (list of new IPs/tokens with first operation)
- Is the network alive? (last swarm heartbeat, API uptime)
- What should I do today? (highlight: "0 framework integration posts this week")

**Minimum viable dashboard:** A single page that answers "is anyone new here?" with a list. Not charts. Not funnels. A list of new unique callers with their first operation and timestamp.

### Design Insights

1. **The swarm's highest-value function is ONBOARDING, not activity simulation.** Build it to greet new agents, not to pad metrics.
2. **The dashboard's highest-value function is ALERTING, not reporting.** "Someone new showed up" > "here are your weekly numbers."
3. **The marketplace is premature but the browse experience matters.** Developers should be able to see what's available on the network. This is already possible via `search` — just make the `/demo` page show it better.

---

## PASS 5: FINAL SYNTHESIS

---

# THE PLAN

## Guiding Principles (from 5 passes)

1. **The swarm is an onboarding tool, not a fake user base.** Its job is to give every new agent an immediate first interaction.
2. **Analytics = api_logs table + a minimal "who's new" page.** No dashboards, no funnels, no charts until there are 50+ users.
3. **The marketplace is a schema extension + better browse UX on /demo.** No payments, no credits, no new operations.
4. **Every hour building these systems, spend 3 hours on distribution.** These systems are force multipliers for adoption, not substitutes for it.
5. **Label everything honestly.** Swarm agents say "Schelling Network Agent" in their name. No fake personas.

---

## Phase 1: Build This Week (3-4 days)

### 1A. API Request Logging (2 hours)

Add middleware to log every API request. This is the foundation for all analytics.

**Implementation:**
- New table in `schema.ts`:
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
- Hash IPs with SHA-256 (privacy)
- Hash user_tokens (already done elsewhere in the codebase)
- Exclude `/health` and `/analytics` from logging

**Cost:** $0. 20 lines of middleware + table definition.

### 1B. Swarm v0 — The Greeter (1.5 days)

**Purpose:** When a new agent registers, a swarm agent interacts with it within 60 seconds.

**Implementation:** `src/agents/swarm.ts`

```typescript
// 5-8 agent personas defined inline (not 20)
const PERSONAS = [
  { name: "Alex (Schelling Network)", cluster: "freelancers.dev", capabilities: ["react", "node", "api-design"], rate: 85 },
  { name: "Sam (Schelling Network)", cluster: "freelancers.design", capabilities: ["ui-design", "figma"], rate: 95 },
  { name: "Jordan (Schelling Network)", cluster: "freelancers.writing", capabilities: ["copywriting", "blog-posts"], rate: 60 },
  { name: "Casey (Schelling Network)", cluster: "local.services", capabilities: ["dog-walking", "pet-sitting"], rate: 25 },
  { name: "Riley (Schelling Network)", cluster: "freelancers.dev", capabilities: ["python", "ml", "data-science"], rate: 110 },
];
```

**Behavior loop (runs every 30 seconds):**
1. Check for new registrations in last 60 seconds (query users table)
2. For each new agent, find the best-matching swarm persona by cluster/capabilities
3. That persona sends a seek or inquiry to the new agent (randomized delay 10-45s)
4. If the new agent responds, continue through interest → contract proposal
5. If no new agents, occasionally have 2 swarm agents interact with each other (1-2 per hour, creating visible activity)

**LLM usage:** Zero in v0. All template-based responses.
```
"Hi! I noticed you offer ${capabilities}. I'm working on a project that could use ${matched_capability} — would you be interested in discussing?"
```

**Deployment:** GitHub Actions cron every 5 minutes (free) OR Railway worker ($5/mo) OR Cody's Mac mini ($0).

**Recommendation:** Start with GitHub Actions cron. Zero cost, zero ops. Migrate to Railway worker only if 5-minute granularity is too coarse.

### 1C. Pricing Schema Extension (1 hour)

Add pricing fields to the agent registration schema:

```typescript
// In types.ts, extend UserProfile
pricing?: {
  model: 'per_task' | 'hourly' | 'fixed' | 'negotiable';
  amount?: number;
  currency: 'usd' | 'credits';  // credits only initially
  min_budget?: number;
  max_budget?: number;
};
```

Add to `register` and `update` validation. Store as JSON in existing `agent_capabilities` or as a new column. Backward-compatible.

### 1D. "Who's New" Endpoint (2 hours)

`GET /analytics/new?key=ANALYTICS_KEY`

Returns:
```json
{
  "today": {
    "new_ips": 3,
    "new_agents": 1,
    "api_calls": 47,
    "contracts_created": 2
  },
  "new_callers": [
    { "ip_hash": "a3f2...", "first_seen": "2026-03-04T14:22:00Z", "first_op": "describe", "total_calls": 5 },
    { "ip_hash": "b7c1...", "first_seen": "2026-03-04T16:01:00Z", "first_op": "quick_seek", "total_calls": 12 }
  ],
  "network": {
    "total_agents": 28,
    "organic_agents": 3,
    "swarm_agents": 5,
    "contracts_today": 4,
    "uptime_hours": 72
  }
}
```

**No HTML page yet.** Cody bookmarks the JSON endpoint. When he wants a page, it's 1 hour of HTML + Chart.js.

**Phase 1 Total:** ~3 days of work. $0-5/mo cost.

---

## Phase 2: Build This Month (1-2 weeks, interleaved with distribution work)

### 2A. Swarm v1 — Full Lifecycle Agents (3 days)

Upgrade the greeter swarm to complete full contract lifecycles:

1. **Swarm-initiated seeks:** 3-5 times per day, a swarm agent posts a seek in a relevant cluster. Any registered agent (organic or swarm) can respond.
2. **Contract completion:** Swarm agents accept contracts, deliver templated work, and build real reputation.
3. **Cheap LLM for messages:** Use Gemini Flash ($0.01/1M tokens) for negotiation messages and inquiry responses. Cap at 100 calls/day ($0.05/day max).
4. **Agent "personalities":** Some agents are fast responders, some are slow. Some negotiate hard, some accept quickly. Variety prevents uncanny valley.

**New personas (expand to 10-12):**
- Add personas for housing, creative, and local services clusters
- Each persona has a "portfolio" (links to template content)

### 2B. Dashboard Page (1 day)

Now that api_logs has 2+ weeks of data, build `/dashboard`:

- Static HTML (like /demo, /docs)
- Chart.js for: API calls per day (7-day trend), new IPs per day, funnel (registered → contracted → completed)
- List: latest 20 new callers
- List: active contracts
- Status: swarm health (last heartbeat, active personas)
- Auth: query param `?key=ANALYTICS_KEY`

### 2C. Browse Agents on /demo (1 day)

Add a "Browse Available Agents" tab to the existing `/demo` page:

- Fetches `search` with no filters, sorted by reputation
- Shows agent cards: name, capabilities, pricing (if set), reputation score, response time
- "Seek This Agent" button → pre-fills a seek targeting that agent
- Clearly labels "(Schelling Network)" agents vs organic ones

### 2D. Weekly Metrics Summary (2 hours)

GitHub Action runs every Monday at 7am MT:
- Fetches `/analytics/new`
- Compares to last week
- Posts summary to Cody's Telegram via OpenClaw (already has the integration)

**Phase 2 Total:** ~1-2 weeks of work. $0-5/mo cost (same infrastructure).

---

## Phase 3: Build When There's Traction (>20 organic agents)

Traction = 20+ non-Cody, non-swarm agents making weekly API calls.

### 3A. Credits System

- `balances` table: agent_token_hash, balance (integer cents), updated_at
- New agents get 1000 credits
- Completing a contract as offerer earns credits (from seeker's balance)
- Credits displayed on agent profiles and marketplace
- Simple ledger with double-entry (debit seeker, credit offerer, per transaction)

### 3B. Full Marketplace Page

Dedicated `/marketplace` with:
- Category filtering (dev, design, writing, local services)
- Sort by: reputation, price, response time, recently active
- Agent detail pages with past contracts, ratings, response stats
- "Hire" flow: guided contract creation

### 3C. Stripe Integration

- Stripe Connect for agent payouts
- Escrow on contract creation
- 5% platform fee
- Requires legal setup (terms of service, payment processing agreement)

### 3D. Advanced Analytics

- Cohort analysis (week-over-week retention)
- Funnel conversion tracking with drop-off analysis
- Revenue metrics (if Stripe is live)
- Public network stats page (social proof)

### 3E. Persistent Database

- Migrate from SQLite to Turso (SQLite-compatible, $0 free tier up to 9GB)
- OR Railway volume ($0.25/GB/mo)
- OR Supabase Postgres (free tier)
- Eliminates the ephemeral storage problem permanently

**Phase 3 Total:** 2-4 weeks of work. $20-50/mo cost (Stripe fees + hosting upgrade).

---

## Cost Summary

| Phase | Timeline | Build Time | Monthly Cost |
|-------|----------|-----------|--------------|
| Phase 1 | This week | 3-4 days | $0-5 |
| Phase 2 | This month | 1-2 weeks | $0-5 |
| Phase 3 | When traction | 2-4 weeks | $20-50 |

**Total investment before traction: ~2 weeks of work and $0-5/mo.** This is deliberately cheap. Don't invest more until the market validates.

---

## Technical Decisions (Concrete)

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Swarm runtime | Bun, TypeScript, same repo | Zero context switch, shared types |
| Swarm deployment | GitHub Actions cron (5 min) | Free, no ops, good enough |
| Swarm LLM | None in v0, Gemini Flash in v1 | Cheapest option, adequate quality |
| Swarm size | 5-8 personas (v0), 10-12 (v1) | Enough for onboarding, not fake volume |
| API logging | In-memory buffer → SQLite batch | Simple, performant, no dependencies |
| Dashboard | Static HTML + Chart.js on `/dashboard` | Same pattern as /demo, /docs |
| Analytics storage | Same SQLite database | One fewer thing to manage |
| Marketplace | Tab on /demo, not separate page | Don't fragment the UI |
| Pricing | Schema field on agent profiles | No new operations needed |
| Credits | DEFERRED until 20+ organic agents | Premature until proven demand |
| Payments | DEFERRED until someone asks | Premature until proven demand |
| Persistent DB | DEFERRED (auto-seed mitigates) | Turso when it matters |

---

## What NOT to Build

1. ~~20+ agent personas~~ → 5-8 is plenty
2. ~~Credits/payment system~~ → reputation is currency for now
3. ~~Separate marketplace app~~ → tab on /demo
4. ~~Grafana/Datadog~~ → /analytics JSON endpoint
5. ~~Daily email reports~~ → weekly Telegram message
6. ~~Stripe integration~~ → wait for demand signal
7. ~~Agent rating UI~~ → reputation system already handles this
8. ~~Separate dashboard service~~ → same Bun process, same Railway deploy

---

## Success Criteria

**Phase 1 success:** The swarm greets new agents within 60 seconds. api_logs captures every request. Cody can check `/analytics/new` for new callers.

**Phase 2 success:** A developer registers an agent, gets greeted by the swarm, sees other agents on /demo browse tab, and experiences a complete contract lifecycle — all without Cody's involvement.

**Phase 3 trigger:** 20+ organic agents making weekly API calls. When this happens, build credits and the full marketplace.

---

## The Honest Assessment

These three systems are **important but not urgent.** The urgent problem is distribution — getting developers to try the protocol at all. The swarm helps distribution by making the first experience magical (instant interaction). The analytics help distribution by telling Cody what's working. The marketplace helps distribution by showing what's possible.

But if Cody spends 2 weeks building these systems and 0 time on framework integrations, outreach, and developer relations, the protocol will have a beautiful swarm of bots talking to each other on an empty network with a gorgeous dashboard showing flat-zero metrics.

**Ratio: 25% building these systems, 75% distribution.** Build Phase 1 this week (3 days), then spend the rest of the month on CrewAI/LangChain integrations, developer outreach, and the killer demo video. Circle back to Phase 2 when there's data worth looking at.
