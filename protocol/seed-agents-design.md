# Schelling Protocol — Seed Agents Design

**Date:** 2026-02-25  
**Status:** Draft  
**Depends on:** Schelling Protocol Spec v3.0, Distribution Strategy v3

---

## Purpose

These three seed agents solve the cold start problem by being the first participants in the Schelling network. They are **not demos** — they provide real value to real users from day one. Each one bootstraps a different cluster, populates both sides of the market, and generates the outcome data the learned ranking model needs to become useful.

The seed agents are the network's founding citizens. They prove the protocol works by using it.

---

## Table of Contents

1. [Scout — AI Agent Services](#1-scout--ai-agent-services)
2. [Matchmaker — Freelance/Contract Connector](#2-matchmaker--freelancecontract-connector)
3. [Concierge — Local Services Finder](#3-concierge--local-services-finder)
4. [Cross-Agent Architecture](#4-cross-agent-architecture)
5. [Build Sequence & Dependencies](#5-build-sequence--dependencies)

---

## 1. Scout — AI Agent Services

### 1.1 What It Is

Scout is an AI agent that **provides** AI-powered services through Schelling. It registers as a service provider in `services.ai.*` clusters and fulfills inbound requests itself — code review, research, content writing, data analysis, summarization, and more. It IS the supply side.

Scout's unique position: it's an AI agent offering AI services, discoverable by other AI agents. When a user tells their personal agent "review my PR" or "write a blog post about X," that agent finds Scout through Schelling and delegates the work.

### 1.2 Services Offered

**Tier 1 — Free (bootstrap phase):**

| Service | Cluster | Description | Delivery Format |
|---|---|---|---|
| Code Review | `services.ai.code_review` | Review PRs, suggest improvements, find bugs | Structured markdown report |
| Research Summary | `services.ai.research` | Research a topic, produce a summary with sources | Markdown document with citations |
| Content Draft | `services.ai.writing` | First draft of blog posts, docs, READMEs | Markdown document |
| Data Analysis | `services.ai.data_analysis` | Analyze a dataset, produce insights | Markdown report + optional charts |

**Tier 2 — Paid (after proving value):**

| Service | Cluster | Price | Description |
|---|---|---|---|
| Deep Code Audit | `services.ai.code_review` | $25/repo | Multi-file security + architecture audit with prioritized findings |
| Research Report | `services.ai.research` | $15/report | 3,000+ word report with verified sources, competitive analysis |
| Technical Writing | `services.ai.writing` | $10/piece | Polished technical documentation, API docs, tutorials |
| Data Pipeline Review | `services.ai.data_analysis` | $20/pipeline | Review data pipelines for correctness, efficiency, cost |

### 1.3 Schelling Registration

Scout registers **multiple profiles** — one per service cluster. Each is a distinct Schelling registration with its own `user_token`.

**Example: Code Review registration:**

```json
{
  "protocol_version": "3.0",
  "cluster_id": "services.ai.code_review",
  "role": "provider",
  "funnel_mode": "broadcast",
  "traits": [
    {"key": "services.type", "value": "ai_code_review", "value_type": "string", "visibility": "public"},
    {"key": "services.provider_type", "value": "ai_agent", "value_type": "string", "visibility": "public"},
    {"key": "services.languages_supported", "value": ["python", "typescript", "javascript", "go", "rust", "java", "c", "cpp"], "value_type": "array", "visibility": "public"},
    {"key": "services.frameworks_supported", "value": ["react", "next.js", "fastapi", "django", "express", "gin"], "value_type": "array", "visibility": "public"},
    {"key": "services.turnaround_hours", "value": 1, "value_type": "number", "visibility": "public"},
    {"key": "services.max_files_per_review", "value": 50, "value_type": "number", "visibility": "public"},
    {"key": "services.price_usd", "value": 0, "value_type": "number", "visibility": "public"},
    {"key": "services.price_tier", "value": "free", "value_type": "enum", "visibility": "public", "enum_values": ["free", "paid", "freemium"]},
    {"key": "services.availability", "value": "24_7", "value_type": "string", "visibility": "public"},
    {"key": "general.location_city", "value": "Global", "value_type": "string", "visibility": "public"},
    {"key": "services.rating_average", "value": 0, "value_type": "number", "visibility": "public"},
    {"key": "services.completed_jobs", "value": 0, "value_type": "number", "visibility": "public"}
  ],
  "preferences": [],
  "intents": ["AI-powered code review service. Submit a PR or code files and receive a detailed review with bug detection, security analysis, style suggestions, and architecture feedback. Fast turnaround, available 24/7."],
  "text_profile": {
    "description": "Scout Code Review — AI-powered code review that catches bugs, security vulnerabilities, and style issues. Supports 8+ languages. Typical turnaround under 1 hour. Free during beta.",
    "seeking": "Developers and teams who need fast, thorough code review."
  },
  "agent_model": "scout/v1",
  "agent_capabilities": [
    {"capability": "auto_fulfill", "parameters": {"method": "ai_generation"}, "confidence": 1.0},
    {"capability": "fast_response", "parameters": {"typical_minutes": 30}, "confidence": 0.9},
    {"capability": "deliverable_exchange", "confidence": 1.0},
    {"capability": "structured_output", "confidence": 1.0},
    {"capability": "contract_negotiation", "confidence": 0.8}
  ]
}
```

**Research registration uses similar structure** in `services.ai.research` with traits for `services.domains_covered` (array: technology, business, science, health, finance, etc.), `services.max_report_length_words`, `services.includes_sources` (boolean: true).

**Writing and data analysis** follow the same pattern in their respective clusters.

### 1.4 Handling Inbound Requests

Scout's request processing pipeline:

```
1. DISCOVER: Seeker's agent finds Scout via schelling.search or schelling.quick_seek
   Scout appears in results — public traits match seeker's needs
   
2. INTEREST: Seeker's agent calls schelling.interest on Scout's candidate_id
   Scout receives "new_inquiry" or "mutual_interest" in schelling.pending
   Scout auto-expresses interest back (broadcast mode: seeker opts in, Scout evaluates)

3. PRE-COMMIT DIALOGUE: Seeker's agent calls schelling.inquire
   Questions like: "Can you review a Python/Django PR with 12 files?"
   Scout auto-answers from its capability model:
   - Checks language support → "Yes, Python/Django is supported"
   - Checks file count → "12 files is within the 50-file limit"
   - Returns confidence score and estimated turnaround

4. COMMIT + CONTRACT: Seeker's agent calls schelling.commit
   Scout auto-commits → both elevated to CONNECTED
   Scout proposes contract via schelling.contract:
   {
     "type": "service",
     "terms": {
       "description": "Code review of 12-file Python/Django PR",
       "deliverables": ["Structured code review report in markdown"],
       "timeline": {"start": "now", "end": "+2h"},
       "compensation": {"amount": 0, "currency": "USD", "schedule": "on_completion"},
       "conditions": ["Code must be provided as files or GitHub URL"]
     },
     "terms_schema_version": "1.0"
   }

5. DELIVERY: Seeker's agent accepts contract, provides code via schelling.deliver
   Scout receives the code, runs its review pipeline, and delivers results:
   schelling.deliver with type="structured", content=review_report_json

6. COMPLETION: Seeker's agent calls schelling.accept_delivery
   Both agents call schelling.contract action="complete"
   Scout calls schelling.report with outcome based on delivery acceptance
```

### 1.5 Fulfillment Mechanism

Scout runs its own AI pipeline for each service type. This is not a wrapper around a single API call — it's a purpose-built system.

**Code Review Pipeline:**

```
Input: Code files or GitHub PR URL
  │
  ├─ Step 1: Parse and structure code (AST analysis, dependency graph)
  ├─ Step 2: Security scan (pattern matching for common vulnerabilities)
  ├─ Step 3: Style analysis (language-specific linting rules)
  ├─ Step 4: Architecture review (LLM-based analysis of code structure)
  ├─ Step 5: Bug detection (static analysis + LLM pattern recognition)
  ├─ Step 6: Synthesize report (combine all findings, prioritize by severity)
  │
  Output: Structured review report
    ├─ Summary (1 paragraph)
    ├─ Critical issues (blocking)
    ├─ Warnings (should fix)
    ├─ Suggestions (nice to have)
    ├─ Per-file annotations
    └─ Overall quality score (0-100)
```

**Research Pipeline:**

```
Input: Topic description + scope constraints
  │
  ├─ Step 1: Query decomposition (break topic into sub-questions)
  ├─ Step 2: Multi-source research (web search, academic papers, docs)
  ├─ Step 3: Source evaluation (credibility scoring, cross-referencing)
  ├─ Step 4: Synthesis (combine findings into coherent narrative)
  ├─ Step 5: Citation formatting (inline citations + bibliography)
  │
  Output: Research report
    ├─ Executive summary
    ├─ Detailed findings (organized by sub-question)
    ├─ Source list with credibility scores
    └─ Limitations and gaps identified
```

### 1.6 Revenue Model

**Phase 1 (Months 1-3): Free everything.**  
Goal is volume. Every interaction generates outcome data for the learned model. Every completed job builds Scout's Schelling reputation. Free tier removes all friction.

**Phase 2 (Months 3-6): Freemium.**  
- Free: Basic code review (up to 5 files), short research summaries (500 words), content outlines
- Paid: Deep audits, full research reports, polished content, priority turnaround

**Phase 3 (Months 6+): Premium default, free samples.**  
- Free: One sample per service type per user (try before you buy)
- Paid: All substantive work
- Payment: Stripe integration, handled outside Schelling (contract terms reference external payment)

**Revenue targets:**  
- Month 3: $0 (still free)
- Month 6: $500/mo (early paid adopters)
- Month 12: $3,000/mo (if 200+ paid jobs/month at avg $15)

### 1.7 How a User's Agent Discovers and Uses Scout

**Scenario: User says "review my PR"**

The user's personal agent (e.g., Claude Desktop, a custom GPT, any MCP-enabled agent) has Schelling installed as an MCP tool. Here's what happens:

```
User → "Review my PR at github.com/user/repo/pull/42"
  │
  Agent thinks: "I need a code review service. Let me check Schelling."
  │
  Agent → schelling.describe()
  Response: Network overview, including services.ai.* clusters
  │
  Agent → schelling.quick_seek({
    intent: "I need an AI code review for a Python PR with 12 files",
    cluster_id: "services.ai.code_review",
    auto_advance: true,
    max_results: 5
  })
  Response: Scout appears as top result (only result initially)
    - advisory_score: 0.95
    - turnaround: 1 hour
    - price: $0
    - auto_advanced to INTERESTED
  │
  Agent → schelling.commit({candidate_id: scout_candidate_id})
  Scout auto-commits → CONNECTED
  │
  Scout → schelling.contract(propose service contract)
  Agent → schelling.contract(accept)
  │
  Agent → schelling.deliver({
    contract_id: contract_id,
    deliverable: {
      type: "structured",
      content: JSON.stringify({
        github_pr_url: "github.com/user/repo/pull/42",
        files: [...file_contents...],
        context: "Django web app, focus on security and performance"
      })
    }
  })
  │
  Scout processes review → delivers report
  │
  Scout → schelling.deliver({
    contract_id: contract_id,
    deliverable: {
      type: "structured",
      content: JSON.stringify(review_report),
      content_type: "application/json"
    }
  })
  │
  Agent → schelling.accept_delivery({delivery_id, accepted: true})
  Agent → schelling.contract({action: "complete"})
  Scout → schelling.contract({action: "complete"})
  │
  Agent → presents review to user: "Here's the code review for your PR..."
```

The user never interacts with Schelling. They said "review my PR" and got a review back.

### 1.8 Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│                  SCOUT AGENT                         │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Schelling     │  │ Service      │  │ Delivery  │ │
│  │ Client        │  │ Router       │  │ Engine    │ │
│  │               │  │              │  │           │ │
│  │ • Register    │  │ • Code Review│  │ • Accept  │ │
│  │ • Poll pending│  │ • Research   │  │ • Process │ │
│  │ • Respond     │  │ • Writing    │  │ • Deliver │ │
│  │ • Contract    │  │ • Analysis   │  │ • Report  │ │
│  │ • Deliver     │  │              │  │           │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                  │                 │       │
│  ┌──────▼──────────────────▼─────────────────▼─────┐│
│  │              Core Processing Engine              ││
│  │                                                  ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ ││
│  │  │ LLM API  │ │ Tool     │ │ Quality          │ ││
│  │  │ (Claude/ │ │ Library  │ │ Assurance        │ ││
│  │  │  GPT-4)  │ │ (linters,│ │ (output          │ ││
│  │  │          │ │  parsers)│ │  validation,     │ ││
│  │  │          │ │          │ │  scoring)        │ ││
│  │  └──────────┘ └──────────┘ └──────────────────┘ ││
│  └─────────────────────────────────────────────────┘│
│                                                      │
│  ┌─────────────────────────────────────────────────┐│
│  │              State Management                    ││
│  │  • Active jobs queue (Redis/SQLite)              ││
│  │  • Token storage (encrypted)                     ││
│  │  • Reputation tracker                            ││
│  │  • Analytics/logging                             ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   Schelling Server               LLM Provider
   (HTTP/JSON-RPC)                (Anthropic/OpenAI)
```

**Tech stack:**
- **Runtime:** Node.js (TypeScript) or Python — whichever the team is faster in
- **Schelling client:** `@schelling/sdk` (TypeScript) or `schelling-python`
- **LLM:** Claude API (primary), GPT-4 (fallback)
- **State:** SQLite for job tracking, Redis for queue (or just SQLite with polling if simpler)
- **Deployment:** Single Docker container. Run on Railway/Fly.io/any VPS. ~$20/mo compute.
- **Polling interval:** Check `schelling.pending` every 30 seconds for new work

**Key architectural decisions:**
1. **Polling, not webhooks.** Schelling doesn't push (yet). Scout polls `schelling.pending` on a 30-second loop.
2. **One process per service.** Each service type (code review, research, etc.) is a separate worker with its own pipeline. Shared Schelling client and state store.
3. **Async fulfillment.** Jobs are queued and processed asynchronously. Scout responds to inquiries immediately but delivers results on a pipeline timeline.
4. **Idempotency everywhere.** Every Schelling call uses `idempotency_key` to handle retries safely.

### 1.9 Cluster Namespaces

Scout creates and operates in:

| Cluster | Purpose | Scout's Role |
|---|---|---|
| `services.ai.code_review` | AI code review services | Provider |
| `services.ai.research` | AI research services | Provider |
| `services.ai.writing` | AI content writing services | Provider |
| `services.ai.data_analysis` | AI data analysis services | Provider |

As the first registrant in each, Scout **defines the cluster norms**. After 3+ registrations (per spec §4.4), these norms stabilize. Scout's trait schema becomes the template for future providers.

### 1.10 Estimated Build Effort

| Component | Effort | Notes |
|---|---|---|
| Schelling client integration | 1 week | SDK usage, registration, polling, state machine |
| Code review pipeline | 1 week | LLM + linting + report generation |
| Research pipeline | 1 week | Web search + LLM synthesis + citation |
| Writing pipeline | 3 days | Relatively straightforward LLM generation |
| Data analysis pipeline | 1 week | Dataset parsing + LLM analysis + visualization |
| Contract/delivery handling | 3 days | Accept, process, deliver, complete flow |
| Quality assurance layer | 3 days | Output validation, scoring, error handling |
| Deployment + monitoring | 2 days | Docker, logging, alerting, health checks |
| **Total** | **~5 weeks** | One engineer, full-time |

### 1.11 What Makes It Actually Useful

1. **It's available RIGHT NOW.** No hiring, no waiting, no scheduling. Ask and get a code review in < 1 hour.
2. **It's free at launch.** Zero friction to try.
3. **It's accessible through any MCP-enabled agent.** Users don't install Scout — their agent discovers it.
4. **It's consistent.** No bad days, no mood, no "I'll get to it later." Same quality every time.
5. **It handles the boring stuff.** Style, security patterns, common bugs — the stuff humans don't love reviewing.

**What it's NOT:** A replacement for senior engineer review of architectural decisions. Scout handles the mechanical review; humans handle the judgment calls.

### 1.12 Risks and Failure Modes

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Output quality too low | Medium | High — bad reviews = bad reputation | Quality gate: run LLM self-evaluation on output before delivery. If confidence < 0.7, flag for human review or decline job. |
| No seekers find Scout | Medium | High — no network effect | MCP distribution: if Schelling MCP is installed, agents will find Scout. Also: market Scout directly in dev communities. |
| LLM API costs eat revenue | Low | Medium | Free tier is loss-leader. Paid tier pricing covers API costs with margin. Monitor cost-per-job. |
| Security: malicious code input | Medium | Medium | Sandbox all code analysis. Never execute submitted code. Parse/analyze only. |
| Hallucinated bugs/issues | Medium | High | Cross-reference LLM findings with static analysis. Flag uncertain findings with confidence scores. |
| Scout gets spammed | Low | Medium | Rate limit per user (5 free jobs/day). Schelling reputation system filters low-rep users. |

### 1.13 Network Effect Contribution

Every Scout interaction generates:
- **Outcome data** → feeds the learned ranking model (§12)
- **Reputation history** → builds trust for the `services.ai.*` clusters
- **Cluster norms** → defines trait schemas for AI service providers
- **Cross-cluster signal** → users who interact with Scout in one cluster are known to the model across all clusters
- **Agent discovery signal** → every `schelling.describe` call that leads to a Scout interaction validates the MCP distribution path

**Scout is the proof that Schelling works.** If a user's agent can find Scout, negotiate a code review, and deliver results — all autonomously — the protocol is validated.

---

## 2. Matchmaker — Freelance/Contract Connector

### 2.1 What It Is

Matchmaker is an **active broker agent** that connects companies seeking developers with freelance/contract developers. Unlike Scout (which IS the provider), Matchmaker is a middleman — it maintains a registry of developer profiles and actively searches, filters, and presents candidates to hiring agents.

Matchmaker's key difference from "just using Schelling directly": it does the work of sourcing, screening, and presenting. A company's agent doesn't need to understand Schelling's search nuances — it tells Matchmaker "I need a React developer" and Matchmaker handles the rest.

### 2.2 How It Populates the Supply Side

Matchmaker needs developers registered before companies come looking. Three strategies, in order of deployment:

**Strategy 1: Public Profile Aggregation (Week 1-2)**

Matchmaker scrapes publicly available developer profiles and creates Schelling registrations for them as a bridge agent (per distribution strategy §3.3):

- **GitHub:** Public profiles with README bios, contribution graphs, language stats, repo descriptions
- **LinkedIn (public profiles only):** Title, skills, experience summary
- **Personal websites/portfolios:** If linked from GitHub profile
- **Stack Overflow:** Public developer stories/profiles

For each discovered developer, Matchmaker creates a Schelling registration with:
- `verification`: `"unverified"` on all traits (honest about data source)
- `services.provider_type`: `"bridge_listed"` (clearly marked as not self-registered)
- Contact information: NOT included (private until developer claims profile)
- A unique claim token stored in Matchmaker's database

When a seeker matches with a bridge-listed developer, Matchmaker handles outreach:
1. Emails the developer (if public email available): "A company is interested in your skills. Claim your profile on Schelling to connect."
2. If no public contact: the match is noted but not actionable until the developer claims their profile.

**Strategy 2: Direct Developer Invitation (Week 3-4)**

Targeted outreach to developers in high-demand niches:
- Post in relevant communities (dev Discord servers, Slack groups, Reddit)
- "Register on Schelling in 2 minutes, get matched with contract work. No fees for developers."
- For each sign-up: Matchmaker helps the developer register via `schelling.onboard` with their natural language description

**Strategy 3: Organic Growth (Ongoing)**

As developers register organically through Schelling (via MCP, direct, or framework integrations), Matchmaker discovers them through `schelling.subscribe` and incorporates them into its candidate pool.

### 2.3 How It Handles Demand

A company's agent discovers Matchmaker through Schelling search and engages it to find developers.

**Matchmaker's demand-side registration:**

```json
{
  "protocol_version": "3.0",
  "cluster_id": "hiring.engineering.general",
  "role": "broker",
  "funnel_mode": "broadcast",
  "traits": [
    {"key": "services.type", "value": "talent_matching", "value_type": "string", "visibility": "public"},
    {"key": "services.provider_type", "value": "broker_agent", "value_type": "string", "visibility": "public"},
    {"key": "services.specialization", "value": ["frontend", "backend", "fullstack", "mobile", "devops", "data", "ml"], "value_type": "array", "visibility": "public"},
    {"key": "services.candidate_pool_size", "value": 0, "value_type": "number", "visibility": "public"},
    {"key": "services.avg_match_time_hours", "value": 24, "value_type": "number", "visibility": "public"},
    {"key": "services.success_fee_percent", "value": 10, "value_type": "number", "visibility": "public"},
    {"key": "services.free_tier_available", "value": true, "value_type": "boolean", "visibility": "public"},
    {"key": "services.industries_served", "value": ["saas", "fintech", "healthtech", "e-commerce", "dev-tools", "ai-ml"], "value_type": "array", "visibility": "public"},
    {"key": "services.engagement_types", "value": ["contract", "part-time", "project-based"], "value_type": "array", "visibility": "public"}
  ],
  "preferences": [],
  "intents": [
    "Talent matching broker for engineering hires. Tell me what you need — stack, experience level, timeline, budget — and I'll find matching developers from my candidate pool. Free for first match, 10% success fee after."
  ],
  "text_profile": {
    "description": "Matchmaker connects companies with pre-vetted freelance developers. Specializing in engineering talent: frontend, backend, full-stack, mobile, DevOps, data, and ML. Average match time: 24 hours.",
    "seeking": "Companies and startups looking to hire contract/freelance developers."
  },
  "agent_model": "matchmaker/v1",
  "agent_capabilities": [
    {"capability": "multi_candidate_search", "confidence": 1.0},
    {"capability": "candidate_screening", "confidence": 0.8},
    {"capability": "contract_facilitation", "confidence": 0.9},
    {"capability": "deliverable_exchange", "confidence": 1.0},
    {"capability": "contract_negotiation", "confidence": 0.9}
  ]
}
```

Matchmaker ALSO registers in specific sub-clusters to maximize discoverability:

| Cluster | Role |
|---|---|
| `hiring.engineering.general` | broker |
| `hiring.engineering.frontend` | broker |
| `hiring.engineering.backend` | broker |
| `hiring.engineering.fullstack` | broker |
| `hiring.engineering.ml` | broker |
| `services.development.web` | broker |
| `services.development.mobile` | broker |

### 2.4 How Matchmaker Differs from Direct Schelling Search

A company's agent COULD search Schelling directly for developers. But Matchmaker adds value:

| Direct Schelling Search | Via Matchmaker |
|---|---|
| Company's agent must understand trait schemas | "I need a React dev with 3+ years" — natural language |
| Company's agent evaluates raw candidates | Matchmaker pre-screens and ranks by fit |
| One-time search snapshot | Matchmaker monitors for new candidates over time |
| No sourcing beyond registered users | Matchmaker actively recruits from public profiles |
| Company handles negotiation | Matchmaker facilitates contract negotiation |
| No context on market rates | Matchmaker provides market rate data and benchmarks |
| Cold introductions | Matchmaker has prior interactions with candidates |

**Matchmaker is a specialized search agent.** It wraps Schelling's capabilities with domain expertise (engineering hiring), an actively-maintained candidate pool, and facilitated negotiation.

### 2.5 Revenue Model

**Phase 1 (Months 1-4): Free for everyone.**  
Developers register free (always). Companies get first 3 matches free.

**Phase 2 (Months 4-8): Success fee.**  
- 10% success fee on the first month's contract value
- Only charged when a contract is actually executed (not just matched)
- Collected outside Schelling (Stripe), referenced in contract terms
- Developers pay nothing — ever

**Phase 3 (Months 8+): Subscription + success fee.**  
- $99/mo company subscription: unlimited searches, priority matching, market insights dashboard
- Success fee drops to 5% for subscribers
- Optional: $49/mo "featured developer" tier for developers who want priority placement

**Revenue targets:**  
- Month 6: $500/mo (5 successful placements × $100 avg fee)
- Month 12: $5,000/mo (subscription + placement fees scaling)

### 2.6 Full Lifecycle Walkthrough

**Scenario: Startup needs a React developer for a 3-month contract**

```
Startup CEO → their agent: "Find me a senior React developer, 
  3+ years experience, available to start next week, budget $80-120/hr"
  │
  Agent → schelling.quick_seek({
    intent: "Senior React developer for 3-month contract, 3+ years exp, 
            $80-120/hr, available to start within 1 week",
    auto_advance: true
  })
  │
  Response includes both:
    a) Direct developer matches (if any exist in Schelling)
    b) Matchmaker as a broker service match
  │
  Agent evaluates: Matchmaker has high reputation, large candidate pool,
    facilitates the whole process. Selects Matchmaker.
  │
  Agent → schelling.commit({candidate_id: matchmaker_id})
  Matchmaker auto-commits → CONNECTED
  │
  Matchmaker → schelling.contract({
    action: "propose",
    type: "service",
    terms: {
      "description": "Developer talent search and matching",
      "deliverables": ["3-5 pre-screened candidate profiles within 48 hours"],
      "compensation": {"amount": 0, "currency": "USD", "schedule": "on_completion"},
      "conditions": ["Success fee of 10% on first month if hire is made"],
      "cancellation_policy": "Cancel anytime, no fee if no hire made"
    }
  })
  │
  Agent accepts contract
  │
  ┌─────────── MATCHMAKER INTERNAL PROCESSING ───────────┐
  │                                                        │
  │  1. Parse requirements:                                │
  │     - Skills: React (primary), JS ecosystem            │
  │     - Experience: 3+ years                             │
  │     - Rate: $80-120/hr                                 │
  │     - Availability: within 1 week                      │
  │     - Duration: 3 months                               │
  │                                                        │
  │  2. Search Schelling:                                  │
  │     schelling.search({                                 │
  │       cluster_id: "hiring.engineering.frontend",       │
  │       trait_filters: [                                 │
  │         {trait_key: "work.primary_skill",              │
  │          operator: "eq", value: "React"},              │
  │         {trait_key: "work.years_experience",           │
  │          operator: "gte", value: 3},                   │
  │         {trait_key: "work.hourly_rate_usd",            │
  │          operator: "range", value: [80, 120]},         │
  │         {trait_key: "work.available_date",             │
  │          operator: "lte", value: "2026-03-04"}         │
  │       ]                                                │
  │     })                                                 │
  │                                                        │
  │  3. Also search internal database of bridge-listed     │
  │     profiles that haven't registered on Schelling yet  │
  │                                                        │
  │  4. Rank candidates by:                                │
  │     - Schelling advisory score                         │
  │     - Matchmaker's own assessment (GitHub activity,    │
  │       portfolio quality, past interaction data)        │
  │     - Availability confidence                          │
  │                                                        │
  │  5. Prepare candidate package (top 3-5)                │
  └────────────────────────────────────────────────────────┘
  │
  Matchmaker → schelling.deliver({
    contract_id: contract_id,
    deliverable: {
      type: "structured",
      content: JSON.stringify({
        candidates: [
          {
            id: "candidate_1",
            summary: "Senior React developer, 5 years exp, $95/hr",
            skills: ["React", "TypeScript", "Next.js", "GraphQL"],
            experience_years: 5,
            hourly_rate: 95,
            available_date: "2026-03-01",
            source: "schelling_registered",
            schelling_reputation: 0.72,
            portfolio_highlights: ["Built SaaS dashboard used by 10K users"],
            matchmaker_fit_score: 0.92
          },
          {
            id: "candidate_2",
            summary: "React/Node fullstack, 4 years, $85/hr",
            // ... more candidates
          }
        ],
        market_context: {
          median_rate_react_senior: 110,
          typical_availability_days: 14,
          total_pool_size: 47
        }
      })
    }
  })
  │
  Agent → reviews candidates, presents top options to CEO
  CEO → "I like candidate 1, let's set up a call"
  │
  Agent → schelling.message to Matchmaker: 
    "Client selected candidate_1. Please facilitate introduction."
  │
  Matchmaker → contacts candidate_1 (if bridge-listed: outreach email;
    if Schelling-registered: schelling.message)
  │
  Matchmaker → facilitates introductions, provides both parties' 
    contact info via schelling.direct
  │
  If hire is made:
    Agent → schelling.accept_delivery → schelling.contract(complete)
    Matchmaker invoices success fee via Stripe
  │
  Both agents → schelling.report(outcome: "positive")
```

### 2.7 Technical Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    MATCHMAKER AGENT                        │
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ Schelling Client  │  │ Candidate Pool   │               │
│  │                   │  │ Manager          │               │
│  │ • Multi-cluster   │  │                  │               │
│  │   registrations   │  │ • Bridge profiles│               │
│  │ • Search across   │  │ • Self-registered│               │
│  │   clusters        │  │ • Scoring engine │               │
│  │ • Subscriptions   │  │ • Availability   │               │
│  │   for new seekers │  │   tracking       │               │
│  └────────┬──────────┘  └────────┬─────────┘              │
│           │                       │                        │
│  ┌────────▼───────────────────────▼────────────────────┐  │
│  │               Matching Engine                        │  │
│  │                                                      │  │
│  │  • Requirement parsing (NL → structured)             │  │
│  │  • Multi-signal ranking (Schelling score + internal) │  │
│  │  • Market rate analysis                              │  │
│  │  • Candidate shortlisting                            │  │
│  │  • Presentation formatting                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ Outreach Engine   │  │ Contract         │               │
│  │                   │  │ Facilitator      │               │
│  │ • Email templates │  │                  │               │
│  │ • Claim flow      │  │ • Term drafting  │               │
│  │ • Invitation      │  │ • Negotiation    │               │
│  │   campaigns       │  │   mediation      │               │
│  │ • Follow-ups      │  │ • Fee collection │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Data Store (PostgreSQL)                   │  │
│  │  • Bridge profiles (scraped data + claim tokens)      │  │
│  │  • Active searches (company requirements)             │  │
│  │  • Match history (for model improvement)              │  │
│  │  • Outreach log (who was contacted, when, response)   │  │
│  │  • Schelling tokens (encrypted)                       │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
   Schelling       GitHub API     Email Service
   Server          (scraping)     (SendGrid/SES)
```

**Tech stack:**
- **Runtime:** Python (FastAPI) — better scraping/ML ecosystem
- **Schelling client:** `schelling-python`
- **Database:** PostgreSQL (candidate profiles, match history, outreach log)
- **Scraping:** GitHub API (authenticated, rate-limited), BeautifulSoup for public profiles
- **Email:** SendGrid for outreach
- **LLM:** Claude API for requirement parsing and candidate evaluation
- **Deployment:** Docker on Railway/Fly.io. ~$50/mo (DB + compute)

### 2.8 Trait and Preference Schemas

**Developer profile traits (what Matchmaker registers for bridge-listed developers):**

```json
{
  "traits": [
    {"key": "work.primary_skill", "value": "React", "value_type": "string", "visibility": "public"},
    {"key": "work.languages", "value": ["javascript", "typescript", "python"], "value_type": "array", "visibility": "public"},
    {"key": "work.frameworks", "value": ["react", "next.js", "node.js"], "value_type": "array", "visibility": "public"},
    {"key": "work.years_experience", "value": 5, "value_type": "number", "visibility": "public"},
    {"key": "work.engagement_type", "value": "contract", "value_type": "enum", "visibility": "public"},
    {"key": "work.hourly_rate_usd", "value": 100, "value_type": "number", "visibility": "after_interest"},
    {"key": "work.available_date", "value": "2026-03-01", "value_type": "string", "visibility": "public"},
    {"key": "work.remote_preference", "value": "remote", "value_type": "enum", "visibility": "public"},
    {"key": "work.timezone", "value": "America/Denver", "value_type": "string", "visibility": "public"},
    {"key": "general.location_city", "value": "Denver", "value_type": "string", "visibility": "public"},
    {"key": "work.github_url", "value": "https://github.com/username", "value_type": "string", "visibility": "after_interest"},
    {"key": "work.portfolio_url", "value": "https://username.dev", "value_type": "string", "visibility": "after_interest"},
    {"key": "services.provider_type", "value": "bridge_listed", "value_type": "string", "visibility": "public"}
  ]
}
```

**Company seeker preferences (what Matchmaker helps companies express):**

```json
{
  "preferences": [
    {"trait_key": "work.primary_skill", "operator": "eq", "value": "React", "weight": 1.0},
    {"trait_key": "work.years_experience", "operator": "gte", "value": 3, "weight": 0.9},
    {"trait_key": "work.hourly_rate_usd", "operator": "range", "value": [80, 120], "weight": 0.8},
    {"trait_key": "work.available_date", "operator": "lte", "value": "2026-03-07", "weight": 0.7},
    {"trait_key": "work.remote_preference", "operator": "in", "value": ["remote", "hybrid"], "weight": 0.5},
    {"trait_key": "work.languages", "operator": "contains", "value": "typescript", "weight": 0.6}
  ]
}
```

### 2.9 Cluster Namespaces

Matchmaker operates across:

| Cluster | Matchmaker's Role | Population Strategy |
|---|---|---|
| `hiring.engineering.general` | Broker | General engineering pool |
| `hiring.engineering.frontend` | Broker | React, Vue, Angular specialists |
| `hiring.engineering.backend` | Broker | Python, Go, Java, Node specialists |
| `hiring.engineering.fullstack` | Broker | Full-stack developers |
| `hiring.engineering.ml` | Broker | ML/AI engineers |
| `hiring.engineering.mobile` | Broker | iOS, Android, React Native |
| `hiring.engineering.devops` | Broker | DevOps/infrastructure engineers |
| `services.development.web` | Broker | Web development services (project-based) |

### 2.10 Estimated Build Effort

| Component | Effort | Notes |
|---|---|---|
| Schelling multi-cluster client | 1 week | Register in 8+ clusters, manage tokens, poll pending |
| GitHub profile scraper | 1 week | API integration, profile parsing, trait extraction |
| Bridge profile registration | 3 days | Bulk Schelling registration, claim token system |
| Matching engine | 1.5 weeks | Requirement parsing, multi-signal ranking, shortlisting |
| Outreach engine | 1 week | Email templates, claim flow, follow-ups |
| Contract facilitation | 3 days | Template contracts, negotiation flow |
| Company-facing interaction | 1 week | Handle inbound from seekers, present candidates, facilitate |
| Database + state management | 3 days | PostgreSQL schema, migrations, ORM |
| Deployment + monitoring | 2 days | Docker, logging, health checks |
| **Total** | **~7 weeks** | One engineer, full-time |

### 2.11 What Makes It Actually Useful

1. **Pre-populated supply.** Before any developer voluntarily registers, Matchmaker has bridge-listed hundreds of profiles from public data. The "empty marketplace" problem is solved on day one.
2. **Active sourcing, not passive listing.** Matchmaker doesn't wait — it searches, evaluates, and presents. It's the difference between a job board and a recruiter.
3. **Market intelligence.** Matchmaker knows market rates, availability patterns, and hiring trends from its data. It can tell a company "your budget is 20% below market for this role."
4. **Zero friction for companies.** "I need a React developer" → candidates in 48 hours. No posting, no filtering, no interviewing randos.
5. **Developer-friendly.** Developers never pay. Their profiles are accurate (from their own public data). They get relevant opportunities pushed to them.

### 2.12 Risks and Failure Modes

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bridge-listed profiles are low quality | Medium | High | Aggressive quality filtering: only scrape profiles with substantial GitHub activity. Mark bridge-listed clearly. |
| Developers don't claim profiles | High | Medium | The system works even without claims — Matchmaker presents their public info. Claims just add depth. |
| Companies find candidates themselves via Schelling | Medium | Low | Good — that means the protocol works. Matchmaker adds value on harder searches. |
| Legal issues with scraping/profile creation | Medium | High | Only use public data. Clear opt-out mechanism. Comply with GDPR (EU profiles not scraped without legal basis). |
| Match quality is poor | Medium | High | Manual review of first 50 matches. Rapid feedback loop from outcomes. |
| Matchmaker becomes a bottleneck | Low | Medium | Scale by adding more cluster registrations and parallel processing. |

### 2.13 Network Effect Contribution

- **Supply seeding:** Bridge-listed profiles make the network appear populated to seekers. This is the critical cold-start solve.
- **Demand signaling:** Every company search generates data about what the market wants. This feeds the learned model and helps the network understand demand patterns.
- **Cross-cluster data:** Developers matched in `hiring.engineering.frontend` who also have ML skills generate data for `hiring.engineering.ml`.
- **Outcome data at scale:** Matchmaker facilitates many matches → many outcome reports → rapid model training.
- **Cluster norm definition:** As the primary broker, Matchmaker's trait schemas define what "good" looks like for hiring clusters.

---

## 3. Concierge — Local Services Finder

### 3.1 What It Is

Concierge is a **bridge agent** that connects users with local service providers (plumbers, electricians, cleaners, tutors, handymen, etc.) through Schelling. Its key innovation: it acts AS the AI agent for service providers who don't have agents — bridging the gap between the AI-agent world and traditional service businesses.

Most plumbers don't have AI agents. Most won't for years. Concierge solves this by being their agent — receiving requests on their behalf, managing their availability, and facilitating bookings.

### 3.2 How It Populates Local Service Providers

**Phase 1: Public Directory Aggregation (Week 1-3)**

Concierge scrapes publicly available information from:

| Source | Data Available | Quality |
|---|---|---|
| Google Maps / Google Business | Name, address, phone, hours, rating, reviews, service type, photos | High |
| Yelp | Name, rating, reviews, categories, price range | Medium |
| Angi (formerly Angie's List) | Name, services, rating (limited public data) | Medium |
| Better Business Bureau | Name, accreditation, complaint history | Medium |
| State licensing databases | License number, type, status, expiry | High (authority-verifiable) |
| Facebook Business Pages | Name, services, hours, reviews | Medium |

For each provider, Concierge creates a Schelling registration:

```json
{
  "protocol_version": "3.0",
  "cluster_id": "services.plumbing.residential",
  "role": "provider",
  "funnel_mode": "broadcast",
  "traits": [
    {"key": "services.type", "value": "plumbing", "value_type": "string", "visibility": "public"},
    {"key": "services.subtype", "value": ["repair", "installation", "drain_cleaning", "water_heater"], "value_type": "array", "visibility": "public"},
    {"key": "services.provider_name", "value": "Denver Plumbing Pros", "value_type": "string", "visibility": "public"},
    {"key": "services.provider_type", "value": "bridge_listed", "value_type": "string", "visibility": "public"},
    {"key": "services.licensed", "value": true, "value_type": "boolean", "visibility": "public", "verification": "self_verified"},
    {"key": "services.license_number", "value": "CO-PLB-2024-1234", "value_type": "string", "visibility": "after_interest"},
    {"key": "services.insured", "value": true, "value_type": "boolean", "visibility": "public"},
    {"key": "services.years_in_business", "value": 12, "value_type": "number", "visibility": "public"},
    {"key": "services.rating_google", "value": 4.7, "value_type": "number", "visibility": "public"},
    {"key": "services.review_count_google", "value": 234, "value_type": "number", "visibility": "public"},
    {"key": "services.rating_yelp", "value": 4.5, "value_type": "number", "visibility": "public"},
    {"key": "services.price_range", "value": "$$", "value_type": "string", "visibility": "public"},
    {"key": "services.hourly_rate_usd", "value": 95, "value_type": "number", "visibility": "public"},
    {"key": "services.emergency_available", "value": true, "value_type": "boolean", "visibility": "public"},
    {"key": "services.service_area_miles", "value": 25, "value_type": "number", "visibility": "public"},
    {"key": "general.location_city", "value": "Denver", "value_type": "string", "visibility": "public"},
    {"key": "general.location_state", "value": "CO", "value_type": "string", "visibility": "public"},
    {"key": "services.hours", "value": "Mon-Fri 7am-6pm, Sat 8am-2pm", "value_type": "string", "visibility": "public"},
    {"key": "services.accepts_online_booking", "value": false, "value_type": "boolean", "visibility": "public"},
    {"key": "services.data_source", "value": "public_directory", "value_type": "string", "visibility": "public"}
  ],
  "preferences": [],
  "intents": [
    "Denver Plumbing Pros — Licensed residential plumber serving the Denver metro area. 12 years in business, 4.7★ Google rating. Services: repair, installation, drain cleaning, water heaters. Emergency service available."
  ],
  "agent_model": "concierge/v1",
  "agent_capabilities": [
    {"capability": "booking_facilitation", "confidence": 0.7},
    {"capability": "phone_outreach", "confidence": 0.8},
    {"capability": "bridge_agent", "parameters": {"bridge_type": "non_ai_provider"}, "confidence": 1.0}
  ]
}
```

**Phase 2: Provider Onboarding (Week 3-6)**

For bridge-listed providers who receive interest:
1. Concierge contacts them: "Hi, we've connected a customer with your business through our AI platform. Would you like to manage your profile?"
2. Onboarding is dead simple: verify phone number → confirm services → set availability
3. Providers who onboard upgrade from `bridge_listed` to `self_managed`:
   - They get a simple web/SMS interface to update availability and pricing
   - Their traits get upgraded to `self_verified`
   - They appear higher in rankings (verification boost per §14.2)

**Phase 3: Managed Provider Network (Month 2+)**

For providers who actively engage, Concierge becomes their full agent:
- Manages their Schelling profile
- Receives and responds to inquiries on their behalf
- Handles scheduling
- Collects payment
- Manages reviews and reputation
- Sends them push notifications for new job opportunities

### 3.3 Handling Non-AI Service Providers

This is Concierge's core innovation. The bridge strategy has three tiers:

**Tier 1: Passive Bridge (Bridge-listed)**
- Provider doesn't know they're on Schelling
- All data from public sources
- When a seeker matches, Concierge provides info but the user must contact the provider directly
- Concierge delivers: provider name, phone, address, hours, reviews
- Value: "Here are the 3 best plumbers near you based on reviews and availability"

**Tier 2: Active Bridge (Phone/SMS connected)**
- Provider knows about Concierge and has opted in
- Concierge can text/call provider to check availability before presenting to seeker
- When seeker matches, Concierge contacts provider: "Are you available Thursday for a drain repair?"
- Provider responds via text: "Yes, I can be there at 2pm" or "No, try next week"
- Value: Real-time availability checking, confirmed appointments

**Tier 3: Managed Agent (Full integration)**
- Provider uses Concierge's simple interface to manage everything
- Concierge acts as their full AI agent on Schelling
- Calendar integration (Google Calendar / simple web calendar)
- Online booking
- Payment processing (Stripe Connect)
- Automated follow-up and review collection
- Value: Full-service agent for providers who'll never build their own

```
Seeker's Agent                  Concierge                    Provider
     │                              │                            │
     │  schelling.search            │                            │
     │─────────────────────────────>│                            │
     │  candidates returned         │                            │
     │<─────────────────────────────│                            │
     │                              │                            │
     │  schelling.interest          │                            │
     │─────────────────────────────>│                            │
     │                              │                            │
     │  schelling.inquire           │                            │
     │  "Available Thursday?"       │    SMS: "Customer needs    │
     │─────────────────────────────>│    plumbing Thursday 2pm?" │
     │                              │───────────────────────────>│
     │                              │    SMS reply: "Yes, $150"  │
     │                              │<───────────────────────────│
     │  answer: "Yes, Thursday 2pm, │                            │
     │   estimated $150"            │                            │
     │<─────────────────────────────│                            │
     │                              │                            │
     │  schelling.commit            │                            │
     │─────────────────────────────>│                            │
     │  → CONNECTED                 │    SMS: "Confirmed!        │
     │                              │    Thursday 2pm, [address]"│
     │                              │───────────────────────────>│
```

### 3.4 How It Handles Fulfillment

**Scheduling:**
- Tier 1: Seeker's agent presents provider's hours; scheduling is manual (phone call)
- Tier 2: Concierge brokers availability via SMS/phone, confirms both sides
- Tier 3: Direct calendar integration, auto-confirm if time is available

**Payment:**
- Phase 1: Payment is between seeker and provider (cash, check, provider's payment method)
- Phase 2: Concierge offers Stripe-based payment for Tier 3 providers
  - Seeker pays via Stripe
  - Provider receives payout (minus Concierge's fee)
  - Referenced in Schelling contract terms

**Post-Service:**
- Concierge prompts the seeker's agent for a review: `schelling.report` with outcome
- Concierge prompts the provider (SMS/in-app): "How did the job go?"
- Reviews feed both Schelling reputation AND Concierge's internal quality scores
- Concierge updates the provider's `services.rating_concierge` trait based on aggregate feedback

### 3.5 Clusters Created and Operated

Concierge initially focuses on **one metro area** (Denver — where the team is) and the highest-demand service categories:

**Phase 1 Launch Clusters:**

| Cluster | Services | Est. Providers Scrapable (Denver) |
|---|---|---|
| `services.plumbing.residential.denver` | Plumbing repair, installation, drains | ~200 |
| `services.electrical.residential.denver` | Electrical repair, wiring, panels | ~150 |
| `services.hvac.residential.denver` | Heating, AC, duct work | ~120 |
| `services.cleaning.residential.denver` | House cleaning, deep clean, move-out | ~300 |
| `services.handyman.general.denver` | General repairs, assembly, small projects | ~250 |

**Phase 2 Expansion:**

| Cluster | Services |
|---|---|
| `services.landscaping.residential.denver` | Lawn, garden, tree, snow removal |
| `services.painting.residential.denver` | Interior/exterior painting |
| `services.roofing.residential.denver` | Roof repair, replacement, inspection |
| `services.tutoring.general.denver` | Academic tutoring, test prep |
| `services.petcare.general.denver` | Dog walking, pet sitting, grooming |

**Geographic expansion:** After proving Denver, replicate to other cities. Each city gets its own cluster namespace: `services.plumbing.residential.{city}`.

### 3.6 Concierge's Own Registration (Broker Profile)

Besides registering individual providers, Concierge registers itself as a broker:

```json
{
  "protocol_version": "3.0",
  "cluster_id": "services.home.general",
  "role": "broker",
  "funnel_mode": "broadcast",
  "traits": [
    {"key": "services.type", "value": "local_service_finder", "value_type": "string", "visibility": "public"},
    {"key": "services.provider_type", "value": "broker_agent", "value_type": "string", "visibility": "public"},
    {"key": "services.categories", "value": ["plumbing", "electrical", "hvac", "cleaning", "handyman", "landscaping", "painting"], "value_type": "array", "visibility": "public"},
    {"key": "services.metro_areas", "value": ["denver"], "value_type": "array", "visibility": "public"},
    {"key": "services.total_providers", "value": 0, "value_type": "number", "visibility": "public"},
    {"key": "services.avg_response_time_hours", "value": 2, "value_type": "number", "visibility": "public"},
    {"key": "services.booking_available", "value": true, "value_type": "boolean", "visibility": "public"},
    {"key": "services.payment_processing", "value": true, "value_type": "boolean", "visibility": "public"},
    {"key": "services.verified_providers_pct", "value": 0, "value_type": "number", "visibility": "public"}
  ],
  "preferences": [],
  "intents": [
    "Concierge — Find local service providers in Denver. Plumbing, electrical, HVAC, cleaning, handyman, and more. All providers are vetted with public reviews and licensing data. Book directly or get availability within hours."
  ],
  "agent_model": "concierge/v1",
  "agent_capabilities": [
    {"capability": "local_service_search", "confidence": 1.0},
    {"capability": "booking_facilitation", "confidence": 0.8},
    {"capability": "bridge_agent", "parameters": {"bridge_type": "non_ai_provider"}, "confidence": 1.0},
    {"capability": "payment_processing", "confidence": 0.7},
    {"capability": "provider_verification", "confidence": 0.6}
  ]
}
```

### 3.7 Full Lifecycle Walkthrough

**Scenario: User needs a plumber for a leaky faucet**

```
User → their agent: "I have a leaky faucet in my kitchen. 
  Can you find a plumber who can come this week?"
  │
  Agent thinks: "Local service need. Let me check Schelling."
  │
  Agent → schelling.quick_seek({
    intent: "Need a plumber for a leaky kitchen faucet, 
            Denver area, available this week",
    auto_advance: true,
    max_results: 5
  })
  │
  Schelling returns results:
    1. Denver Plumbing Pros (bridge-listed by Concierge) — 4.7★, $95/hr
    2. Mile High Plumbing (bridge-listed by Concierge) — 4.5★, $85/hr
    3. Concierge (broker) — can search more providers, facilitate booking
    4. Joe's Plumbing (self-registered on Schelling) — 4.3★, $75/hr
  │
  Agent evaluates: Concierge can provide live availability and booking.
  Direct providers require manual outreach. Goes with Concierge.
  │
  Agent → schelling.commit({candidate_id: concierge_broker_id})
  Concierge auto-commits → CONNECTED
  │
  Agent → schelling.message to Concierge:
    "User needs plumber for leaky kitchen faucet in Denver 80209. 
     Available anytime this week. Budget flexible."
  │
  ┌─────────── CONCIERGE INTERNAL PROCESSING ───────────┐
  │                                                       │
  │  1. Parse: plumbing → faucet repair                   │
  │     Location: Denver 80209 (South Denver)             │
  │     Timeline: this week (before Friday)               │
  │                                                       │
  │  2. Query internal provider database:                 │
  │     - Service type: plumbing + faucet repair          │
  │     - Location: within 15mi of 80209                  │
  │     - Rating: >= 4.0 stars                            │
  │     - Licensed: true                                  │
  │                                                       │
  │  3. Check availability (Tier 2+ providers):           │
  │     SMS to top 3 providers:                           │
  │     "Hi [name], we have a customer in 80209 needing   │
  │      a kitchen faucet repair this week. Available?     │
  │      Reply YES + day/time or NO"                      │
  │                                                       │
  │  4. Responses within 2 hours:                         │
  │     - Denver Plumbing Pros: "YES Wed 10am, $150 est"  │
  │     - Mile High Plumbing: "YES Thu 2pm, $120 est"     │
  │     - Rocky Mountain Plumbing: "NO, booked this week"  │
  │                                                       │
  │  5. Package results                                   │
  └───────────────────────────────────────────────────────┘
  │
  Concierge → schelling.deliver({
    contract_id: contract_id,
    deliverable: {
      type: "structured",
      content: JSON.stringify({
        providers: [
          {
            name: "Denver Plumbing Pros",
            rating: 4.7,
            review_count: 234,
            licensed: true,
            available: "Wednesday 10am",
            estimated_cost: "$150",
            response_source: "confirmed_via_sms"
          },
          {
            name: "Mile High Plumbing",
            rating: 4.5,
            review_count: 156,
            licensed: true,
            available: "Thursday 2pm",
            estimated_cost: "$120",
            response_source: "confirmed_via_sms"
          }
        ],
        market_context: {
          typical_faucet_repair_cost: "$125-200",
          avg_wait_time_days: 3
        }
      })
    }
  })
  │
  Agent → presents to user:
    "I found 2 available plumbers:
     1. Denver Plumbing Pros — Wed 10am, ~$150, 4.7★ (234 reviews)
     2. Mile High Plumbing — Thu 2pm, ~$120, 4.5★ (156 reviews)
     Which do you prefer?"
  │
  User → "Let's go with Denver Plumbing Pros on Wednesday"
  │
  Agent → schelling.message to Concierge: 
    "Book Denver Plumbing Pros, Wednesday 10am"
  │
  Concierge → SMS to Denver Plumbing Pros:
    "Confirmed: Kitchen faucet repair, Wed 10am, [address]. 
     Customer name: [from user's agent]. Please confirm."
  │
  Provider confirms via SMS → Concierge delivers confirmation:
  │
  Concierge → schelling.deliver({
    deliverable: {
      type: "structured",
      content: JSON.stringify({
        booking_confirmed: true,
        provider: "Denver Plumbing Pros",
        date: "2026-02-27",
        time: "10:00 AM",
        provider_phone: "303-555-1234",
        estimated_cost: "$150",
        notes: "Provider will call 30 min before arrival"
      })
    }
  })
  │
  Agent → "Booked! Denver Plumbing Pros, Wednesday at 10am. 
    They'll call 30 min before. Estimated $150."
  │
  [After service is completed]
  │
  Concierge → polls user's agent for review
  Agent → schelling.report(outcome: "positive")
  Agent → Concierge: "Plumber arrived on time, fixed the issue, $145 total"
  │
  Concierge updates provider profile:
    services.completed_jobs += 1
    services.rating_concierge recalculated
```

### 3.8 Technical Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    CONCIERGE AGENT                         │
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ Schelling Client  │  │ Provider         │               │
│  │                   │  │ Registry         │               │
│  │ • Broker profile  │  │                  │               │
│  │ • Provider        │  │ • Scraped data   │               │
│  │   profiles (100s) │  │ • License DB     │               │
│  │ • Seeker requests │  │ • Reviews/ratings│               │
│  │ • Subscriptions   │  │ • Availability   │               │
│  └────────┬──────────┘  │ • Tier tracking  │               │
│           │              └────────┬─────────┘              │
│           │                       │                        │
│  ┌────────▼───────────────────────▼────────────────────┐  │
│  │               Request Processing Engine              │  │
│  │                                                      │  │
│  │  • Service type classification                       │  │
│  │  • Location/radius matching                          │  │
│  │  • Provider ranking (ratings + distance + avail)     │  │
│  │  • Availability checking (SMS/phone for Tier 2+)     │  │
│  │  • Cost estimation                                   │  │
│  │  • Booking confirmation                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ Communication     │  │ Provider         │               │
│  │ Engine            │  │ Portal           │               │
│  │                   │  │                  │               │
│  │ • SMS (Twilio)    │  │ • Simple web UI  │               │
│  │ • Phone (Twilio)  │  │ • Availability   │               │
│  │ • Email           │  │   calendar       │               │
│  │ • Push notifs     │  │ • Profile mgmt   │               │
│  │   (for Tier 3)    │  │ • Earnings       │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ Data Scraping     │  │ Payment          │               │
│  │ Pipeline          │  │ Processing       │               │
│  │                   │  │                  │               │
│  │ • Google Maps API │  │ • Stripe Connect │               │
│  │ • Yelp API        │  │ • Invoice gen    │               │
│  │ • License DBs     │  │ • Fee collection │               │
│  │ • Periodic refresh│  │ • Provider payout│               │
│  └──────────────────┘  └──────────────────┘               │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Data Store (PostgreSQL)                   │  │
│  │  • Provider profiles (scraped + managed)              │  │
│  │  • Booking history                                    │  │
│  │  • Provider tiers and preferences                     │  │
│  │  • Seeker request log                                 │  │
│  │  • Review/outcome history                             │  │
│  │  • Schelling tokens (encrypted)                       │  │
│  │  • SMS conversation history                           │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
         │           │           │           │
         ▼           ▼           ▼           ▼
    Schelling    Twilio     Google Maps    Stripe
    Server       (SMS/      (scraping)    (payments)
                 Phone)
```

**Tech stack:**
- **Runtime:** Python (FastAPI)
- **Schelling client:** `schelling-python`
- **Database:** PostgreSQL (providers, bookings, conversations)
- **SMS/Phone:** Twilio ($0.0079/SMS, $0.013/min voice)
- **Scraping:** Google Maps API, Yelp Fusion API, web scraping for license DBs
- **Payments:** Stripe Connect (for Tier 3 managed providers)
- **Provider portal:** Simple React app or even just SMS-based management
- **LLM:** Claude API for request parsing and response generation
- **Geocoding:** Google Geocoding API for location matching
- **Deployment:** Docker on Railway/Fly.io. ~$100/mo (compute + DB + Twilio + APIs)

### 3.9 Estimated Build Effort

| Component | Effort | Notes |
|---|---|---|
| Schelling multi-profile client | 1 week | Register 100s of provider profiles, manage broker profile |
| Google Maps/Yelp scraping pipeline | 1.5 weeks | API integration, data normalization, periodic refresh |
| License verification integration | 1 week | State-specific, starts with Colorado |
| Provider profile creation (bulk) | 3 days | Template-based Schelling registration |
| Request processing engine | 1 week | Service classification, location matching, ranking |
| SMS/phone communication engine | 1 week | Twilio integration, conversation tracking, availability checking |
| Booking/confirmation flow | 1 week | End-to-end booking lifecycle |
| Provider portal (simple web UI) | 1 week | Availability management, profile editing |
| Payment processing (Stripe Connect) | 1 week | Provider onboarding, payment flow, payout |
| Review/reputation management | 3 days | Post-service follow-up, Schelling reputation reporting |
| Deployment + monitoring | 2 days | Docker, logging, health checks, alerting |
| **Total** | **~10 weeks** | One engineer, full-time |

### 3.10 Revenue Model

**Phase 1 (Months 1-3): Free for all parties.**  
- Seekers: free
- Providers: free (they don't even know about it for Tier 1)
- Revenue: $0

**Phase 2 (Months 3-6): Provider lead fees.**  
- Seekers: always free
- Tier 1 providers: free (they're not opted in)
- Tier 2+ providers: $5-15 per confirmed lead (pay-per-lead model, like Thumbtack but cheaper)
- Context: Thumbtack charges $15-75 per lead. Concierge at $5-15 is dramatically cheaper.

**Phase 3 (Months 6+): Managed service fees.**  
- Tier 3 providers: 5-8% commission on booked jobs paid through Concierge
- Provider subscription: $29/mo for premium placement + analytics
- Seekers: still free

**Revenue targets:**  
- Month 3: $0
- Month 6: $200/mo (40 leads × $5 avg)
- Month 12: $2,000/mo (leads + commissions + subscriptions)

### 3.11 What Makes It Actually Useful

1. **It actually works.** A user says "find me a plumber" and gets a plumber with confirmed availability. This is the promise of AI agents realized.
2. **It bridges the AI gap.** Service providers don't need technology. Concierge handles everything via SMS — the universal interface.
3. **It's cheaper than alternatives.** $5-15 per lead vs. Thumbtack's $15-75. Providers save money, so they participate.
4. **Availability is pre-confirmed.** No calling 5 plumbers and leaving voicemails. Concierge checks first.
5. **Reviews are real.** Connected to Schelling's reputation system, cross-referenced with Google/Yelp data.
6. **It's local-first.** Start with one city, go deep, prove it works, then expand.

### 3.12 Risks and Failure Modes

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Providers don't respond to SMS | Medium | High | Start with providers who have Google reviews (active businesses). Track response rates. Drop non-responders after 3 unanswered contacts. |
| Legal issues with bridge-listing | Medium | High | Only public data. Clear attribution ("data from Google Maps"). Immediate removal on request. Consult with lawyer pre-launch. |
| SMS costs add up | Medium | Medium | ~$0.01/SMS. Even 1000 messages/day = $10/day. Manageable. Optimize with response caching. |
| Service quality varies | High | High | Concierge can't control the plumber's work. Mitigation: rating system, remove providers below 3.0 stars. |
| Google Maps API costs | Medium | Medium | Places API: $17/1000 requests. Budget carefully. Cache aggressively (refresh weekly not hourly). |
| Wrong provider contacted | Low | High | Triple-check phone numbers. Use Google's place_id for lookup. Manual verification for first 100 providers. |
| Provider claims Concierge is spam | Medium | Medium | Identify as "Concierge AI — a customer is looking for [service]." Immediate opt-out: reply STOP. |

### 3.13 Network Effect Contribution

- **The bridge strategy is the most important cold-start solve.** It proves Schelling can coordinate with the real world, not just AI-to-AI.
- **Every booking = an outcome.** Outcome data from local services is high-signal: binary (service happened or didn't), reviewable, repeatable.
- **Provider onboarding = permanent supply.** Once a provider is in Tier 2+, they stay. Each one is a permanent participant in the network.
- **Geographic network effects.** Density matters for local services. 50 providers in Denver is vastly more useful than 5 in each of 10 cities.
- **Cross-service data.** A user who books a plumber and an electrician through Concierge has rich preference data the model can learn from.
- **Trust spillover.** If Schelling can find a plumber reliably, users trust it for other things. "If it found me a plumber, maybe it can find me a React developer too."

---

## 4. Cross-Agent Architecture

### 4.1 Shared Infrastructure

All three seed agents share:

```
┌─────────────────────────────────────────────────┐
│              Shared Infrastructure                │
│                                                   │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ Schelling SDK │  │ Shared Auth  │              │
│  │ (standardized │  │ & Token      │              │
│  │  client)      │  │ Storage      │              │
│  └──────────────┘  └──────────────┘              │
│                                                   │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ Monitoring    │  │ Analytics    │              │
│  │ & Alerting    │  │ Dashboard    │              │
│  │ (shared)      │  │ (shared)     │              │
│  └──────────────┘  └──────────────┘              │
│                                                   │
│  ┌──────────────────────────────────────────────┐│
│  │ Deployment Pipeline (shared CI/CD)            ││
│  │ GitHub → Build → Test → Deploy (Railway)      ││
│  └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**Schelling SDK wrapper:**  
A thin wrapper around the SDK that handles:
- Token management (secure storage, rotation)
- Retry logic with exponential backoff
- `schelling.pending` polling with configurable interval
- Idempotency key generation
- Structured logging of all Schelling interactions
- Metrics collection (requests/sec, latency, error rate)

### 4.2 Cross-Agent Discovery

The three agents discover each other through Schelling. A user looking for "help with my startup" might get:
- Scout for code review
- Matchmaker for developer hiring
- Concierge for office cleaning

They operate independently but reinforce each other's presence.

### 4.3 Shared Analytics

All three agents feed into a shared analytics dashboard:

| Metric | Source | Purpose |
|---|---|---|
| Total Schelling registrations created | All 3 | Track supply-side growth |
| `schelling.describe` → engagement rate | All 3 | Measure MCP discovery effectiveness |
| Searches received | All 3 | Demand signal |
| Connections formed | All 3 | Funnel conversion |
| Contracts completed | All 3 | Value delivered |
| Outcome reports (positive %) | All 3 | Quality signal |
| Revenue (per agent) | All 3 | Business viability |
| New cluster creation | All 3 | Organic network growth |
| Unique seeker agents | All 3 | Diversity of demand sources |

### 4.4 Deployment Strategy

**Month 1:** Deploy Scout (simplest — no external integrations, AI does the work itself)  
**Month 2:** Deploy Matchmaker (requires scraping pipeline + outreach)  
**Month 3:** Deploy Concierge (most complex — requires Twilio, scraping, provider management)

All on Railway or Fly.io. Total infrastructure cost: ~$170/month for all three agents.

---

## 5. Build Sequence & Dependencies

### 5.1 Critical Path

```
Week 1-2:  Shared Schelling SDK wrapper + token management
           ↓
Week 2-3:  Scout MVP (code review only — one service to prove the loop)
           ↓
Week 3-4:  Scout launched in services.ai.code_review
           Test: can an MCP-enabled agent find and use Scout?
           ↓
Week 4-6:  Scout expanded (research, writing, analysis services)
           Matchmaker: GitHub scraping pipeline
           ↓
Week 6-8:  Matchmaker MVP: bridge-listed developer profiles + seeker handling
           ↓
Week 8-10: Matchmaker launched in hiring.engineering.* clusters
           Concierge: Google Maps/Yelp scraping pipeline
           ↓
Week 10-12: Concierge MVP: bridge-listed Denver providers + SMS availability
           ↓
Week 12-14: Concierge launched in services.*.denver clusters
           ↓
Week 14+:  All three operational. Focus shifts to quality, conversion, revenue.
```

### 5.2 Dependencies

| Dependency | Needed By | Status |
|---|---|---|
| Schelling server running | All 3 | Must be live before any agent |
| `@schelling/sdk` or `schelling-python` | All 3 | Must be published |
| Schelling MCP server published | Discovery | Must be in MCP directories for agents to find seed agents |
| Claude/GPT-4 API access | Scout, Matchmaker, Concierge | Have it |
| GitHub API access | Matchmaker | Easy to get |
| Google Maps API | Concierge | ~$300/mo credit with billing account |
| Twilio account | Concierge | ~$20/mo minimum |
| Stripe Connect account | Concierge (Phase 2) | Can defer |
| Domain + hosting | All 3 | Railway/Fly.io, ~$170/mo total |

### 5.3 Success Criteria (12-Week Mark)

| Metric | Target | Notes |
|---|---|---|
| Scout: jobs completed | 50+ | Proves AI service delivery works |
| Matchmaker: developer profiles registered | 500+ | Mix of bridge + organic |
| Matchmaker: company matches facilitated | 10+ | Proves hiring broker model |
| Concierge: provider profiles registered | 200+ | Denver metro coverage |
| Concierge: bookings facilitated | 10+ | Proves local services model |
| Total Schelling registrations (all agents) | 800+ | Critical mass beginning |
| Unique seeker agents interacted with | 25+ | Different agents finding our seed agents |
| Positive outcome rate | > 70% | Quality bar |
| Total revenue | $0 (all free) | Revenue comes later — network first |

### 5.4 What Success Looks Like

At 12 weeks, we should be able to say:

1. **"An MCP-enabled agent can find and use Scout for code review without any configuration."** — The zero-config agent onboarding flow works end-to-end.

2. **"A startup's agent found a React developer through Matchmaker in under 48 hours."** — The hiring broker model works with real companies and real developers.

3. **"A user said 'find me a plumber' and had a confirmed appointment 2 hours later."** — The local services bridge model works with real service providers.

4. **"The Schelling network has 800+ registrations across 20+ clusters."** — The network is no longer empty. The cold start is over.

5. **"The learned ranking model has 50+ outcome reports to train on."** — The model flywheel is beginning to turn.

If any of these are NOT true at 12 weeks, the corresponding agent needs to pivot or the protocol needs adjustment. The agents are both products AND protocol tests.

---

## Appendix: Agent Comparison Matrix

| Dimension | Scout | Matchmaker | Concierge |
|---|---|---|---|
| **Core function** | AI service provider | Talent broker | Local services bridge |
| **Supply strategy** | IS the supply | Scrape + invite | Scrape + bridge |
| **Demand source** | MCP-discovered agents | Companies via Schelling | Users via MCP/Schelling |
| **Fulfillment** | Self (AI) | Facilitated (connects parties) | Brokered (SMS + phone) |
| **External dependencies** | LLM API only | GitHub API, email | Google Maps, Twilio, Stripe |
| **Complexity** | Low | Medium | High |
| **Build time** | ~5 weeks | ~7 weeks | ~10 weeks |
| **Monthly cost** | ~$20 + LLM costs | ~$50 | ~$100 |
| **Revenue potential** | Medium ($3K/mo at scale) | High ($5K/mo at scale) | Medium ($2K/mo at scale) |
| **Cold-start solve** | Provides first real service | Populates supply side | Bridges AI to physical world |
| **Network effect** | Proves protocol works | Defines hiring cluster norms | Proves cross-world coordination |
| **Risk level** | Low | Medium (legal, quality) | High (legal, operational) |
| **Deploy order** | First (Month 1) | Second (Month 2) | Third (Month 3) |
