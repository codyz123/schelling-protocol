# Changelog — Fixes from Adversarial Review

**Date:** 2026-02-18
**Review source:** `adversarial-review.md`
**Documents modified:** `spec-v2.md`, `intent-embedding-spec.md`, `implementation-plan.md`

---

## Critical Issues Fixed

### 1.1 — Contradictory Centroid Vectors
**Files:** `spec-v2.md` §4.3
**Change:** Replaced all four placeholder centroid vectors in spec-v2.md §4.3 with the canonical values from intent-embedding-spec.md. Added note that intent-embedding-spec.md is the authoritative source. Removed the "provisional/mutable" disclaimer.
- matchmaking: `[+0.85, +0.60, -0.80, -0.70, +0.80, -0.60, +0.80, -0.20, +0.85, +0.80, +0.75, +0.60, -0.40, +0.20, +0.80, +0.20]`
- marketplace: `[-0.90, -0.80, -0.20, +0.90, -0.85, +0.50, -0.40, +0.40, -0.85, -0.85, -0.40, -0.85, +0.60, +0.70, -0.80, -0.70]`
- talent: `[-0.85, -0.40, +0.90, +0.40, +0.30, +0.65, -0.20, +0.70, -0.60, -0.30, +0.30, -0.60, +0.30, -0.40, +0.30, -0.40]`
- roommates: `[-0.40, +0.50, -0.60, +0.10, +0.50, -0.60, -0.10, -0.20, +0.30, +0.30, +0.40, +0.85, +0.30, +0.90, +0.80, +0.10]`

### 1.2 — Re-registration Destroys Reputation
**Files:** `spec-v2.md` §5.4, §5.5, §5.5b, §15.10; `implementation-plan.md` Phase 5
**Changes:**
- `schelling.update` now accepts `embedding`, `intent_embedding`, `intents`, `intent_tags`, and `agent_model` fields with a `recompute_scores: true` flag
- When embeddings are updated via `schelling.update`, scores are recomputed asynchronously for all active candidates, `last_registered_at` is updated, but ALL relationships, reputation, feedback, and preferences are preserved
- Added new `schelling.refresh` operation (§5.5b) — resets staleness clock without modifying any data, for when the agent confirms the embedding is still accurate
- Re-registration (§5.4) is now documented as the "nuclear option" with explicit guidance to prefer `schelling.update`
- Updated §15.10 (Agent Profile Freshness) with three-tier guidance: refresh → update → re-register
- Fields that remain immutable via update: `role`, `protocol_version`, `verification_level`

### 1.3 — Intent Embedding Gaming
**Files:** `spec-v2.md` §9.5
**Changes:**
- Defined exact consistency scoring algorithm: Pearson correlation between `combined_score` at CONNECTED and outcome value (positive=1.0, neutral=0.5, negative=0.0), with `consistency = max(0, correlation)`
- Explicitly documented that intent embedding consistency is covered: high intent_similarity with poor outcomes drags down consistency
- Added agent attestation requirement for intent embeddings
- Added reputation penalty for consistency < 0.3 (after 10+ outcomes): effective reputation multiplied by `max(0.5, consistency_score)`

### 1.4 — Differential Privacy Unenforceability
**Files:** `spec-v2.md` §12.1
**Changes:**
- Added honest acknowledgment: "client-side differential privacy is best-effort and unenforceable"
- Added RECOMMENDED server-side heuristic detection: round-number detection, entropy analysis, cross-registration variance
- Clarified that heuristic detection MUST NOT reject embeddings (false positive risk), but MAY apply minor credibility discounts
- Added OPTIONAL server-side noise as additional protection layer

### 1.5 — Decline Expiry Harassment Loop
**Files:** `spec-v2.md` §5.11; `implementation-plan.md` Phase 4
**Changes:**
- Added escalating decline cooldowns: 1st decline = base TTL, 2nd decline of same person = 2× TTL, 3rd decline = permanent
- After 3 declines of the same person, the decline is permanent and cannot be reconsidered
- `schelling.reconsider` returns `PERMANENT_DECLINE` for permanent declines
- Repeat-decline count is tracked across re-registrations (associated with user pair, not candidate record)
- Added `decline_pair_history` table to implementation plan for cross-registration tracking

### 1.6 — Account Deletion Orphaning Reputation
**Files:** `spec-v2.md` §5.28
**Changes:**
- Reputation events **about** the deleted user are deleted (as before)
- Reputation events **reported by** the deleted user about others are now **anonymized, not deleted**: `reporter_token` set to sentinel `"DELETED_USER"`, identifying fields scrubbed, events preserved
- Prevents weaponized deletion (inflating/deflating others' reputations)

### 1.7 — Exclusive Commitment + Re-registration Breach
**Files:** `spec-v2.md` §5.4, §5.5; `implementation-plan.md` Phase 1, Phase 5
**Changes:**
- Re-registration with active commitments in exclusive-commitment clusters now fails with `ACTIVE_COMMITMENT`
- `schelling.update` with `intent_embedding` changes that would move the user's primary cluster also checks for `ACTIVE_COMMITMENT`
- User must explicitly decline/withdraw all exclusive commitments before re-registering or changing clusters
- Added `ACTIVE_COMMITMENT` error code to §14

---

## Design Concerns Addressed

### 2.1 — Geometric Mean Pathology
**Files:** `spec-v2.md` §17.1
**Changes:**
- Added detailed design rationale with comparison table (geometric vs arithmetic mean)
- Documented the limitation for marketplace contexts
- Emphasized that raw `your_fit` and `their_fit` are always available for agents to implement custom ranking logic
- Noted future extension point for per-cluster ranking formulas

### 2.2 — 16 Dimensions May Be Insufficient
**Files:** `spec-v2.md` §19.4
**Changes:** Added to Known Limitations section. Documented that the 16-dim intent space covers goal *structure* not domain *content*, and that trait embeddings + deal-breakers address domain specificity.

### 2.3 — Cosine Similarity Ignores Magnitude
**Files:** `spec-v2.md` §19.3
**Changes:** Added to Known Limitations section. Documented the issue, noted potential future magnitude-aware metric, and explained that minimum L2 norm requirement (≥ 0.5) ensures vectors carry sufficient signal.

### 2.4 — Cold Start Directional Scoring
**Files:** `spec-v2.md` §17.2
**Changes:**
- Added explicit documentation of cold-start symmetry: at cold start, `your_fit ≈ their_fit` (differing only on deal-breakers)
- Acknowledged this as a limitation that resolves as feedback accumulates
- Recommended using `seeking` text for lightweight asymmetric signal at cold start

### 2.5 — Jury System at Small Scale
**Files:** `spec-v2.md` §11.3; `implementation-plan.md` Phase 9
**Changes:**
- Added small-platform fallback: if fewer than 3 jurors after all relaxation, dispute escalates to server operator (`"operator_review"` status)
- Documented minimum platform size: 20+ users with reputation ≥ 0.6 for reliable jury operation
- Below threshold, most disputes escalate to operator review

### 2.6 — Agent Quality Punishing Users
**Files:** `spec-v2.md` §18.3
**Changes:**
- Agent quality scores now MUST NOT affect individual match rankings, search result ordering, or user-facing flags
- Quality warnings are private to the user/agent pair via `schelling.my_insights`
- Agent quality information used only for: informing the user's own agent, agent-level analytics, system-wide tuning

### 2.7 — Consistency Scoring Algorithm Unspecified
**Files:** `spec-v2.md` §9.5
**Changes:** Defined exact algorithm: Pearson correlation between `combined_score` at CONNECTED and outcome value (1.0/0.5/0.0), with `consistency = max(0, correlation)`. (Also addressed under 1.3.)

### 2.8 — No Block/Mute for Message Relay
**Files:** `spec-v2.md` §5.16b, §14, §13.3, §16.3; `implementation-plan.md` Phase 5/6
**Changes:**
- Added `schelling.relay_block` operation: blocks message delivery from a specific candidate without declining the match
- Blocks are unidirectional, reversible, and invisible to the blocked party (messages appear to send successfully)
- Added per-candidate message rate limit: 10 consecutive messages without a reply triggers `RATE_LIMITED`
- Added `RELAY_BLOCKED` error code to §14
- Added REST endpoint and rate limit entry

### 2.9 — Feedback Gaming
**Files:** `spec-v2.md` §8.4
**Changes:**
- Added behavioral coherence as 4th factor in feedback quality scoring (weight 0.30)
- Cross-validates explicit feedback against implicit signals (decline patterns, funnel progression)
- Feedback from users with quality score < 0.3 is discounted by 50% in learning and collaborative filtering

---

## Ambiguities Resolved

### 3.1 — Directional Fit at Cold Start
**Files:** `spec-v2.md` §17.2
**Changes:** Explicitly documented that cold-start users have nearly identical `your_fit` and `their_fit` (differing only on deal-breakers). Explained what introduces asymmetry as data accumulates.

### 3.2 — Timestamp Format Inconsistency
**Files:** `spec-v2.md` §5.18, §5.21, §5.27, §5.28
**Changes:** Standardized all timestamps to ISO 8601 strings:
- `filed_at` in `schelling.dispute` output: integer → string (ISO 8601)
- `expires_at` in `schelling.negotiate` output: integer → string (ISO 8601)
- `export_timestamp` in `schelling.export` output: integer → string (ISO 8601)
- `deleted_at` in `schelling.delete_account` output: integer → string (ISO 8601)

### 3.3 — Narrative Summary Generation Quality
**Files:** `spec-v2.md` §17.4
**Changes:**
- Removed claim that narrative summaries do NOT require a language model
- Made `narrative_summary` explicitly OPTIONAL with three quality tiers documented: minimal (structured string), template-based, LLM-enhanced
- Clarified that agents SHOULD NOT depend on natural prose — raw breakdown data is always available

### 3.4 — "Different Candidate Pools" Undefined
**Files:** `spec-v2.md` §11.3
**Changes:** Defined precisely: "A juror's candidate pool is the set of user_tokens that appear as the other party in any active (non-soft-deleted) candidate record involving the juror. Candidate pool overlap is measured by Jaccard similarity < 0.3."

### 3.5 — Negotiation Round Counting
**Files:** `spec-v2.md` §10.3
**Changes:** Stated explicitly: "The first proposal is round 1. `max_rounds: 5` means a maximum of 5 proposals can be sent in total (the initial proposal plus 4 counter-proposals). The 6th attempt returns `MAX_ROUNDS_EXCEEDED`."

### 3.6 — Implicit Signal Weights Unspecified
**Files:** `spec-v2.md` §7.8
**Changes:** Assigned numerical weights: Decline at DISCOVERED = 0.2, at EVALUATED = 0.5, at EXCHANGED/COMMITTED = 0.8, Withdrawal = 0.5, CONNECTED without negative = 0.8, COMPLETED outcomes = 1.0. Stated these are part of the protocol specification.

### 3.7 — schelling.update Doesn't Refresh Staleness Clock
**Files:** `spec-v2.md` §5.5
**Changes:** Clarified rationale: `last_registered_at` reflects *embedding* freshness, not general activity. Text-only updates don't reset it because the embedding may have drifted. For staleness reset without embedding change, use `schelling.refresh`. For embedding refresh, use `schelling.update` with `recompute_scores: true`.

### 3.8 — Error Code Gaps
**Files:** `spec-v2.md` §14
**Changes:** Added 7 new error codes:
- `RATE_LIMITED` — rate limit exceeded
- `USER_PAUSED` — caller's status is paused
- `VERIFICATION_EXPIRED` — verification request older than 7 days
- `JUROR_REPLACED` — juror was replaced due to non-response
- `ACTIVE_COMMITMENT` — operation blocked by active exclusive commitments
- `PERMANENT_DECLINE` — cannot reconsider a permanent (3×) decline
- `RELAY_BLOCKED` — message blocked by `schelling.relay_block`

---

## Edge Cases Addressed

### 4.1 — Cold Start: First 10 Users
**Files:** `spec-v2.md` §19.1
**Changes:** Added minimum viable population table to Known Limitations. Documented that base matching works from day one; advanced features activate at specific population thresholds.

### 4.2 — Intent Space Crowding
**Files:** `spec-v2.md` §19.2
**Changes:** Added to Known Limitations. Recommended lowering threshold for sparse clusters. Noted potential `cluster_population` field in search responses.

### 4.3 — Scale at 100K Users
**Files:** `spec-v2.md` §5.6
**Changes:** Added scaling note to search operation. Documented that brute-force is feasible up to ~10K users; beyond that, ANN indexing (HNSW, IVF) is RECOMMENDED. Provided expected performance characteristics.

### 4.4 — Compound Intents with Conflicting Configurations
**Files:** `spec-v2.md` §4.3
**Changes:** Clarified that ALL operational behavior (exclusive commitment, decline TTL, module activation, funnel config, deal-breakers) is determined by the primary cluster at registration time. Cross-cluster affinity is for scoring and module activation only, not operational rules.

### 4.5 — Agent Model Discontinuation
**Files:** `spec-v2.md` §5.5, §18.3
**Changes:**
- Agent quality scores decay toward 0.5 (neutral) when no new outcomes recorded for >180 days
- `agent_model` can now be updated via `schelling.update` without re-registration
- Documented decay formula

### 4.6 — Mutual Gate Deadlock
**Files:** `spec-v2.md` §5.8
**Changes:** Added 30-day mutual gate timeout (configurable per cluster via `mutual_gate_timeout_days`). After timeout, the requesting party receives a `mutual_gate_expired` pending action and may decline without reputation penalty.

### 4.7 — Privacy Reconstruction Attack
**Files:** `spec-v2.md` §12.2
**Changes:** Added score quantization at DISCOVERED stage: scores rounded to 2 decimal places. Full-precision scores available from EVALUATED onward. Documented rationale: limits information leakage at early funnel stages.

### 4.8 — Cross-Agent Calibration Drift
**Files:** `spec-v2.md` §20
**Changes:** Updated `schelling.calibrate` reserved operation to include cross-agent calibration alignment: reference embeddings for common intents, cross-model quality tracking.

### 4.9 — Federation with Different Custom Clusters
**Files:** `spec-v2.md` §19.5
**Changes:** Added to Known Limitations. Documented that custom clusters must be agreed upon across federated servers or marked local-only.

### 4.10 — Near-Zero Intent Embeddings
**Files:** `spec-v2.md` §5.4, §6.3; `intent-embedding-spec.md`
**Changes:**
- Minimum L2 norm raised from >0 to ≥0.5
- Added minimum signal breadth: at least 3 dimensions must have |value| > 0.1
- Updated validation rules in §5.4, §6.3, and intent-embedding-spec.md

### 4.11 — Reconsider/Decline Cycling
**Files:** `spec-v2.md` §19.6
**Changes:** Added to Known Limitations. Documented that reconsider rate limit (10/day) + escalating decline TTL mitigate this. Noted servers MAY apply additional limits for excessive cycling.

---

## Implementation Plan Updates

**Files:** `implementation-plan.md`
**Changes:**
- Phase 1: Updated centroid constants source, intent embedding validation (L2 ≥ 0.5, 3+ significant dims), register handler checks ACTIVE_COMMITMENT, new error codes list expanded
- Phase 4: Escalating decline TTL, decline_pair_history table, permanent decline tests
- Phase 5: Rewritten — `schelling.update` supports embeddings with recompute_scores, `schelling.refresh` added, `schelling.relay_block` added, agent_model updatable
- Phase 6: relay-block.ts added to new files
- Phase 9: Jury selection fallback to operator when <3 jurors, Jaccard similarity for candidate pool overlap
- Account deletion handler: anonymize (not delete) reporter's reputation events
- File organization: added refresh.ts, relay-block.ts

---

## Appendix: PLAN.md Contradictions (from Review)

The adversarial review identified 4 contradictions between PLAN.md and the spec. These are documented for reference but no changes were made to PLAN.md (it is a historical document; the spec is authoritative):

1. **PLAN.md Invariant 2** ("Decline is permanent") — Contradicted by spec §5.11–5.12 (declines expire). Spec is correct.
2. **PLAN.md §8.1** (LLM-based dispute resolution) — Superseded by agent jury system in spec §11. Spec is correct.
3. **PLAN.md §3.5.4** ("vertical" terminology) — Replaced by "intent cluster" in spec. Spec is correct.
4. **PLAN.md Invariant 3** ("server never sees raw embeddings") — Aspirational given differential privacy is unenforceable (spec §12.1 now acknowledges this honestly).

---

*End of changelog.*
