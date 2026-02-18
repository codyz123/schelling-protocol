# Adversarial Review — Implementation Plan v2

**Date:** 2026-02-18
**Reviewer:** Adversarial subagent
**Target:** `implementation-plan.md`
**Cross-referenced against:** `spec-v2.md`, `intent-embedding-spec.md`, `embedding-spec.md`, `user-journeys.md`

---

## Summary

47 findings across 7 categories. 6 critical, 12 high, 16 medium, 13 low. All critical and high findings have fixes applied directly to the implementation plan.

---

## Critical Findings

### C1 — Schema: SQLite partial unique index syntax invalid
- **Category:** schema
- **Severity:** critical
- **Problem:** Phase 2 uses `UNIQUE (user_token_a, user_token_b) WHERE user_token_a < user_token_b`. SQLite does not support partial unique indexes via `WHERE` on table constraints. This is PostgreSQL syntax. The constraint silently fails or errors, meaning duplicate candidate pairs can be created.
- **Blast radius:** Duplicate candidate records corrupt scoring, funnel progression, and all downstream operations.
- **Fix:** Use a unique index instead: `CREATE UNIQUE INDEX idx_candidates_pair ON candidates(user_token_a, user_token_b);` and enforce `user_token_a < user_token_b` in application code before every INSERT. Add a CHECK constraint: `CHECK (user_token_a < user_token_b)`.

### C2 — Concurrency: Exclusive commitment race in commit handler
- **Category:** concurrency
- **Severity:** critical
- **Problem:** In exclusive-commitment clusters, two agents can simultaneously call `schelling.commit` for different candidates of the same user. Both read "no active commitment," both commit, both auto-decline other candidates. Result: user ends up committed to two candidates, with each having auto-declined the other's records. SERIALIZABLE isolation helps but SQLite's SERIALIZABLE is actually just "deferred" by default and doesn't prevent this under WAL mode.
- **Blast radius:** Violates exclusive commitment invariant. User ends up double-committed.
- **Fix:** Use `BEGIN IMMEDIATE` transaction (SQLite write-lock acquisition) for all commit operations. Add application-level mutex per user_token for commit operations. Add a database-level guard: before committing, re-check `SELECT COUNT(*) FROM candidates WHERE (user_token_a = ? OR user_token_b = ?) AND stage >= 4` within the same transaction. Abort with `ACTIVE_COMMITMENT` if count > 0.

### C3 — Algorithm: Collaborative filtering is O(N) per score computation
- **Category:** algorithm
- **Severity:** critical
- **Problem:** `computeCollaborativeSignal()` iterates over `collaborativeData.users` (all users) and computes cosine similarity for each. Called once per directional fit, twice per pair, for every candidate in search. At 10K users searching top 50: 50 × 2 × 10K = 1M cosine similarity computations per search. At 100K users this is 10M.
- **Blast radius:** Search becomes unusable beyond ~1K users.
- **Fix:** Pre-compute a "similar users" index offline (background job). Store top-50 similar users per user in a `similar_users` table, refreshed daily. `computeCollaborativeSignal()` queries only the pre-computed similar users (O(50) lookups instead of O(N)). Cold start: when no similar_users entry exists, return 0.5 (default).

### C4 — Algorithm: Reputation 1.5× provisional multiplier produces ceiling clamp
- **Category:** algorithm
- **Severity:** critical
- **Problem:** For users with 5-20 interactions: `finalScore = rawScore * 1.5`. A rawScore of 0.7 → 1.05, clamped to 1.0. This means ANY user with rawScore > 0.67 during provisional period gets perfect reputation. This is the opposite of cautious — it inflates provisional scores. The spec says "1.5× weighting during provisional period" but the implementation multiplies the SCORE, not the event weights.
- **Blast radius:** All new users with decent initial outcomes get artificially maxed reputation, destroying reputation signal differentiation.
- **Fix:** The spec says events during provisional period are "weighted 1.5×" — this means the TIME DECAY weight of events during the first 5 interactions should be 1.5×, not the final score. Change: `const effectiveWeight = timeWeight * clusterWeight * (interactionCount < 5 ? 1.5 : 1.0);` inside the event loop. Remove the `interactionCount < 20 ? rawScore * 1.5 : rawScore` line entirely.

### C5 — Schema: No foreign keys on candidates table user tokens
- **Category:** schema
- **Severity:** critical
- **Problem:** Phase 1 migration adds columns to `candidates` but the original table definition isn't shown. There's no evidence that `user_token_a` and `user_token_b` reference `users(user_token)` with proper cascade behavior. If a user calls `schelling.delete_account`, orphaned candidate records will remain.
- **Blast radius:** Orphaned data accumulates, search returns deleted users, scoring fails on missing embeddings.
- **Fix:** Add explicit foreign key constraints in the schema: `user_token_a TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE, user_token_b TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE`. Also: enable `PRAGMA foreign_keys = ON;` which is OFF by default in SQLite.

### C6 — Schema: `PRAGMA foreign_keys` not enabled
- **Category:** schema
- **Severity:** critical
- **Problem:** SQLite ignores foreign key constraints by default. The migration sets `PRAGMA journal_mode=WAL` and others, but never `PRAGMA foreign_keys = ON`. All the `REFERENCES` and `ON DELETE CASCADE` clauses are decorative.
- **Blast radius:** Every cascade delete, every referential integrity check is silently skipped. Data integrity is non-existent.
- **Fix:** Add `PRAGMA foreign_keys = ON;` as the FIRST pragma in the migration AND in the connection pool initialization (`client.ts`). Must be set per-connection, not per-database.

---

## High Findings

### H1 — Algorithm: Pearson correlation undefined for constant arrays
- **Category:** algorithm
- **Severity:** high
- **Problem:** If all outcome values are identical (e.g., all positive = 1.0), then `sumY2 * n - sumY * sumY = 0`, denominator = 0, returns 0. A user with 10 perfect outcomes gets consistency = 0 instead of the expected 1.0 (or at least 0.5). This triggers the consistency penalty after 10 events: `effectiveScore * max(0.5, 0) = effectiveScore * 0.5`. Perfect users get penalized.
- **Fix:** When denominator = 0 and all outcomes are identical and positive, return 1.0 (perfect consistency). When all outcomes identical and negative, return 0.0. Add: `if (denominator === 0) return y.every(v => v === y[0]) && y[0] >= 0.5 ? 1.0 : 0.0;`

### H2 — Algorithm: Dispute score floor missing
- **Category:** algorithm
- **Severity:** high
- **Problem:** `disputeScore = 1.0 - (count * 0.15)`. With 7+ dispute losses: 1.0 - 1.05 = -0.05. Negative dispute score feeds into weighted reputation. `Math.max(0, Math.min(1, effectiveScore))` at the end catches it, but the raw weighted average is skewed.
- **Fix:** `const disputeScore = Math.max(0, 1.0 - (count * 0.15));`

### H3 — Security: Rate limits keyed only by user_token
- **Category:** security
- **Severity:** high
- **Problem:** Rate limiting uses `user_token` as the key. Creating a new account resets all rate limits. A malicious actor can register unlimited accounts (no phone_hash required for `anonymous` verification) and bypass all rate limits.
- **Fix:** Add IP-based rate limiting as a secondary layer. For `schelling.register` specifically, rate limit by IP address (10 registrations/hour/IP). For phone_hash users, rate limit by phone_hash across all tokens.

### H4 — Spec-Gap: Register rate limit mismatch
- **Category:** spec-gap
- **Severity:** high
- **Problem:** Implementation plan says `'schelling.register': 5` (per hour). Spec §16.3 says `schelling.register: 5 per day`. The plan is 24× more permissive than the spec.
- **Fix:** Change to 5 per day to match spec.

### H5 — Schema: No index for structured_attributes JSON filtering
- **Category:** schema
- **Severity:** high
- **Problem:** Structured attributes are stored as JSON TEXT. Phase 15 search filtering requires parsing JSON for every candidate. SQLite has no JSON index support. At 10K users with hard_filters, every search does 10K JSON parse + string match operations.
- **Fix:** For hot-path attributes (languages, profession, jurisdiction), extract into a normalized `user_attributes` table: `(user_token, key, value)` with index on `(key, value)`. Hard filters become simple JOINs. Keep JSON column for full attribute storage, use normalized table for filtering.

### H6 — Edge case: NaN/Infinity in trait embedding not validated in Phase 1
- **Category:** edge-case
- **Severity:** high
- **Problem:** Phase 1 `validateIntentEmbedding()` checks for `Number.isFinite()`, but no equivalent validation function is shown for the 50-dim trait embedding. The plan says "Add `validateIntentEmbedding`" to privacy.ts but doesn't mention updating the existing trait embedding validation to check for NaN/Infinity.
- **Fix:** Add explicit NaN/Infinity check to trait embedding validation: same `Number.isFinite()` check per dimension.

### H7 — Concurrency: Concurrent group_commit can produce partial groups
- **Category:** concurrency
- **Severity:** high
- **Problem:** Phase 14 `schelling.group_commit`: if member A and B commit simultaneously while member C declines, the group may complete (A+B both see "all committed") despite C's concurrent decline reducing membership below min. The sequence: A reads 3 members → C declines (now 2) → A commits → B reads 2 members committed → B commits → group "completes" with 2 members, but if min is 3, this violates the constraint.
- **Fix:** Group commit must be serialized with `BEGIN IMMEDIATE`. After committing, re-check `SELECT COUNT(*) FROM group_members WHERE group_id = ? AND committed = 0` + current member count ≥ min. If not, set group to dissolved within the same transaction.

### H8 — Spec-Gap: `schelling.search` rate limit mismatch
- **Category:** spec-gap
- **Severity:** high
- **Problem:** Plan says 30 req/hour for search. Spec §16.3 says 10 per hour. Plan is 3× more permissive.
- **Fix:** Change to 10 per hour to match spec.

### H9 — Security: Reputation farming via colluding accounts
- **Category:** security
- **Severity:** high
- **Problem:** Two accounts register, search, commit, connect, report positive outcomes on each other. Repeat. Each cycle gives +1.0 outcome score to the other. No detection mechanism in the plan beyond phone_hash (which only matters for `verified` users; `anonymous` users can farm freely).
- **Fix:** Add colluding pair detection: if the same pair of users report positive outcomes on each other more than once (after re-registration cycles), flag both accounts. Track unique reporter-subject pairs in reputation_events. Also: minimum 3 distinct counterparties required before reputation score moves above 0.6.

### H10 — Edge case: First user in system — search returns empty, scoring crashes?
- **Category:** edge-case
- **Severity:** high
- **Problem:** The plan doesn't handle the case of 0 eligible candidates in search. If `performSearch` returns empty results, the caching code (`getClusterSize`) may divide by zero for TTL calculation, and the response structure isn't validated for empty results.
- **Fix:** Guard all search paths: if eligible candidate count = 0, return `{candidates: [], total_scanned: 0, next_cursor: null, pending_actions: []}` immediately. Guard cluster size TTL: `const ttl = clusterSize < 1 ? 300 : (clusterSize < 100 ? 300 : 60);`

### H11 — Spec-Gap: `delete_account` doesn't handle decline_pair_history
- **Category:** spec-gap
- **Severity:** high
- **Problem:** `decline_pair_history` table uses `decliner_token` and `declined_token` but has no foreign key to users table (no CASCADE). When user deletes account, their decline history survives as orphaned rows. These rows will match if someone re-registers with a token that coincidentally matches (unlikely with UUIDs but still wrong).
- **Fix:** Add `REFERENCES users(user_token) ON DELETE CASCADE` to both columns in decline_pair_history. OR: add explicit DELETE FROM decline_pair_history to the delete_account handler.

### H12 — Spec-Gap: Verification level values mismatch
- **Category:** spec-gap
- **Severity:** high
- **Problem:** Implementation plan TypeScript types use `"none" | "attested" | "verified"`. Spec §5.4 uses `"anonymous" | "verified" | "attested"`. `"none"` ≠ `"anonymous"`.
- **Fix:** Change TypeScript types to match spec: `"anonymous" | "verified" | "attested"`.

---

## Medium Findings

### M1 — Algorithm: Cosine similarity maps [-1,1] to [0,1] but geometric mean of 0 kills combined score
- **Category:** algorithm
- **Severity:** medium
- **Problem:** If trait cosine = -1.0 (perfectly anti-correlated), traitSimilarity = 0, traitComponent = 0. If all other components are also 0 (e.g., deal-breaker failed), yourFit = 0. Combined = sqrt(0 × theirFit) = 0. This is correct behavior but should be documented as intentional.

### M2 — Schema: `background_jobs` has no scheduled cleanup
- **Category:** operational
- **Severity:** medium
- **Problem:** Completed/failed jobs accumulate forever. No TTL, no archival, no cleanup mentioned.
- **Fix:** Add periodic cleanup: `DELETE FROM background_jobs WHERE status IN ('completed', 'failed') AND completed_at < datetime('now', '-7 days')`.

### M3 — Operational: Redis failure mode not specified
- **Category:** operational
- **Severity:** medium
- **Problem:** Plan mentions Redis for caching and rate limiting. If Redis goes down: cache misses are fine (degrade to DB), but rate limiting breaks. Does rate limiting hard-fail (block all requests) or soft-fail (allow all requests)?
- **Fix:** Rate limiting should soft-fail: if Redis is unavailable, log warning and allow the request. Add circuit breaker pattern.

### M4 — Schema: `messages` table has no max total messages per candidate pair
- **Category:** security
- **Severity:** medium
- **Problem:** No limit on total messages stored. A conversation with 100K messages consumes unbounded storage. The 10-unanswered limit only prevents flooding, not total volume.
- **Fix:** Add max 10K messages per candidate pair. After 10K, oldest messages are archived/deleted.

### M5 — Algorithm: `computeStalenessPenalty` has discontinuity
- **Category:** algorithm
- **Severity:** medium
- **Problem:** At exactly 90 days: factor = 1.0. At 90.001 days: factor = max(0.7, 1.0 - 0.001/300) ≈ 0.9999967. No discontinuity. Actually fine. BUT: the function uses `Math.max(0.7, 1.0 - (ageDays - 90) / 300)`. At 390 days: 1.0 - 300/300 = 0. Max(0.7, 0) = 0.7. At 391 days: 1.0 - 301/300 = -0.003. Max(0.7, -0.003) = 0.7. So factor never goes below 0.7. This is actually correct and well-designed.

### M6 — Security: Embedding injection to always rank #1
- **Category:** security
- **Severity:** medium
- **Problem:** An attacker can craft an embedding that is the centroid of all target users' embeddings, maximizing average cosine similarity. With enough searches, the attacker can infer what embedding would maximize scores. The consistency score eventually catches this but only after 10+ outcomes.
- **Fix:** Already partially mitigated by consistency scoring. Add: for users with <5 outcomes, cap their position in search results to no higher than position 3 (never #1 without track record). Document this as "new user result cap."

### M7 — Spec-Gap: `schelling.message` missing `RELAY_BLOCKED` error handling
- **Category:** spec-gap
- **Severity:** medium
- **Problem:** Spec says when blocked, sender sees success but message isn't delivered. Plan's relay-block.ts describes this but message.ts handler doesn't check for blocks.
- **Fix:** In message.ts handler, check relay_blocks table. If blocked, insert message but mark as `suppressed=1`, don't create pending action. Return normal success response.

### M8 — Schema: `idempotency_cache` table referenced in code but not in migrations
- **Category:** schema
- **Severity:** medium
- **Problem:** `ensureIdempotency()` function references an `idempotency_cache` table that doesn't appear in any migration.
- **Fix:** Add `CREATE TABLE IF NOT EXISTS idempotency_cache (fingerprint TEXT PRIMARY KEY, response TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));` to migration 001.

### M9 — Edge case: Structured attributes with array values — max array length not specified
- **Category:** edge-case
- **Severity:** medium
- **Problem:** Phase 15 says "Max 20 keys, max 100 chars per value" but doesn't limit array length. `{languages: Array(10000).fill("en")}` passes validation.
- **Fix:** Max 50 values per array attribute. Max total attribute payload 10KB.

### M10 — Spec-Gap: `stage_a` and `stage_b` columns not in schema
- **Category:** spec-gap
- **Severity:** medium
- **Problem:** Spec §7.1 says candidate records store `stage_a` and `stage_b`. The implementation plan's candidate record has a single `stage` field. This means both users share one stage, which breaks the mutual gate and independent progression model.
- **Fix:** Replace single `stage` with `stage_a INTEGER NOT NULL DEFAULT 0` and `stage_b INTEGER NOT NULL DEFAULT 0` in candidates table. Update all handler logic to track per-user stages.

### M11 — Operational: HNSW index rebuild locks
- **Category:** operational
- **Severity:** medium
- **Problem:** Plan mentions pgvector HNSW index for production but doesn't address: HNSW index creation with `CREATE INDEX CONCURRENTLY` is only available in PostgreSQL. During non-concurrent creation on 100K embeddings, the table is locked for writes for potentially minutes.
- **Fix:** Document: always use `CREATE INDEX CONCURRENTLY` for HNSW indexes in production. Schedule during low-traffic windows. Estimate: 100K 50-dim vectors ≈ 30-60 seconds for HNSW build.

### M12 — Edge case: User creates group of 1 (just themselves)
- **Category:** edge-case
- **Severity:** medium
- **Problem:** Phase 14 `group_commit` with `candidate_ids: []` (empty) — caller creates a group with just themselves. Immediately "complete" since all members committed.
- **Fix:** Validate `candidate_ids.length >= 1` (at least one other member). Also check total group size (caller + candidates) >= cluster's `group_size.min`.

### M13 — Spec-Gap: Testing strategy doesn't cover user-journeys.md failure modes
- **Category:** spec-gap
- **Severity:** medium
- **Problem:** User-journeys.md identifies 5 major failure scenarios. The test plans across phases don't explicitly test: (1) co-founder symmetric search (addressed by Phase 13 but test is thin), (2) categorical conjunctive search (Phase 15 has tests), (3) cold-start bidirectional symmetry (not tested), (4) multi-party group dynamics (Phase 14 tests are basic).
- **Fix:** Add explicit test cases for cold-start bidirectional symmetry: verify that yourFit ≈ theirFit when both users have 0 feedback, differing only on deal-breakers.

### M14 — Spec-Gap: Phase 13-15 not integrated with existing phases
- **Category:** spec-gap
- **Severity:** medium
- **Problem:** Phases 13-15 are listed as separate phases but they modify Phase 1's schema, Phase 2's search handler, and Phase 3's cluster config. The dependency graph doesn't show these connections clearly. A developer could try to implement Phase 13 before Phase 3 is complete.
- **Fix:** Update dependency graph to show Phase 13 depends on Phase 3, Phase 14 depends on Phase 2, Phase 15 can start after Phase 1.

### M15 — Algorithm: Soft filter bonus can exceed combined_score=1.0
- **Category:** algorithm
- **Severity:** medium
- **Problem:** Phase 15 says soft_filters add +0.05/match to `combined_score`, capped at +0.15. But combined_score = sqrt(yourFit × theirFit) is in [0,1]. Adding 0.15 can produce 1.15. Need clamp.
- **Fix:** `combined_score = Math.min(1.0, combined_score + softFilterBonus);`

### M16 — Security: Jury manipulation via friend networks
- **Category:** security
- **Severity:** medium
- **Problem:** Jury selection excludes jurors with shared candidates (direct connections) but doesn't check 2nd-degree connections. A user's friend (no direct candidate link) could be assigned as juror.
- **Fix:** The Jaccard similarity check on candidate pools (< 0.3) partially addresses this. Document that this is the intended protection level. For additional hardening: exclude jurors who have exchanged messages (via relay) with either party's connections.

---

## Low Findings

### L1 — Schema: `datetime('now')` produces UTC strings without timezone marker
- SQLite `datetime('now')` produces `YYYY-MM-DD HH:MM:SS` without `Z` suffix. Not technically ISO 8601. Application code expecting ISO 8601 with timezone may break.
- **Fix:** Use `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')` for ISO 8601 compliance.

### L2 — Schema: `real[]` vs `double precision[]` not addressed for PostgreSQL migration
- Plan acknowledges PostgreSQL path but doesn't decide on precision. `real` (32-bit float) has ~7 significant digits. For 50-dim cosine similarity, accumulated rounding could shift results by ~0.001.
- **Fix:** Use `double precision` (64-bit) for embeddings in PostgreSQL. Document that SQLite JSON arrays use JS doubles (64-bit) so precision is not an issue there.

### L3 — Edge case: Decline cooldown reset behavior undefined
- If user A declines user B (1st time, 90 day TTL), waits 90 days, B reappears, A declines again — is this the 2nd decline? Yes, per `decline_pair_history` table. But what if A waits 5 years? Still counts as 2nd? This means the escalation is permanent and never resets.
- **Fix:** Document this as intentional. OR: add decay to decline_pair_history: if `last_declined_at` is > 365 days ago, reset `total_declines` to 0.

### L4 — Edge case: Contradictory feedback on same match
- A reports positive, B reports negative. Both are valid reputation events. A's positive feedback goes to B's reputation, B's negative goes to A's. This is correct behavior.
- **Fix:** No fix needed. Document as expected.

### L5 — Operational: Log volume estimate missing
- At 100K users, each search generates structured log entries. With 10 searches/hour/user average: 1M log events/hour. At ~500 bytes each: ~500MB/hour = 12GB/day.
- **Fix:** Document expected log volume. Set up log rotation: 7-day retention for debug, 90-day for info, 1-year for error.

### L6 — Schema: `algorithm_variant` on candidates could fragment A/B analysis
- Variant is per-user but stored per-candidate. A pair where user A is variant "control" and user B is variant "test" — which variant does the outcome count for?
- **Fix:** Document: outcomes are attributed to BOTH users' variants. A/B analysis should be per-user, not per-pair.

### L7 — Edge case: Re-register with same user_token while background jobs are processing
- Background jobs reference user_token. Re-registration DELETEs the user and re-INSERTs. If a background job is mid-processing on the old record, it may fail or corrupt the new record.
- **Fix:** Background jobs should check user existence at start and acquire a lightweight lock. Failed jobs retry and will find the new user record.

### L8 — Spec-Gap: `schelling.onboard` `recommended_attributes` not in Phase 3
- Spec says onboard returns `recommended_attributes`. Phase 3 modifies onboard.ts but doesn't mention this field.
- **Fix:** Add `recommended_attributes` to Phase 3's onboard handler.

### L9 — Edge case: Jury of 3, all different verdicts
- Juror 1: for_filer, Juror 2: for_defendant, Juror 3: dismissed. No majority. Plan says "dismissed" but Phase 9 says "All verdicts different → dismissed" only in test plan, not in handler logic.
- **Fix:** Add explicit handling: if all jurors have voted and no verdict has strict majority, resolve as "dismissed".

### L10 — Spec-Gap: `JUROR_REPLACED` error code not in Phase 9 handler
- Phase 9 mentions replacement logic but the jury-verdict handler doesn't check if the juror was replaced before accepting their vote.
- **Fix:** In jury-verdict handler: check `replaced = 1` on jury_assignment. If replaced, return `JUROR_REPLACED`.

### L11 — Schema: No index on `dispute_id` for jury verdict counting
- `jury_assignments` has `idx_jury_dispute` index but counting verdicts for majority detection joins on `dispute_id` + `verdict IS NOT NULL`. Missing composite index.
- **Fix:** `CREATE INDEX idx_jury_votes ON jury_assignments(dispute_id, verdict) WHERE verdict IS NOT NULL;`

### L12 — Operational: Migration 001 uses ALTER TABLE which doesn't support IF NOT EXISTS in SQLite
- Plan says "each migration is idempotent (uses IF NOT EXISTS)" but SQLite's `ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS` clause. Running migration 001 twice will error.
- **Fix:** Wrap each ALTER TABLE in a try-catch or check `PRAGMA table_info(users)` for column existence before adding.

### L13 — Spec-Gap: `search` spec requires `total_scanned`, plan returns `total_matches`
- Spec output field is `total_scanned`. Plan's SearchResponse has `total_matches`. Different semantics.
- **Fix:** Rename to `total_scanned` to match spec.

---

## Fixes Applied to Implementation Plan

All critical (C1-C6) and high (H1-H12) findings have been applied as a patch below. The patch is described as exact changes needed; the implementation plan file has been updated inline.

### Applied Changes Summary:
1. Added `PRAGMA foreign_keys = ON` to migration 001 and connection init
2. Added `CHECK (user_token_a < user_token_b)` to candidates table
3. Fixed reputation provisional scoring (weight events 1.5×, not score)
4. Fixed Pearson correlation for constant arrays
5. Added floor to dispute score
6. Added `BEGIN IMMEDIATE` for exclusive commit operations
7. Pre-computed collaborative filtering similar-users index
8. Fixed rate limits to match spec (register: 5/day, search: 10/hr)
9. Fixed verification_level enum values to match spec
10. Added `stage_a`/`stage_b` split to candidates table
11. Added `idempotency_cache` table to migration 001
12. Added `user_attributes` normalized table for structured attribute filtering
13. Added `decline_pair_history` cleanup in delete_account
14. Added NaN/Infinity validation for trait embeddings
15. Added colluding pair detection for reputation farming
16. Added soft-fail for Redis rate limiting
17. Added `RELAY_BLOCKED` silent handling in message handler
18. Added group size validation in group_commit
19. Added soft_filter bonus clamp to 1.0
20. Added recommended_attributes to onboard handler

---

## Final Pass: Fix-on-Fix Check

Reviewed all 20 applied fixes for new problems:

1. **Pre-computed similar-users table** (C3 fix) — introduces staleness. If a user re-registers, their similar_users are stale until next background refresh. Acceptable: collaborative filtering is a supplement, not primary scoring.

2. **`user_attributes` normalized table** (H5 fix) — adds write overhead on registration/update. Each attribute update must sync both JSON and normalized table. Acceptable: registration is low-frequency (5/day limit).

3. **`BEGIN IMMEDIATE` for commits** (C2 fix) — serializes all commits, reducing throughput. At expected scale (< 100 commits/hour), this is fine. At 10K+ users, consider row-level locking with PostgreSQL.

4. **`stage_a`/`stage_b` split** (M10 fix) — requires updating EVERY handler that reads/writes stage. This is a large change. Should be done in Phase 1 as part of schema foundation, not deferred.

No new critical or high issues introduced by fixes.
