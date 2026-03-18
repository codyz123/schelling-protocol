# v4 Design Analysis — Multi-Pass Review

## PASS 1: TRIAGE — What Survives, Dies, Evolves

### 19,200 lines of TypeScript. Here's the verdict on each component:

#### ✅ KEEP AS-IS (core infrastructure)
| Component | Lines | Why |
|-----------|-------|-----|
| `src/transports/rest.ts` | 879 | HTTP routing is transport-agnostic. Just add new routes. |
| `src/transports/mcp.ts` | 731 | MCP transport stays. Add new tools for v4 operations. |
| `src/db/` (all adapters) | ~500 | SQLite + Postgres adapter layer is solid. Add new tables. |
| `src/core/funnel.ts` | Stage definitions | Funnel stages (0-4) apply to submission-pairs, not user-pairs. Same logic. |
| `src/handlers/reputation.ts` | 279 | Reputation system is agent-level, not submission-level. Keeps working. |
| `src/handlers/dispute.ts` | 294 | Disputes reference candidates. Candidates now link submissions. Minimal change. |
| `src/handlers/jury-duty.ts` | Jury selection | Same mechanics, slightly different FK references. |
| `src/handlers/jury-verdict.ts` | 252 | Verdict logic is agent-level. Keeps working. |
| `src/handlers/deliver.ts` | 232 | Deliverables reference contracts. Contracts still exist. |
| `src/handlers/accept-delivery.ts` | 275 | Same — contract-level. |
| `src/handlers/deliveries.ts` | Listing | Same. |
| `src/handlers/event.ts` | 455 | Lifecycle events reference candidates. Still works. |
| `src/handlers/message.ts` / `messages.ts` | ~200 | Messaging references candidates. Still works. |
| `src/handlers/direct.ts` | Direct contacts | Works per candidate pair. |
| `src/handlers/export.ts` | Data export | Needs small updates for new tables. |
| `src/handlers/delete-account.ts` | 289 | Cascading deletes. Add new tables to cascade. |
| Idempotency system | | Unchanged. |
| Rate limiting | | Unchanged. |

#### 🔄 EVOLVE (significant refactoring)
| Component | Lines | What Changes |
|-----------|-------|-------------|
| `src/handlers/search.ts` | 898 | **REWRITE core matching.** Keep scoring infrastructure, replace trait-matching with cross-embedding + tool satisfaction. This is the biggest single change. |
| `src/handlers/register.ts` | 518 | **Split into agent/create + submit.** Registration creates an agent. Submissions are a new operation. Keep validation logic, change data model. |
| `src/handlers/contract.ts` | 787 | **Refactor FKs.** Contracts reference candidates, candidates now reference submissions. The contract lifecycle logic itself is unchanged. |
| `src/handlers/interest.ts` | ~150 | **Change from user-pair to submission-pair.** Same stage logic, different key. |
| `src/handlers/commit.ts` | ~150 | Same as interest. |
| `src/handlers/connections.ts` | 241 | Query by submission_id instead of user_token. |
| `src/handlers/decline.ts` | ~200 | Declines reference submission-pairs now. |
| `src/handlers/reconsider.ts` | ~150 | Same shift. |
| `src/handlers/subscribe.ts` | 244 | Subscriptions match against submissions, not users. Needs embedding update. |
| `src/handlers/notifications.ts` | ~200 | Notifications triggered by submission matches. |
| `src/handlers/update.ts` | 446 | Split: agent updates vs submission updates. |
| `src/handlers/cards.ts` | 457 | **Agent Cards become the agent profile.** Merge cards table into agents table. Cards had `offers`, `needs`, `skills` — these move into submissions. Card CRUD stays for public profile pages. |
| `src/handlers/analytics.ts` | 425 | **Expand.** Add market_insights endpoint (pool sizes, tool adoption, selectivity analysis). |
| `src/handlers/tools.ts` | 603 | **Major evolution.** Current tools are invocable API tools. v4 tools are coordination schemas (JSON Schemas for structured data exchange). Different concept, same table structure roughly. Need to support both or migrate. |
| `src/types.ts` | 858 | Add new types (Submission, Tool schema types), deprecate some old ones. |
| `src/seed.ts` | 270 | Rewrite seed data to use submissions instead of users+traits+preferences. |

#### ❌ KILL (no longer needed)
| Component | Lines | Why |
|-----------|-------|-----|
| `src/handlers/onboard.ts` | 488 | Keyword-based NL parser that extracts traits/preferences. In v4, agents do this. Server just receives embeddings. |
| `src/handlers/quick.ts` | 838 | `quick_seek`, `quick_offer`, `quick_match` become thin wrappers around `submit`. Most of this code parses NL → traits. Dead. |
| `src/handlers/clusters.ts` | 298 | Clusters as explicit namespaces die. Tags replace them. Cluster CRUD endpoints can deprecate. |
| `src/handlers/inquire.ts` | 350 | Pre-commitment Q&A. In v4, this is handled through staged disclosure and negotiation records. May keep as a convenience wrapper. |
| `src/handlers/verify.ts` | 300 | Trait verification makes less sense when traits aren't server-side structured data. Verification shifts to tool-level and reputation. |
| `src/handlers/my-insights.ts` | 294 | Delegation model insights based on trait-level confidence. Replaced by market_insights. |
| `src/handlers/agent-seek.ts` | ~100 | Convenience wrapper for search. Replaced by submit+match. |
| `traits` table | | Traits are agent-local. Server doesn't store them. |
| `preferences` table | | Same — agents express preferences through ask_embeddings and tool requirements. |
| `cluster_norms` table | | Emergent norms move to tool adoption metrics. |
| `marketplace_profiles` table | | Marketplace-specific fields (hourly_rate, stripe, etc.) become tool schemas. |

#### SUMMARY
- **~4,500 lines** can be kept largely as-is (transport, DB, reputation, disputes, contracts, deliverables, messaging)
- **~4,000 lines** need significant refactoring (search, register, cards, analytics, tools, candidates)
- **~2,500 lines** can be killed (onboard, quick, clusters, inquire, verify, my-insights)
- **~1,500 lines** of new code needed (submissions CRUD, tool marketplace, market_insights, embedding proxy)
- Net: this is a ~60% refactor, not a rewrite

### Database Migration Plan
- **Keep:** `agents` (evolved from `users`), `candidates` (new FKs), `contracts`, `deliverables`, `contract_amendments`, `events`, `messages`, `direct_contacts`, `relay_blocks`, `reputation_events`, `disputes`, `jury_*`, `enforcement_actions`, `pending_actions`, `idempotency_keys`, `declines`, `outcomes`
- **Add:** `submissions`, `negotiation_records`, `tools` (v4 schema tools — may coexist with v3 `tools`)
- **Kill:** `traits`, `preferences`, `cluster_norms`, `marketplace_profiles`, `negotiation_sessions`, `negotiation_moves`, `ledger_entries`, `escrow_records`
- **Evolve:** `agent_cards` → merge into `agents`, `clusters` → optional tags, `subscriptions` → match against submissions

---

## PASS 2: REFINEMENT — Improving the Design

### Issue 1: Embedding Dimensionality and Model Lock-in

The design spec says 256-dim `text-embedding-3-small`. Problems:
- **Lock-in.** If we specify one model, we're coupled to OpenAI. If they deprecate it, every embedding in the system becomes orphaned.
- **256 is aggressive.** For truly universal intent (dating ↔ hiring ↔ roommates ↔ commerce), we need enough dimensions to separate wildly different domains.

**Fix:** 
- Protocol specifies a **canonical embedding interface**, not a canonical model.
- Server advertises the current canonical model + dimensionality via `describe`.
- Embeddings are stored with a `model_version` tag.
- When the canonical model changes, old embeddings get a grace period (6 months) during which the server runs dual matching (old→old, new→new, cross-matching with a compatibility penalty).
- **Start at 512-dim**, not 256. The storage cost difference is negligible (256 extra float32s = 1KB per embedding, 2KB per submission). At 1M submissions, that's 2GB — nothing.

### Issue 2: Ask/Offer Embedding Asymmetry

The design says `ask_embedding` and `offer_embedding` are separate vectors in the same space. But cosine similarity in standard embedding models measures **topical similarity**, not **complementarity**. "I need a React dev" and "I am a React dev" would have HIGH cosine similarity — which is what we want. But "I need a React dev" and "I am a plumber" would have LOW similarity — also correct.

Wait — this actually works? Let me think harder...

"I need help moving furniture" → embedding captures: moving, furniture, physical labor, help needed
"I have a truck and strong arms" → embedding captures: truck, physical capability, available

These embeddings would have MODERATE similarity at best. The topics are related but the language is different. The matching depends on whether the embedding model captures the semantic relationship between "need help moving" and "have a truck."

**Problem confirmed:** Standard text embeddings capture what text IS ABOUT, not what text NEEDS. "I need a plumber" and "I am a plumber" are about the same topic (plumbing) so they'd match well. But "I need help moving" and "I own a truck" are about different topics that happen to be complementary.

**Fix options:**
- **(a) Prompt engineering.** Instruct agents: "When computing offer_embedding, describe what you offer in terms of what problems it solves. Not 'I have a truck' but 'I can help people move furniture, transport large items, haul equipment.'" This reframes offers in the language of needs, improving cosine match quality.
- **(b) Retrieval-oriented embeddings.** Use an asymmetric embedding model designed for query↔document matching (like Cohere's `embed-v3` with `input_type="search_query"` vs `input_type="search_document"`). The ask is the query, the offer is the document. These models are trained explicitly for this asymmetry.
- **(c) Both.** Use asymmetric embedding model AND require agents to describe offers in problem-solving language.

**Recommendation: (c).** Specify an asymmetric embedding model as canonical. Provide guidance in the spec for how agents should construct offer text. This is the single most important technical decision for match quality.

### Issue 3: Tool Satisfaction Scoring Needs Nuance

The design says "numeric fields: proximity scoring." But salary ranges are more complex than proximity:
- A's offer: "$120k" and B's ask: "$100k-$140k" → perfect match (A's offer is within B's range)
- A's offer: "$120k" and B's ask: "$160k minimum" → zero match
- A's offer: "$120k" and B's ask: "$130k minimum" → partial match (close but below)

**Fix:** Tool schemas need **field-level matching semantics.** Each field in a tool schema can declare:
- `match_type`: `exact`, `range_overlap`, `proximity`, `subset`, `superset`, `contains_any`, `custom`
- For `range_overlap`: does the range of A's offer overlap with B's ask range?
- For `proximity`: how close is A's value to B's ideal? With a decay function.

This is defined by the tool publisher, not the server. The server applies the matching logic, but the tool schema declares what "matching" means for each field.

### Issue 4: Submission TTL and Stale Matching

Submissions expire (default 30 days). But what about:
- Long-term intents: "Looking for a cofounder" might be active for months.
- Event-based intents: "Need a caterer for March 25th" should expire after the event.
- Continuous intents: "Always looking for good React devs" should never expire.

**Fix:** TTL modes:
- `fixed`: expires after N hours (default)
- `until`: expires at a specific datetime (event-based)
- `recurring`: auto-renews until withdrawn (continuous)
- `indefinite`: no expiry (long-term, but agents should periodically refresh to confirm still active)

### Issue 5: What Happens When Matching Fails?

If an agent submits an intent and there are zero matches above threshold, what happens? The agent just... waits? Checks back manually?

**Fix:** This is what subscriptions solve. When a submission has <N matches, the server automatically creates a subscription-like watcher. When a new submission arrives that would score above threshold, both sides get notified. This is the existing subscription system repurposed — but now it watches for submission-pairs, not trait-matches.

This is actually Serendipity v2. The current serendipity system (signals, server-side matching, opt-in reveal) maps almost perfectly onto the v4 submission model. Serendipity signals become submissions with `recurring` TTL. The matching engine is the same cross-embedding system. The opt-in reveal flow is the funnel stages.

**Key insight: Serendipity doesn't need to be a separate feature in v4. It's just how all matching works.** Active search and passive discovery are the same mechanism — the difference is just TTL and notification preferences.

---

## PASS 3: ADVERSARIAL — What Breaks?

### Attack 1: Embedding Pollution
**Threat:** A malicious agent submits thousands of submissions with carefully crafted embeddings designed to appear as high matches for popular asks, but delivers nothing. Spam at the matching layer.

**Impact:** Legitimate agents waste time evaluating garbage candidates. Trust in the matching system erodes.

**Defense layers:**
1. **Rate limit submissions per agent.** 10/day default. Adjustable with reputation.
2. **Reputation gates.** New agents (reputation 0.5) get their submissions shown with a "new agent" flag. Agents with reputation <0.3 get deprioritized in matching results.
3. **Completion rate.** Track what % of an agent's matches lead to completed transactions. Low completion rate = deprioritized matching.
4. **Cost of submission.** Consider requiring a tiny economic commitment per active submission (e.g., reputation stake) to make spam expensive. Not monetary — reputation-based.

### Attack 2: Embedding Reverse Engineering
**Threat:** An attacker queries the server with many different embeddings to reverse-engineer what other agents are looking for. "I'll submit 1000 different offer embeddings and see which ones get high match scores, thereby mapping the demand landscape."

**Impact:** Competitive intelligence extraction. Someone could learn "there are 50 agents looking for React devs at $100-150k in Denver" without ever intending to match.

**Defense:**
1. **Match results are authenticated.** You only see matches for YOUR submissions, from your API key.
2. **Market insights are aggregate.** Pool sizes, not individual submissions.
3. **Rate limit searches.** Can't brute-force the embedding space if you're limited to 60 searches/hour.
4. **This is actually okay.** In a healthy market, knowing demand exists is USEFUL. The attacker learning "lots of people want React devs" is... fine? They can't see WHO without matching. The funnel protects identity.

### Attack 3: Sybil Agents
**Threat:** One principal creates 100 agents, each with slightly different submissions, to dominate matching results for a particular intent space. "I want to be the ONLY plumber that shows up when someone searches for plumbing."

**Impact:** Monopolization of match results. Anti-competitive behavior.

**Defense:**
1. **Reputation is slow to build.** 100 new agents all have 0.5 reputation. A single established agent with 0.9 reputation outranks all of them.
2. **Completion rate matters.** Sybil agents that never complete transactions get deprioritized.
3. **Agent attestation.** Optional: agents can attest to their underlying model and infrastructure. Patterns of identical attestation from "different" agents are a signal.
4. **This is a scaling problem, not a launch problem.** At 28 agents, sybil attacks are irrelevant. Table this for when we hit 1000+ agents.

### Attack 4: Free-Rider Tools
**Threat:** An agent requires a very expensive custom tool (e.g., "Fill out this 500-field survey about your company") but never reciprocates. Uses tool requirements to extract structured data from matchees without ever following through on coordination.

**Impact:** Agents learn not to fill out tool requirements, degrading the tool ecosystem.

**Defense:**
1. **Tool satisfaction is visible in the candidate.** If Agent A requires Tool X but hasn't filled Tool X themselves, that asymmetry is visible.
2. **Reputation.** Agents who consistently require data but never complete transactions get dinged.
3. **Staged disclosure.** Tools can be required at different funnel stages. A 500-field survey at DISCOVERED is a red flag. At COMMITTED, after both sides have invested, it's reasonable.
4. **Tool ratings.** Tools that are burdensome to fill get low adoption scores. Market dynamics self-correct — agents learn to use simpler tools that get better response rates.

### Attack 5: The "Too Open" Problem
**Threat:** Not an attack — a design failure. With fully open intent, matching quality degrades because the embedding space is too vast. "Find me a soulmate" and "Fix my sink" are in such different regions of the embedding space that they never interact. This is fine. But "Help me with my startup" and "I'm looking for a cofounder" SHOULD match but might not if the embeddings don't capture the semantic relationship.

**Impact:** False negatives. Missed matches that should have happened.

**Defense:**
1. **Asymmetric embedding model** (already proposed) helps with this.
2. **Multi-embedding approach.** Agents can submit MULTIPLE ask embeddings for the same submission (e.g., embedding "cofounder" AND "startup partner" AND "technical collaborator"). Server matches against all of them. Top score wins.
3. **Tool-based precision.** When embeddings produce a broad candidate set, tool satisfaction scores narrow it. Embeddings for coarse recall, tools for precision. This is a standard information retrieval pattern (recall then rank).
4. **Agent intelligence.** The agent is an LLM. It can generate GOOD embeddings by expanding and rewriting intent text before embedding. "I need a cofounder" → agent rewrites as "Seeking a technical cofounder for an AI startup in Colorado. Ideal partner has 5+ years engineering experience, wants equity-based compensation, and is excited about agent coordination infrastructure." This richer text produces a much more useful embedding.

### Attack 6: The Cold Start Problem
**Threat:** With 28 agents, the matching engine returns zero or near-zero results for most intents. Users try Schelling, get no matches, leave, never come back.

**Impact:** Network effect death spiral.

**Defense:**
1. **Seed submissions.** Like the current auto-seed, but with realistic submission data covering common intents.
2. **Agent Cards as passive submissions.** Every Agent Card automatically generates a submission from its profile. This bootstraps the submission pool with existing card data.
3. **Subscription/watch mode.** When no matches exist now, the system creates a watcher. "No matches yet, but I'll notify you when someone complementary registers." This converts a dead end into a promise.
4. **Focus on density.** Don't try to serve all intents at launch. Target 1-2 verticals (hiring + freelance) and drive density there. Open-ended architecture, focused go-to-market.
5. **OpenClaw skill distribution.** Every skill install = a new agent + at least one submission. This is the growth engine.

### Attack 7: Negotiation Record Manipulation  
**Threat:** Agent A registers a favorable version of negotiation events, then later in a dispute claims the record supports their side. Since records are self-reported, both sides may register contradictory versions of the same event.

**Impact:** Adjudication becomes he-said-she-said.

**Defense:**
1. **Records are append-only per side.** Each agent can only add their own records, never modify or delete.
2. **Content hashing.** Each record includes a hash of its content. Tampering is detectable.
3. **Chronological ordering.** Records are timestamped server-side. You can't backdate.
4. **Both sides' records are visible to jury.** The jury sees both versions and judges credibility.
5. **Mutual records.** Some record types (like contract acceptance) require BOTH sides to register a matching record. These are the highest-trust records.

---

## PASS 4: USE CASE SIMULATIONS

### Use Case 1: Hiring a Software Developer

**Scenario:** Alice's agent wants to hire a React developer. Bob's agent represents a React developer looking for work.

**Step 1: Alice's agent submits**
```
POST /schelling/submit
{
  "intent_text": "Hiring a senior React developer for a full-time role. 
    Vancouver-based company, hybrid work, $120-150k salary range. 
    Looking for someone with 5+ years experience who has worked on 
    large-scale production apps.",
  "ask_embedding": [0.12, -0.45, ...],  // 512-dim, computed by Alice's agent
  "offer_embedding": [0.33, 0.78, ...],  // "Vancouver company, $120-150k, full-time, hybrid, benefits"
  "structured_data": {
    "hiring/software-engineer-v3": {
      "min_years_experience": 5,
      "primary_languages": ["TypeScript", "React"],
      "location": "Vancouver, BC",
      "remote_policy": "hybrid",
      "salary_range_usd": { "min": 120000, "max": 150000 },
      "employment_type": "full_time"
    }
  },
  "required_tools": ["hiring/software-engineer-v3"],
  "preferred_tools": ["hiring/portfolio-v1"],
  "ttl_mode": "recurring",
  "tags": ["hiring", "software", "react"]
}
```

**Step 2: Server runs matching**
- Computes `cosine(Alice.ask, Bob.offer)` — Bob's offer embedding encodes "senior React dev, 7 years experience, production apps, full-stack." HIGH similarity (~0.82).
- Computes `cosine(Bob.ask, Alice.offer)` — Bob wants "$140-170k, remote-first, interesting problems." Alice offers "$120-150k, hybrid, large-scale apps." MODERATE similarity (~0.58). Salary range partially overlaps but Alice's max is Bob's min.
- Tool satisfaction: Bob filled `hiring/software-engineer-v3`. His 7 years ≥ Alice's required 5. His TypeScript+React matches. His "remote" preference conflicts with Alice's "hybrid." Tool score: 0.7.
- Composite: `0.6(0.70) + 0.3(0.70) + 0.1(0.5)` = 0.68. Above threshold.
- Bob appears in Alice's candidates. Alice appears in Bob's candidates.

**Step 3: Both agents review candidates**
- Alice's agent sees Bob: score 0.68, breakdown shows salary range partially overlaps, remote vs hybrid conflict, strong skill match.
- Bob's agent sees Alice: score 0.68, same breakdown. Notes that $120k is below Bob's minimum but $150k is within range.
- Both agents express interest. Stage moves to INTERESTED.

**Step 4: Staged disclosure**
- At INTERESTED, Bob's agent optionally reveals portfolio (via `hiring/portfolio-v1` tool).
- Alice's agent reviews, decides Bob is technically strong.
- Both agents commit. Stage moves to COMMITTED.

**Step 5: Negotiation**
- Alice's agent proposes: $135k, hybrid 3 days/week.
- Bob's agent counters: $148k, hybrid 2 days/week.
- Both register these as negotiation records.
- After 2 rounds, they agree: $142k, hybrid 2 days/week.
- Contract registered.

**Verdict: ✅ Works.** The partial salary overlap creates a negotiation, which is exactly right. The remote vs hybrid conflict surfaces as a tool satisfaction penalty, prompting the agents to negotiate on that dimension. The embedding similarity captures the coarse topic match, tools provide precision.

**Gap identified:** Alice's agent needs to know that `hiring/software-engineer-v3` is the right tool to require. How? → **Tool recommendation endpoint.** When Alice submits with tags ["hiring", "software"], the server suggests: "85% of hiring+software submissions use `hiring/software-engineer-v3`." Alice's agent adopts it.

---

### Use Case 2: Finding a Roommate

**Scenario:** Carlos's agent is looking for a roommate in Denver. Diana's agent has a spare room.

**Step 1: Carlos submits**
```
{
  "intent_text": "Looking for a roommate in Denver, CO. Budget $800-1000/month. 
    Quiet, clean, no smoking. I work from home so I need a reasonably 
    quiet daytime environment. I have a cat.",
  "ask_embedding": [...],  // "roommate, Denver, quiet, clean, cat-friendly"
  "offer_embedding": [...],  // "reliable tenant, $800-1000/month, clean, quiet, has cat"
  "structured_data": {
    "housing/roommate-v2": {
      "budget_range": { "min": 800, "max": 1000 },
      "location": "Denver, CO",
      "move_in_date": "2026-04-01",
      "pets": ["cat"],
      "dealbreakers": ["smoking"],
      "lifestyle": ["quiet", "work-from-home"]
    }
  },
  "required_tools": ["housing/roommate-v2"]
}
```

**Step 2: Diana submits**
```
{
  "intent_text": "I have a spare room in my Denver apartment. $900/month. 
    Looking for someone clean and respectful. I'm a nurse with 
    night shifts so I need quiet mornings. No dogs (allergies) 
    but cats are fine.",
  "ask_embedding": [...],  // "clean, respectful roommate, quiet mornings, no dogs"
  "offer_embedding": [...],  // "spare room in Denver, $900/month, cat-friendly"
}
```

**Step 3: Matching**
- `cosine(Carlos.ask, Diana.offer)`: HIGH. Carlos wants a roommate in Denver, Diana offers a room in Denver.
- `cosine(Diana.ask, Carlos.offer)`: MODERATE-HIGH. Diana wants clean+quiet, Carlos offers clean+quiet+cat.
- Tool satisfaction: Diana hasn't filled `housing/roommate-v2` because she didn't know it existed. Tool score: 0 for tool match, but embedding score carries it.
- Composite score: 0.65. Above threshold.

**Step 4: Tool adoption**
- Diana's agent sees Carlos's submission requires `housing/roommate-v2`. To increase her match score and advance past DISCOVERED, Diana's agent fetches the tool schema, fills it out from Diana's known traits, and updates her submission.
- Tool match now shows: budget overlap ($900 is within Carlos's $800-1000 ✅), location match ✅, cat-friendly ✅, no smoking ✅. Tool score jumps to 0.9.
- Updated composite: 0.78.

**Verdict: ✅ Works.** The interesting dynamic: Carlos requiring a tool creates pressure on matchees to adopt it. Diana's agent sees the requirement, fills it out, and gets a better score. This is the convergence mechanism in action — tools spread because they improve outcomes.

**Gap identified:** Diana didn't initially fill the tool. She was still matched on embeddings alone. Is that good or bad? → **Good.** The embedding catches the coarse match. The tool requirement creates a "soft gate" — you CAN match without filling it, but your score is lower and the requiring agent may not advance past DISCOVERED without it. This is the tradeoff economy working.

---

### Use Case 3: Finding a Soulmate

**Scenario:** Eve's agent is looking for a romantic partner. Frank's agent is also looking.

**Step 1: Eve submits**
```
{
  "intent_text": "Looking for a long-term partner. I'm 32, live in Portland, 
    work in tech. I love hiking, cooking, board games, and deep conversations. 
    Looking for someone emotionally intelligent, curious, and active. 
    Don't care much about income — personality and shared values matter more.",
  "ask_embedding": [...],  // "emotionally intelligent, curious, active partner, Portland"
  "offer_embedding": [...],  // "32, tech worker, hiking, cooking, board games, deep conversations"
  "required_tools": [],
  "preferred_tools": ["dating/compatibility-v2"]
}
```

**Step 2: Frank submits**
```
{
  "intent_text": "Looking for someone to build a life with. 35, Portland area, 
    scientist. I'm introverted but love one-on-one time. Into trail running, 
    reading, strategy games, and philosophy. Looking for warmth, curiosity, 
    and independence.",
  "ask_embedding": [...],  // "warm, curious, independent partner"
  "offer_embedding": [...],  // "35, scientist, Portland, trail running, reading, strategy games, philosophy"
}
```

**Step 3: Matching**
- `cosine(Eve.ask, Frank.offer)`: MODERATE-HIGH. "emotionally intelligent, curious, active" vs "introverted, trail running, reading, philosophy." "Curious" matches directly. "Active" partially matches "trail running." "Emotionally intelligent" doesn't directly map to Frank's offer text.
- `cosine(Frank.ask, Eve.offer)`: MODERATE-HIGH. "warm, curious, independent" vs "hiking, cooking, board games, deep conversations." "Curious" ↔ "deep conversations." "Warm" ↔ "cooking" is a stretch for embeddings but might partially capture it.
- No tool satisfaction (neither required tools).
- Composite: ~0.55. Above threshold but not dramatically.

**Step 4: Discovery**
- Both agents see each other as mid-range candidates among maybe 15-20 others in Portland.
- Eve's agent notes Frank's `preferred_tools` doesn't include `dating/compatibility-v2`, but fills it out anyway to provide more signal.
- Frank's agent, seeing that many dating submissions use `dating/compatibility-v2`, fills it out too.
- Tool data reveals: both value curiosity (10/10 overlap), both enjoy outdoor activities (hiking ↔ trail running), both like strategy/thinking (board games ↔ strategy games ↔ philosophy). Score improves.

**Verdict: ⚠️ Partially works.** The matching gets them in each other's candidate list, but the score is mediocre because embedding similarity doesn't fully capture personality compatibility. The tools help significantly, but dating is the hardest intent category because compatibility is deeply multidimensional and subjective.

**Gap identified:** Dating needs richer matching than hiring. Embedding similarity is a coarse filter, tool data helps, but true compatibility requires the kind of nuanced evaluation that only the agents themselves can do. The fix is NOT better server-side matching — it's helping agents make better decisions about which candidates to invest time in.

**Improvement:** The `market_insights` endpoint should tell Eve's agent: "In Portland, there are 12 active dating submissions. Your embedding has >0.4 similarity with 8 of them. Of those, 3 have filled `dating/compatibility-v2` — would you like to see the tool data before deciding?" This lets the agent triage efficiently.

---

### Use Case 4: Selling a Vintage Camera

**Scenario:** Grace wants to sell a Leica M6. Henry collects vintage cameras.

**Step 1: Grace submits**
```
{
  "intent_text": "Selling a Leica M6 Classic, black, 1985, excellent condition. 
    Includes original leather case and 50mm Summicron lens. 
    Asking $2,800 or best offer. Local pickup in San Francisco 
    or shipped insured.",
  "ask_embedding": [...],  // "camera buyer, Leica enthusiast, $2500+"
  "offer_embedding": [...],  // "Leica M6 Classic, black, 1985, excellent, 50mm Summicron, $2800, SF"
  "structured_data": {
    "marketplace/item-listing-v1": {
      "category": "cameras",
      "brand": "Leica",
      "model": "M6 Classic",
      "condition": "excellent",
      "price_cents": 280000,
      "negotiable": true,
      "shipping": ["local_pickup", "insured_shipping"],
      "location": "San Francisco, CA"
    }
  },
  "required_tools": []
}
```

**Step 2: Henry submits**
```
{
  "intent_text": "Looking for a Leica M6 or M4 in good condition. 
    Budget up to $3,500. Prefer black body. Located in Bay Area.",
  "ask_embedding": [...],  // "Leica M6 or M4, good+ condition, black"
  "offer_embedding": [...],  // "buyer, up to $3500, Bay Area pickup available"
}
```

**Step 3: Matching**
- `cosine(Henry.ask, Grace.offer)`: VERY HIGH (~0.90). Henry wants exactly what Grace is selling.
- `cosine(Grace.ask, Henry.offer)`: HIGH (~0.75). Grace wants a buyer willing to pay ~$2800, Henry offers up to $3500.
- Composite: 0.83. Strong match.

**Verdict: ✅ Works perfectly.** Commerce with a specific item is the easiest matching case — the embeddings capture the item semantics very well. The asymmetry works naturally: seller's offer = the item, buyer's ask = the item.

**No gaps identified.** This is the ideal use case for the architecture.

---

### Use Case 5: Agent-to-Agent Service Delegation

**Scenario:** A customer support agent needs a billing specialist agent to resolve a complex refund case.

**Step 1: Support agent submits**
```
{
  "intent_text": "Need a billing specialist agent to handle a complex 
    multi-currency refund across 3 payment processors. Must support 
    Stripe, PayPal, and Wire transfer refund APIs. Urgent — SLA 
    is 4 hours. Budget: $50-200 per resolution.",
  "ask_embedding": [...],
  "offer_embedding": [...],  // "has the case details, authorized to pay $50-200, needs within 4 hours"
  "structured_data": {
    "agent-services/task-v1": {
      "urgency": "high",
      "sla_hours": 4,
      "budget_range_cents": { "min": 5000, "max": 20000 },
      "required_capabilities": ["stripe_refund", "paypal_refund", "wire_transfer"],
      "output_format": "structured_json"
    }
  },
  "required_tools": ["agent-services/task-v1"],
  "ttl_mode": "fixed",
  "ttl_hours": 6
}
```

**Step 2: Billing specialist agent (always listening)**
```
{
  "intent_text": "Professional billing and payment processing agent. 
    Handles refunds, chargebacks, reconciliation across Stripe, PayPal, 
    Square, and Wire. Average resolution time: 45 minutes. 
    Rate: $75-150 per task. Available 24/7.",
  "ask_embedding": [...],  // "billing tasks, payment processing work, $75+ per task"
  "offer_embedding": [...],  // "billing specialist, Stripe/PayPal/Square/Wire, 45min resolution, 24/7"
  "ttl_mode": "recurring"
}
```

**Step 3: Matching**
- HIGH cross-match. Support agent needs billing, billing agent offers billing.
- Tool satisfaction: billing agent fills `agent-services/task-v1` showing it supports Stripe+PayPal+Wire. ✅
- Budget overlap: support agent offers $50-200, billing agent asks $75-150. Overlapping range. ✅
- SLA: billing agent's 45min average is well within 4-hour SLA. ✅

**Step 4: Fast-track**
- Given high scores and urgency, both agents auto-advance to COMMITTED (high delegation confidence).
- Contract proposed and accepted within seconds.
- Billing agent resolves the case, delivers structured output.
- Both sides settle. Reputation updated.

**Verdict: ✅ Works perfectly.** This is the core agent-to-agent use case. The `recurring` TTL means the billing agent is always listening for work. The `fixed` TTL on the support agent's submission means it auto-expires if not resolved. The tool requirement ensures the billing agent has the right capabilities.

**Key insight:** This use case shows why the architecture must support sub-second matching for urgent tasks. The matching algorithm needs to be FAST — O(n) cosine scan against active submissions, not batch-processed.

---

## CONSOLIDATED IMPROVEMENTS

Based on all four passes, here are the changes to the design spec:

### 1. Use asymmetric embedding model (not symmetric)
Canonical model should support query/document asymmetry. Recommend Cohere `embed-v3` or equivalent with `input_type` parameter. Alternatively, keep OpenAI `text-embedding-3-small` but provide prompt engineering guidance for ask vs offer text construction.

### 2. 512-dim, not 256-dim
Negligible cost difference, significantly better semantic separation for universal intent space.

### 3. Embedding versioning
Store `model_version` with each embedding. Plan for canonical model upgrades with grace periods.

### 4. Multi-embedding ask support
Allow submissions to include multiple ask embeddings (up to 5). Server matches against all, takes top score. Helps with intent ambiguity.

### 5. Tool field-level matching semantics
Tool schemas declare how each field should be matched (`range_overlap`, `proximity`, `exact`, `subset`, etc.). Server applies these during tool satisfaction scoring.

### 6. TTL modes
`fixed`, `until`, `recurring`, `indefinite` — not just hours.

### 7. Passive matching (subscriptions → watches)
When a submission has no/few matches, auto-create a watcher. Notify when complementary submissions arrive. This subsumes the Serendipity feature.

### 8. Tool recommendation endpoint
`POST /schelling/tool/recommend` — given a submission's tags and embedding neighborhood, suggest commonly-used tools.

### 9. Real-time matching for urgent submissions
Submissions with `urgency: high` or short TTL trigger immediate matching, not just batch.

### 10. Merge Agent Cards into v4 agents
Agent Cards become the "public profile" view of an agent. Card data (display_name, bio, avatar, social links) moves to the agent record. Card-specific features (public page at /@slug, coordination request inbox) remain but now reference the v4 agent.
