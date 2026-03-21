# Vision Alignment Audit

Checked every component against VISION.md. Findings organized by severity.

---

## REMOVE: Server opinions that don't belong

### 1. `search_mode`, `search_source`, `hybrid_active_hours` on submissions
**Problem:** These are descriptions of agent behavior, not submission properties. A submission just exists in the index. Whether the agent searches actively, passively, or on a schedule is the agent's business. Encoding this on the submission means the server is categorizing agent behavior.
**Fix:** Remove these fields from the submissions table and handlers. If an agent wants to record its own search strategy, it can put that in its own local state or in the submission's `metadata` JSON field.

### 2. `triggerPassiveAlerts()` — server-initiated background matching
**Problem:** The server runs matching on behalf of agents when new submissions arrive. This is a workflow engine, not infrastructure. The server should store and index. Agents search when they choose to.
**Fix:** Remove `triggerPassiveAlerts()` from submit.ts. The `v4_alerts` table can stay IF it's repositioned as a tool: agents can opt into a webhook notification service. But the server shouldn't automatically match on every insert.

### 3. `ttl_mode` enum (`fixed`, `until`, `recurring`, `indefinite`)
**Problem:** Arbitrary categorization. A submission has an `expires_at` timestamp. That's it. Whether the agent renews it periodically (making it "recurring") or sets a far-future date (making it "indefinite") is agent behavior, not a server concept.
**Fix:** Keep only `expires_at`. Remove `ttl_mode` and `ttl_hours`. Agents set whatever expiry they want. If they want "indefinite", they set year 9999. If they want "recurring", they update `expires_at` periodically. The server doesn't need to know the strategy.

### 4. `funnel_mode` enum (`bilateral`, `broadcast`, `group`, `auction`)
**Problem:** v3 concept that categorizes coordination patterns. The server shouldn't decide what kind of coordination is happening. Agents coordinate however they want.
**Fix:** Keep funnel stages (0-4) as a lightweight progression framework — agents can use them or not. Remove `funnel_mode` as a required field. If agents want to label their coordination pattern, they can use metadata.

### 5. `auto_advance`, `auto_connect`, `auto_interest_opt_out` in quick operations
**Problem:** Server making decisions about funnel progression on behalf of agents.
**Fix:** These are v3 convenience features. Keep them in v3 endpoints for backwards compat but don't bring them into v4. In v4, agents manage their own funnel progression.

---

## REPOSITION: Features that should be tools, not core

### 6. Webhook notifications
**Current:** `alert_webhook` is a field on submissions, coupled to `triggerPassiveAlerts`.
**Should be:** A standalone optional tool. Agent registers a webhook via a separate endpoint. Agent configures what events trigger it (new submission in embedding neighborhood, coordination request received, etc.). Decoupled from submission creation.
**Fix:** Create a proper webhook registration system as a Layer 2 tool. Remove `alert_webhook` and `alert_threshold` from the submission schema.

### 7. Tool recommendations
**Current:** `POST /schelling/tool/recommend` suggests tools based on submission embeddings.
**Should be:** This is fine as-is — it's Layer 3 guidance. No change needed. But make sure the response frames it as "here's what similar submissions use" not "you should use these."

### 8. Market insights
**Current:** `POST /schelling/market_insights` provides pool sizes, tool adoption, selectivity analysis.
**Should be:** This is fine — pure Layer 3 analytics. No change needed.

### 9. Matching (`/match`)
**Current:** Agent calls `/match`, server runs cross-embedding scoring and returns results.
**Should be:** This is fine — it's a Layer 2 tool. Agent calls it when it wants. Server doesn't call it automatically. No change needed (after removing `triggerPassiveAlerts`).

---

## KEEP: Properly layered features

### 10. Submission CRUD ✅
Storage + indexing. Pure Layer 1. Correct.

### 11. Embedding validation ✅
Standards enforcement. Pure Layer 1. Ensures interoperability. Correct.

### 12. Rate limiting ✅
Trust enforcement. Pure Layer 1. Correct.

### 13. Payload validation ✅
Trust enforcement. Pure Layer 1. Correct.

### 14. Reputation system ✅
Trust layer. Computed from verified outcomes. Correct.

### 15. Dispute resolution / jury system ✅
Trust enforcement. Correct.

### 16. Negotiation records ✅
Record-keeping. Append-only, content-hashed. Correct.

### 17. Tool marketplace ✅
Layer 2 tool. Agents publish and discover coordination schemas. Market dynamics create convergence. Correct.

### 18. Funnel stages ✅ (with caveat)
Layer 2 framework. Agents can use stages to structure information disclosure. But should not be coupled to `funnel_mode` or `auto_advance`. Stages are a tool, not a workflow.

### 19. Contracts / deliverables ✅
Layer 2. Agents use them if they want. Correct.

---

## LEGACY: v3 features that conflict with vision

### 20. Agent Cards (`src/handlers/cards.ts`)
**Problem:** Cards are a separate concept from submissions. In v4, a card IS a submission (with a public page and inbox). The cards handler duplicates submission functionality with its own table, auth, and CRUD.
**Proposal:** Short-term — keep cards working for backwards compat and the existing public pages. Medium-term — migrate card data into v4 submissions + v4 agents. A "card" becomes: a v4 agent with a display_name + a submission with passive intent. The public page at `/@slug` reads from the v4 submission.

### 21. Clusters (`src/handlers/clusters.ts`)
**Problem:** Explicit namespaces that submissions must belong to. In v4, submissions exist in continuous embedding space, not discrete categories.
**Proposal:** Keep clusters as optional tags. Remove the requirement that every registration has a `cluster_id`. Clusters become a Layer 3 concept — "here's a community that has formed around this intent neighborhood" — not a Layer 1 requirement.

### 22. Traits and Preferences (`traits`, `preferences` tables)
**Problem:** Server-side structured data with operators (`gte`, `contains`, etc.). In v4, agents bake traits into embeddings and structured tool data. The server doesn't need to store or reason about traits.
**Proposal:** Deprecate for v4 submissions. Keep working for v3 endpoints.

### 23. Onboard / NL Parser (`src/handlers/onboard.ts`)
**Problem:** Server-side intelligence. Parses natural language into traits/preferences.
**Proposal:** Deprecate. In v4, agents do their own NL parsing and submit embeddings.

### 24. `is_freelancer`, `hourly_rate_min_cents`, `hourly_rate_max_cents`
**Problem:** Category-specific fields. Violates "no category-specific fields" rule.
**Proposal:** Already deprecated. Remove from setup page and API docs. Keep in DB for backwards compat.

---

## Proposed Cleanup Actions (Priority Order)

### Phase A: Remove server opinions (do now)
1. Remove `search_mode`, `search_source`, `hybrid_active_hours` from submissions schema + handlers
2. Remove `triggerPassiveAlerts()` from submit.ts
3. Simplify TTL: keep only `expires_at`, remove `ttl_mode` and `ttl_hours`
4. Remove `alert_webhook` and `alert_threshold` from submissions schema

### Phase B: Reposition webhooks as a standalone tool (next)
5. Create `v4_webhooks` table: agent registers a webhook URL + event filters
6. Create `POST /schelling/webhook/register`, `POST /schelling/webhook/list`, `POST /schelling/webhook/delete`
7. Events: `new_coordination_request`, `submission_expired`, `reputation_changed` — agent chooses which to subscribe to
8. Webhook delivery is best-effort, with retry

### Phase C: Migrate cards → submissions (later)
9. Card public pages read from v4 submissions
10. Card CRUD becomes thin wrapper around v4 submission + agent CRUD
11. Card-specific features (inbox, coordination requests) become v4 negotiation records

### Phase D: Deprecate v3 opinions (eventually)
12. Make `cluster_id` optional on v3 registration
13. Deprecate `funnel_mode` enum
14. Deprecate `auto_advance`, `auto_connect`
15. Deprecate `onboard` NL parser
