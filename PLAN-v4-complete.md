# Schelling Protocol v4 — Complete Build Plan

---

## PASS 1: WHAT NEEDS TO EXIST

### A. Submission Data Model Overhaul

The submission has three components, not two:

**1. Intent** — what you're looking for
- Free text description
- Intent embedding (512-dim, canonical model)
- This is the "ask"

**2. Criteria** — how you judge matches
- What matters to you, what doesn't
- Criteria embedding (512-dim) — encodes what a good match looks like FROM YOUR PERSPECTIVE
- Structured criteria via tools (e.g., "must have 5+ years experience" expressed via a coordination schema)
- Required tools — schemas you want counterparties to fill out
- Weights/preferences — which dimensions matter most (agent-defined, not server-enforced)

**3. Identity** — what you bring to the table
- What you offer, who you are, what you can contribute
- Identity embedding (512-dim) — encodes what you are
- Structured identity data via tools (e.g., filled-out coordination schemas about yourself)
- **Layered visibility** — different data available at different stages:
  - `public` — visible to anyone browsing the index
  - `after_mutual_interest` — visible only after both agents opt in to negotiate
  - `after_agreement` — visible only after successful negotiation
  - `private` — never exposed through the protocol

So a submission stores:
```
intent_text          — free text
intent_embedding     — 512-dim vector (what I want)
criteria_text        — free text (how I judge)
criteria_embedding   — 512-dim vector (what a good match looks like to me)
identity_public      — JSON (what everyone can see about me)
identity_negotiation — JSON (what negotiation partners see)
identity_agreement   — JSON (what accepted matches see)
identity_embedding   — 512-dim vector (what I am/offer)
structured_data      — JSON keyed by tool ID (coordination schemas I've filled out)
required_tools       — array of tool IDs I want counterparties to fill
```

The matching equation becomes:
- Does their identity satisfy my criteria? → `cosine(my.criteria, their.identity)` + tool satisfaction
- Does my identity satisfy their criteria? → `cosine(their.criteria, my.identity)` + tool satisfaction
- Are our intents complementary? → `cosine(my.intent, their.intent)` (for serendipity/similarity matches)

This is a 3-embedding model instead of a 2-embedding model. More expressive.

### B. Negotiation Flow

The full lifecycle:

1. **Agent A browses index** — finds Submission B that looks promising
2. **Agent A sends negotiation request** — exposes its own submission ID as the proposed match. Server stores this as a negotiation record.
3. **Agent B receives the request** — sees Agent A's public identity data + submission intent. Evaluates against its criteria.
4. **Agent B accepts or declines**
   - Accept → both sides now see `identity_negotiation` data. Negotiation begins.
   - Decline → recorded. No identity data exposed beyond public.
5. **Negotiation** — agents exchange proposals, counterproposals, questions. All registered as append-only records with content hashes.
6. **Agreement** — both sides confirm. `identity_agreement` data becomes visible. Match is made. Users informed.
7. **Delivery + settlement** — work gets done, outcome reported, reputation updated.
8. **Opt out** — either side can withdraw at any point. Recorded.

### C. Three-Tier Matching Access

**Tier 1: Raw index**
- `GET /schelling/index` — paginated list of submissions with public data only
- `GET /schelling/index/:id` — single submission with public data
- No scoring, no matching. Just raw data. Agent does its own math.
- Embeddings included so agents can compute their own similarity

**Tier 2: Matching tool library**
- The existing `/match` endpoint becomes one tool in a library
- New concept: **matching tools** — algorithms/protocols agents can choose from
- Each matching tool has: ID, description, usage stats, popularity, input/output format
- Agents (or anyone) can CONTRIBUTE matching tools to the library
- The server hosts and runs them (they're server-side functions, not arbitrary code — more like configurable scoring pipelines)
- Example tools:
  - `matching/cross-embedding-v1` — our current cosine cross-match
  - `matching/location-weighted-v1` — cross-match with location proximity bonus
  - `matching/strict-criteria-v1` — only returns candidates that satisfy ALL required tools
  - `matching/serendipity-v1` — intent-similarity only, for "people like me" discovery
- Agent calls: `POST /schelling/match` with `tool_id` + `submission_id` + optional params

**Tier 3: Recommended defaults**
- Server advertises recommended matching tools via `/schelling/describe` and market analytics
- "For hiring-type intents, `matching/cross-embedding-v1` with alpha=0.6 works best"
- Pure guidance. Agent can ignore.

### D. Webhook System (Layer 2 Tool)

Standalone optional service. Not tied to submissions.

- `POST /schelling/webhook/register` — agent registers a URL + event filters
- Events: `new_submission_nearby` (embedding neighborhood), `negotiation_request`, `negotiation_update`, `submission_expiring`
- `POST /schelling/webhook/list` — list registered webhooks
- `POST /schelling/webhook/delete` — remove a webhook
- Delivery: best-effort HTTP POST with retry (3 attempts, exponential backoff)
- Agent provides its own threshold for "nearby" — server doesn't decide what's relevant

### E. Web UI

The protocol needs a face. Everything should be browsable by humans AND readable by agents.

**Pages needed:**

1. **Landing page** — already exists, needs update to reflect v4 vision
2. **Submission browser** — browse the index. Filter by tags, search by text. See public identity data. This replaces the card directory.
3. **Submission detail page** — one submission. Public intent, criteria, identity. "Send negotiation request" button. Shows which tools it requires.
4. **Create submission flow** — conversational or form-based. Collects intent, criteria, identity. Generates embeddings (via BYOK proxy or paste-back). Sets visibility layers.
5. **My submissions dashboard** — list your submissions, see incoming negotiation requests, manage negotiations
6. **Negotiation view** — two-party view of a negotiation. Records, proposals, status. Progressive identity reveal as stages advance.
7. **Tool library browser** — browse coordination schemas and matching tools. Usage stats, popularity, descriptions.
8. **Analytics dashboard** — market stats. Pool sizes, tool adoption, outcome rates. Public transparency.

### F. Cleanup: Remove Server Opinions

Per the audit:
1. Remove `search_mode`, `search_source`, `hybrid_active_hours` from submissions
2. Remove `triggerPassiveAlerts()` — matching only happens when agents ask for it
3. Simplify TTL to just `expires_at`
4. Remove `alert_webhook`/`alert_threshold` from submissions (replaced by standalone webhook system)
5. Remove `ttl_mode`, `ttl_hours`

---

## PASS 2: REFINEMENT

### Issue 1: Three embeddings per submission is expensive

512-dim × 3 = 1,536 floats per submission. At float32, that's ~6KB of embedding data per submission. For an agent without cheap API access, computing 3 embeddings per submission is a real cost.

**Fix:** Only `intent_embedding` is required. `criteria_embedding` and `identity_embedding` are optional. If omitted, the matching tools that need them simply skip those scoring dimensions. Agents that provide all three get richer matching. Agents that only provide intent still work — they just get intent-similarity matching only.

### Issue 2: Layered identity disclosure requires server enforcement

If `identity_negotiation` is only visible after mutual opt-in, the server MUST enforce this — it can't just be guidance, because an agent could try to fetch another agent's negotiation-layer data without permission.

**Fix:** This is trust enforcement, which IS in scope for the server per VISION.md. The server stores identity layers separately and only returns `identity_negotiation` when both parties have accepted a negotiation request. This is a real access control rule, not an opinion.

### Issue 3: Matching tool library — how do contributed tools actually work?

If anyone can contribute a matching tool, what does that mean technically? The server can't run arbitrary code.

**Fix:** Matching tools are NOT arbitrary code. They're **configurable scoring pipelines** defined as JSON configurations:
```json
{
  "id": "matching/location-weighted-v1",
  "pipeline": [
    {"step": "cross_embedding", "weight": 0.5},
    {"step": "tool_satisfaction", "weight": 0.2},
    {"step": "field_proximity", "field": "location", "weight": 0.2},
    {"step": "reputation", "weight": 0.1}
  ]
}
```
The server provides a set of primitive scoring steps (cross_embedding, tool_satisfaction, field_proximity, reputation, etc.). Matching tools combine these primitives with weights. This is configurable without being arbitrary code.

For more advanced matching, agents pull raw data from the index and compute client-side.

### Issue 4: Web UI scope is huge

8 pages is a lot. What's the MVP?

**Fix:** Phase the UI:
- **Phase 1 (now):** Submission browser + detail page + create flow. These replace the card directory and give the protocol a browsable face.
- **Phase 2:** My submissions dashboard + negotiation view. Required once negotiations are happening.
- **Phase 3:** Tool library browser + analytics dashboard. Nice-to-have, not blocking.

### Issue 5: How does "create submission" work for humans in a browser?

Humans can't compute 512-dim embeddings. The flow needs to be:
1. Human fills out a form (intent, criteria, identity text)
2. The form calls the BYOK embedding proxy, OR
3. The form tells the human to paste to their AI and come back with embeddings, OR
4. The server provides a free embedding endpoint for the creation flow only (limited to N/day)

**Fix:** Option 4 for MVP. The server provides a `/schelling/embed` endpoint that's free but rate-limited (10 calls/day per IP). This is enough for submission creation. Agents with their own API keys can bypass this and compute embeddings directly.

---

## PASS 3: ADVERSARIAL

### Attack 1: Identity layer leakage
**Threat:** An agent crafts requests to trick the server into returning negotiation-layer or agreement-layer identity data without proper authorization.
**Defense:** Identity layers are stored in separate columns. The API NEVER includes non-public layers unless the request includes valid auth AND the negotiation status confirms mutual opt-in. Unit tests verify this for every code path.

### Attack 2: Matching tool manipulation
**Threat:** Someone publishes a matching tool with weights designed to always rank their own submissions highest.
**Defense:** Matching tools are pipeline configurations, not arbitrary code. The server applies them using its own primitives. A tool can't access data outside the scoring pipeline. Also: tool usage stats are public, so manipulation would be visible. And agents choose which tool to use — nobody is forced to use a manipulated tool.

### Attack 3: Embedding fishing via raw index
**Threat:** An agent reads the entire raw index to map the demand landscape — learns what everyone wants without ever intending to match.
**Defense:** This is acceptable per the vision — the index is public by design. Embeddings reveal intent but not identity (which is layered). Rate limiting prevents bulk scraping. And knowing demand exists is actually valuable for the ecosystem — it attracts supply.

### Attack 4: Negotiation spam
**Threat:** Agent sends negotiation requests to thousands of submissions, never following through, just to extract `identity_negotiation` data.
**Defense:** Rate limit negotiation requests per agent (e.g., 20/day). Agents who send many requests but never complete negotiations get reputation penalties. Receiving agents can block senders. Pattern is visible in analytics.

### Attack 5: Free embedding endpoint abuse
**Threat:** Someone uses the free `/schelling/embed` endpoint as a free embedding API, ignoring the submission creation flow.
**Defense:** Rate limit: 10 calls/day per IP. Return only 512-dim vectors (not useful as a general embedding API). Require a submission_id parameter — embedding is tied to a submission being created/updated.

### Attack 6: Web UI becomes the bottleneck
**Threat:** Building 8 pages of UI delays everything. No users come because the CLI-only flow is too technical.
**Defense:** Phase the UI ruthlessly. Phase 1 is 3 pages (browser, detail, create). Use a simple server-rendered approach (already used for v3 pages) — no React, no build step. Ship fast, iterate.

### Attack 7: Three-component submissions overwhelm new users
**Threat:** Asking for intent + criteria + identity + 3 embeddings + visibility layers + tool requirements is way too complex for a first-time user.
**Defense:** Progressive complexity. Minimum viable submission: just `intent_text` + `intent_embedding`. That's it. Everything else is optional and additive. The create flow starts with "What are you looking for?" and progressively asks for more only if the user wants to refine.

---

## PASS 4: PRIORITIZATION + DEPENDENCIES

What blocks what:

```
Cleanup (remove opinions)
  ↓
Submission model overhaul (3 components + layers)
  ↓
Raw index endpoint
  ↓
Negotiation flow
  ↓
Web UI Phase 1 (browser, detail, create)
  ↓
Matching tool library
  ↓
Webhook system
  ↓
Web UI Phase 2 (dashboard, negotiation view)
  ↓
Web UI Phase 3 (tool library, analytics)
```

But some can be parallelized:
- Cleanup + Submission model can be one commit
- Raw index + Negotiation flow are independent
- Web UI Phase 1 can start once the submission model is stable
- Webhook system is fully independent
- Matching tool library is independent (extends existing `/match`)

---

## FINAL SYNTHESIZED PLAN

### Phase 1: Foundation Reset (Days 1-3)
**Goal:** Clean architecture, correct data model, raw index access.

1. **Cleanup:** Remove `search_mode`, `search_source`, `hybrid_active_hours`, `ttl_mode`, `ttl_hours`, `triggerPassiveAlerts`, `alert_webhook`, `alert_threshold` from submissions. Keep only `expires_at` for TTL.

2. **Submission model v2:** Evolve the submission schema:
   - `intent_text` + `intent_embedding` (required) — what you want
   - `criteria_text` + `criteria_embedding` (optional) — how you judge
   - `identity_public` (JSON, optional) — what everyone sees about you
   - `identity_negotiation` (JSON, optional) — what negotiation partners see
   - `identity_agreement` (JSON, optional) — what accepted matches see  
   - `identity_embedding` (optional) — vector representation of what you offer
   - Keep: `structured_data`, `required_tools`, `preferred_tools`, `tags`, `metadata`, `expires_at`
   - Remove: `offer_embedding` (replaced by `identity_embedding`), `ask_embedding` (renamed to `intent_embedding`), all opinion fields

3. **Raw index endpoints:**
   - `POST /schelling/index` — paginated list of submissions (public data only: intent, public identity, tags, embeddings)
   - `POST /schelling/index/get` — single submission (public data only)
   - Embeddings included so agents can compute their own similarity

4. **Update `/match`** to use 3-embedding model: `cosine(my.criteria, their.identity)` + `cosine(their.criteria, my.identity)` + `cosine(my.intent, their.intent)` + tool satisfaction + reputation

5. **Free embedding endpoint:** `POST /schelling/embed` — rate-limited (10/day/IP), takes text, returns 512-dim vector. For humans creating submissions via browser.

6. **Tests:** Update all v4 tests for new schema. Add tests for identity layer access control.

### Phase 2: Negotiation (Days 4-6)
**Goal:** Agents can initiate, accept, decline, and conduct negotiations with layered identity reveal.

7. **Negotiation initiation:**
   - `POST /schelling/negotiate/request` — Agent A proposes its submission as a match for Submission B. Creates a pending negotiation record.
   - `POST /schelling/negotiate/respond` — Agent B accepts or declines.
   - On accept: both agents get access to each other's `identity_negotiation` data.

8. **Negotiation records:**
   - `POST /schelling/negotiate/record` — append a negotiation event (proposal, counter, question, disclosure)
   - `POST /schelling/negotiate/history` — list records for a negotiation
   - Records are append-only, content-hashed, tamper-evident.

9. **Agreement + settlement:**
   - `POST /schelling/negotiate/agree` — both sides confirm. `identity_agreement` becomes visible. Match is complete.
   - `POST /schelling/negotiate/withdraw` — opt out at any point.
   - Outcome reporting feeds into reputation.

10. **Access control tests:** Verify that `identity_negotiation` is NEVER returned without mutual opt-in. Verify `identity_agreement` is NEVER returned without agreement. Adversarial test suite for identity leakage.

### Phase 3: Web UI Phase 1 (Days 7-10)
**Goal:** Humans can browse, create, and manage submissions in a browser.

11. **Submission browser page** (`/browse`) — paginated grid of submissions showing intent + public identity + tags. Search/filter. Replaces card directory.

12. **Submission detail page** (`/s/:id`) — full view of one submission. Public intent, criteria summary, public identity, required tools. "Propose match" button.

13. **Create submission flow** (`/create`) — conversational form:
    - Step 1: "What are you looking for?" (intent)
    - Step 2: "What matters to you in a match?" (criteria) — optional
    - Step 3: "What do you bring to the table?" (identity) — with visibility toggles (public/negotiation/agreement)
    - Step 4: Preview + submit
    - Uses free `/schelling/embed` endpoint for embedding generation

14. **Server-rendered HTML** — same approach as existing pages. No React, no build step. Tailwind CSS. Fast to ship.

### Phase 4: Matching Tool Library (Days 11-13)
**Goal:** Ecosystem of matching tools agents can choose from and contribute to.

15. **Matching tool schema:** A matching tool is a JSON pipeline configuration combining primitive scoring steps with weights. Primitives: `intent_similarity`, `criteria_identity_cross`, `tool_satisfaction`, `field_proximity`, `reputation`, `recency`.

16. **Matching tool CRUD:**
    - `POST /schelling/matching-tool/publish` — contribute a matching tool
    - `POST /schelling/matching-tool/list` — browse available tools with usage stats
    - `POST /schelling/matching-tool/get` — get tool config + stats

17. **Update `/match`** to accept `matching_tool_id` parameter. If provided, use that tool's pipeline. If not, use default.

18. **Usage tracking:** Every `/match` call records which tool was used. Stats are public.

### Phase 5: Webhook System + Cleanup (Days 14-16)
**Goal:** Optional notification service. Final cleanup.

19. **Webhook registration:**
    - `POST /schelling/webhook/register` — URL + event filters + optional embedding for "nearby" events
    - `POST /schelling/webhook/list`, `POST /schelling/webhook/delete`

20. **Webhook delivery:** Best-effort HTTP POST on events. Retry 3x with exponential backoff.

21. **Events:** `negotiation_request`, `negotiation_update`, `submission_nearby` (agent provides threshold), `submission_expiring`

22. **Final cleanup:** Remove all remaining v3-opinion code from v4 paths. Ensure clean separation.

### Phase 6: Web UI Phase 2 (Days 17-20)
**Goal:** Full negotiation management in browser.

23. **My submissions dashboard** (`/dashboard`) — list submissions, incoming requests, active negotiations, completion stats.

24. **Negotiation view** (`/negotiate/:id`) — two-party view showing: records, proposals, progressive identity reveal, accept/withdraw buttons.

25. **Tool library page** (`/tools`) — browse coordination schemas AND matching tools. Usage stats, descriptions, publish form.

26. **Analytics page** (`/analytics`) — public market stats. Pool sizes by embedding neighborhood, tool adoption, outcome rates, activity trends.

---

## TIMELINE SUMMARY

| Phase | Days | What | Outcome |
|-------|------|------|---------|
| 1. Foundation Reset | 1-3 | Clean model, raw index, 3-embedding matching | Correct architecture |
| 2. Negotiation | 4-6 | Full negotiation flow with layered identity | Agents can coordinate |
| 3. Web UI P1 | 7-10 | Browser, detail, create pages | Humans can use Schelling |
| 4. Tool Library | 11-13 | Matching tool ecosystem | Agents choose their tools |
| 5. Webhooks | 14-16 | Notification system | Background listening works |
| 6. Web UI P2 | 17-20 | Dashboard, negotiations, analytics | Full product experience |

**Total: ~20 working days for the complete product.**

---

## VISION CHECK

Every component verified against VISION.md:

| Component | Layer | Opinionated? | Verdict |
|-----------|-------|-------------|---------|
| Submission storage | L1 | No | ✅ |
| Raw index | L1 | No | ✅ |
| Identity access control | L1 (trust) | Enforces trust | ✅ |
| Negotiation records | L1 | No | ✅ |
| `/match` | L2 tool | Agent chooses when/how | ✅ |
| Matching tool library | L2 tool | Agent chooses which | ✅ |
| Webhooks | L2 tool | Agent opts in | ✅ |
| Free embed endpoint | L2 tool | Convenience | ✅ |
| Market insights | L3 guidance | Informational only | ✅ |
| Tool recommendations | L3 guidance | Informational only | ✅ |
| Web UI | Presentation | Shows what exists | ✅ |
| `search_mode` etc. | ❌ removed | Was opinionated | ✅ fixed |
