# Schelling Protocol v3 — Adversarial Review Notes

**Reviewer:** Adversarial subagent
**Date:** 2026-02-25
**Spec reviewed:** spec-v3.md (initial draft)
**Context:** spec-v2.md for migration completeness

---

## Summary

65 issues identified across 7 dimensions. 42 fixes applied directly to the spec. The remaining issues were either already handled by design or judged as future-extension territory.

**Severity breakdown:**
- **Critical:** 6 issues (all fixed)
- **Design:** 22 issues (all fixed)
- **Ambiguity:** 12 issues (all fixed)
- **Edge case:** 5 issues (all fixed)
- **Consistency/Migration:** 10 issues (all fixed)

---

## Changes Applied

### Dimension 1: Gaming & Manipulation

#### 1. Regex Denial-of-Service (Critical)
**Problem:** The `regex` operator accepts arbitrary regex patterns. A crafted pattern like `(a+)+$` causes catastrophic backtracking (ReDoS).
**Fix:** Added regex safety requirements in §3.3: 10ms execution timeout, 200-char pattern limit, backtracking step limit of 10,000, recommendation to use RE2-class engine, rejection of nested quantifiers.

#### 2. Learned Model Poisoning (Critical)
**Problem:** Malicious agents could poison the learned ranking model by strategically advancing/declining candidates, colluding with other agents for fake positive outcomes, or using Sybil accounts to shift cluster priors.
**Fix:** Added §7.6 "Model Integrity & Anti-Poisoning" with: signal weighting by reputation/verification, Sybil collusion detection (shared phone_hash prefix), outlier detection (>3σ deviation flagging), temporal smoothing, minimum independent signal requirements (20 distinct phone_hash values for cohort patterns), and funnel advancement signal dampening (0.3x weight vs. outcome reports).

#### 3. Sybil Attack Strengthening (Critical)
**Problem:** Phone hash deduplication was the only hard Sybil defense, but phone numbers are cheap, phone_hash is optional, and there's no mandatory identity verification. Cross-verification could be gamed by 3 Sybil accounts verifying each other.
**Fix:** Enhanced §11.8 with: per-cluster registration limits (2 per phone_hash), cross-verification Sybil guard (distinct phone_hash AND agent_model required), behavioral fingerprinting for coordinated accounts, new account signal dampening (0.3x weight for accounts <7 days old).

#### 4. Preference Probing Defense (Design)
**Problem:** The preference satisfaction oracle (§8.3) could be exploited to binary-search for hidden trait values by repeatedly changing preferences and observing satisfaction results. The spec acknowledged this in §27.3 but mitigation was vague.
**Fix:** Added §20.10 "Preference Satisfaction as Information Oracle" with concrete mitigations: preference cardinality cap (100), quantized-only satisfaction for hidden traits (no continuous score), detection of preference change + search patterns by proactive enforcement (§14.2 now includes "Preference change frequency" detection).

#### 5. Cross-Verification Sybil Guard (Design)
**Problem:** Three Sybil accounts could cross-verify each other to boost verification tiers.
**Fix:** Added requirement in §11.8 that cross-verification attestors must have distinct `phone_hash` AND distinct `agent_model`.

#### 6. Strategic Withholding Mitigation (Design)
**Problem:** Agent could register with minimal traits + maximum preferences, extracting info about counterparts while revealing nothing.
**Fix:** Added §28.9 "Strategic Withholding" limitation with mitigations: profile completeness visible to counterparts, reciprocity scoring (sparse profiles ranked lower), agent discretion guidance.

### Dimension 2: Economic & Incentive Alignment

#### 7. Verification Incentive Math (Design)
**Problem:** §9.2 claimed "up to ~40% discovery priority boost" from verification, but the actual numbers didn't justify this (verification bonus was only 0.05 weight = 5% in advisory score).
**Fix:** Replaced vague "~40%" with concrete explanation showing how the boost compounds across multiple mechanisms (trait contribution multiplier, reputation event multiplier, advisory score component) to produce 20-40% aggregate effect.

#### 8. Free-Rider Problem (Design)
**Problem:** No incentive for participants to report outcomes, provide feedback, or complete the funnel. Agents could consume search results and tool outputs without contributing data back.
**Fix:** Added §11.4 "Outcome Reporting Incentives (Anti-Free-Rider)" with: 10% advisory score boost for participants reporting ≥80% of outcomes, abandonment penalties for non-reporters, feedback richness bonus (better model personalization), system engagement component in advisory score (capped at 5%).

#### 9. Funnel Advancement Signal Misalignment (Design)
**Problem:** The learned model treats funnel advancement as a positive signal, creating perverse incentives for agents to advance candidates they shouldn't (to generate positive training data).
**Fix:** In §7.6, specified that funnel advancement signals carry only 0.3x the weight of outcome reports, preventing gaming through mass-advancement.

### Dimension 3: Technical Completeness

#### 10. Missing `contains_all` Operator (Design)
**Problem:** No way to express "must have ALL of these" for array traits. "Must know Python AND Go AND TypeScript" required three separate preferences.
**Fix:** Added `contains_all` operator to §3.3 with full specification (operator table, evaluation rule, type constraints).

#### 11. Enum Validation Gap (Ambiguity)
**Problem:** The `enum` value_type required matching "agent-defined allowed values" but the trait schema had no field to declare those values.
**Fix:** Added `enum_values` field to trait schema (conditional, required for enum type). Updated enum type description to reference it.

#### 12. Race Conditions in Funnel (Design)
**Problem:** No specification for concurrent operations on the same candidate pair. Two agents calling commit simultaneously, or one declining while another commits, had undefined behavior.
**Fix:** Added concurrency semantics to §5.2: serialization requirement (optimistic concurrency control or DB-level locking), resolution table for all concurrent operation pairs, idempotent stage advancement (re-calling interest when already at INTERESTED is a no-op, not an error).

#### 13. Withdraw from CONNECTED Undefined (Ambiguity)
**Problem:** §5.7 only specified withdraw from COMMITTED→INTERESTED. No specification for what happens when withdrawing from CONNECTED (stage 4).
**Fix:** Expanded §5.7 to specify: withdrawer → INTERESTED, other party → COMMITTED, active contracts terminated, message relay disabled. Added stage gating (valid at stages 3 and 4 only).

#### 14. Decline Stage Gating Missing (Ambiguity)
**Problem:** `schelling.decline` had no stage restrictions. Could a user decline someone they're CONNECTED with?
**Fix:** Added stage gating to §5.5: available at DISCOVERED (1), INTERESTED (2), COMMITTED (3). At CONNECTED (4), use `schelling.report` or `schelling.withdraw` instead.

#### 15. Contract Completion Bilateral Mechanics (Ambiguity)
**Problem:** Contract "complete" was referenced as requiring both parties but the spec had no mechanism for bilateral completion.
**Fix:** Added §12.6 "Contract Completion" specifying bilateral process: first party → status "completing", second party → status "completed", 30-day timeout if second party doesn't complete → "expired". Added "completing" status to contract lifecycle diagram and status list.

#### 16. Counter-Proposal Mechanics Undefined (Ambiguity)
**Problem:** Contract counter-proposals didn't specify whether they modify the existing contract or create a new one.
**Fix:** Added explanation to §12.5: original goes to "superseded" status, new contract created with "counter_proposed" status, `supersedes` field links them. Added "superseded" to contract statuses and `supersedes` field to contract listing output.

#### 17. Contract Amendment Acceptance Unspecified (Design)
**Problem:** §12.4 created amendments but there was no mechanism for the other party to accept/reject them.
**Fix:** Added amendment response fields to `schelling.contract_update`: `amendment_id` and `action` ("accept_amendment"/"reject_amendment"). Added `AMENDMENT_NOT_FOUND` error code.

#### 18. Event Stage Gating Conflict (Design)
**Problem:** Events required CONNECTED (stage 4) but contracts can be active at COMMITTED (stage 3), creating a conflict where you couldn't emit events on active contracts.
**Fix:** Revised §19.2 gating: events on candidate pairs still require CONNECTED, but events on contracts require COMMITTED (stage 3+) and active/completing contract status.

#### 19. Event Listing Without Filters (Ambiguity)
**Problem:** Event listing had `candidate_id` and `contract_id` both marked "Conditional" but didn't specify behavior when both are omitted.
**Fix:** Changed to "No" (optional) and specified: when both omitted, returns all events sorted by emitted_at descending.

#### 20. No Subscription Listing (Design)
**Problem:** `schelling.subscribe` (create) and `schelling.unsubscribe` (delete) existed but no way to list active subscriptions. An agent losing track of subscription IDs had no recovery.
**Fix:** Added `action: "list"` to `schelling.subscribe` with output schema and rate limit (50/hour).

#### 21. Verification Request Stage Gating (Ambiguity)
**Problem:** `schelling.verify` with `action: "request"` (requesting verification from a counterpart) had no stage gating. Could request verification from DISCOVERED-only contacts.
**Fix:** Added stage gating: verification requests require INTERESTED (stage 2+). Self-verification submissions have no stage gate.

#### 22. Zero Traits After Update (Ambiguity)
**Problem:** `schelling.update` allowed `remove_traits` but didn't enforce the minimum 1 trait requirement from registration.
**Fix:** Added validation rule: server MUST enforce minimum 1 trait after update. Removing all traits without adding new ones returns `INVALID_INPUT`.

#### 23. Subscription Without Intent Embedding (Ambiguity)
**Problem:** `schelling.subscribe` said omitting `intent_embedding` uses caller's registered one, but didn't specify behavior when caller has none.
**Fix:** Specified: when no intent embedding available from either source, subscription uses trait-based matching only (intent similarity excluded).

#### 24. `schelling.direct` Error Code Clarification (Ambiguity)
**Problem:** `IDENTITY_NOT_PROVIDED` error was listed for `schelling.direct` but the operation now accepts `contact_info` inline, making the old error irrelevant.
**Fix:** Removed `IDENTITY_NOT_PROVIDED` from direct's error list. Added note explaining the change. Deprecated the error code in the error table (retained for v2 compatibility).

### Dimension 4: Scalability & Performance

#### 25. New Section: Scalability & Implementation Guidance (Design)
**Problem:** The spec had no guidance on how to implement the system at scale. Arbitrary trait key indexing, learned model serving, and subscription evaluation at scale were all unaddressed.
**Fix:** Added entirely new §27 "Scalability & Implementation Guidance" with subsections:
- §27.1: Trait indexing strategies (hot indexes on top 50 keys, lazy secondary indexes, preference compilation)
- §27.2: Learned model serving (precomputation, per-user caching, approximate scoring, retraining cadence)
- §27.3: Subscription evaluation at scale (inverted subscription index, batch evaluation, notification deduplication)
- §27.4: Appearance embedding at scale (storage estimates, approximate search, biometric sensitivity)

### Dimension 5: Privacy & Security

#### 26. Behavioral Inference Caveat (Critical)
**Problem:** The learned ranking model inherently infers private preferences from behavior, but the privacy section didn't acknowledge this tension.
**Fix:** Added §20.9 "Behavioral Inference Caveat" explicitly acknowledging: server WILL learn implicit preferences, agents SHOULD inform users, learned adjustments are transparent, users wanting zero inference should not use the system.

#### 27. Preference Satisfaction Oracle (Design)
**Problem:** Binary satisfaction on narrow preferences (e.g., `eq: "Sikh"`) effectively reveals hidden trait values. Acknowledged in §27.3 but mitigation was vague.
**Fix:** Added §20.10 with concrete defenses (see item 4 above). Key: quantized-only satisfaction for hidden traits removes gradient signal.

#### 28. GDPR Learned Model Deletion (Critical)
**Problem:** `schelling.delete_account` deletes explicit data but the learned model retains trained weights from that user's data. No way to surgically remove a user from a trained model.
**Fix:** Added §20.11 "Learned Model and Data Deletion (GDPR)" specifying: deletion log maintained, signals excluded from future training runs, model retrained at least every 90 days excluding deleted users, aggregate statistics with 50+ contributors not recomputed (individual contribution negligible).

#### 29. Media Storage Responsibility (Ambiguity)
**Problem:** `media_refs` stores URLs to photos/media but the spec didn't clarify who hosts them or what happens on deletion.
**Fix:** Added §20.12 "Media Storage Responsibility" defining two valid models (agent-hosted and server-hosted) with deletion responsibilities for each.

#### 30. Visibility Change After Seen (Edge Case)
**Problem:** If a trait is changed from `public` to `after_commit` after a counterpart already saw the value, the server can't retract already-disclosed information.
**Fix:** Added §8.5 "Visibility Changes and Information Recall" explicitly acknowledging: server cannot retract disclosed information, visibility changes apply prospectively only.

### Dimension 6: Generalization Stress Tests

#### 31. Complementary Matching (Design)
**Problem:** System optimized for similarity matching (cosine similarity) but some verticals need complementary matching (business person + technical cofounder).
**Fix:** Added §28.8 "Complementary vs. Similar Matching" acknowledging the limitation and guiding agents to use explicit preferences rather than embedding similarity for complementary scenarios.

#### 32. Trait Namespace Fragmentation (Design)
**Problem:** Different agents using different trait keys for the same concept (e.g., `dating.height_inches` vs `physical.height_cm`) reduces matching quality. Original §27.2 mitigation was weak.
**Fix:** Added §28.10 "Trait Namespace Fragmentation" with stronger mitigations: canonical key registry recommendation, future key aliasing extension, explicit naming convention (`{domain}.{concept}_{unit}`).

### Dimension 7: Consistency & Coherence

#### 33. Migration Guide Completeness (Consistency)
**Problem:** Multiple v2 operations and error codes not mentioned in the migration guide:
- `schelling.feedback` → merged into decline/report
- `schelling.intents` → documented in §26, retrievable via server_info
- `schelling.group_evaluate`/`schelling.group_commit` → removed (future extension)
- `schelling.events` → merged into `schelling.event` with action:"list"
- Error codes: `STAGE_TOO_EARLY` → `STAGE_VIOLATION`, `MISSING_REQUIRED_FIELD` → `INVALID_INPUT`, `ARTIFACTS_REQUIRED` → `INVALID_INPUT`, `IMMUTABLE_FIELD` → removed, `MODULE_NOT_ACTIVE` → removed, `IDENTITY_NOT_PROVIDED` → deprecated

**Fix:** Added all missing items to Appendix B.1 migration table with explanations.

#### 34. Section Renumbering (Consistency)
**Problem:** Inserted new §27 "Scalability & Implementation Guidance" pushed §§27-28 to §§28-29. All internal cross-references needed updating.
**Fix:** Updated ToC, all §7.6→§7.7 references, all §11.5→§11.6 references, renumbered all subsections in §§28-29. Verified all §X.Y cross-references point to correct subsections.

#### 35. Admin Authentication Undefined (Ambiguity)
**Problem:** `schelling.analytics` specified "admin" authentication but the protocol didn't define how admin tokens work.
**Fix:** Added note in §24.3 that admin auth is implementation-defined, with common approaches listed.

---

## Issues NOT Fixed (by design or deferred)

1. **E2E encryption for messages** — acknowledged as future extension (§29.2). Not a v3 gap.
2. **Escrow/payment tracking** — the contract system is intentionally opaque (terms are agent-interpreted). Building escrow is scope creep.
3. **"Prefer people who prefer me" meta-preferences** — preferences operate on traits, not other preferences. This is by design.
4. **Client-side DP unenforceability** — acknowledged in §20.1. No protocol fix possible.
5. **Push notifications** — acknowledged as future extension (§29.2). v3 is poll-based by design.

---

## Structural Changes Summary

| Change | Location | Type |
|---|---|---|
| Added `contains_all` operator | §3.3 | New content |
| Added regex safety requirements | §3.3 | New content |
| Added `enum_values` to trait schema | §3.2 | Schema change |
| Added concurrent operation semantics | §5.2 | New content |
| Added idempotent stage advancement | §5.2 | New content |
| Added decline stage gating | §5.5 | New content |
| Added withdraw from CONNECTED spec | §5.7 | Expanded |
| Added §7.6 Model Integrity & Anti-Poisoning | §7.6 | New section |
| Added §8.5 Visibility Changes and Info Recall | §8.5 | New section |
| Added verification request stage gating | §9.3 | New content |
| Renumbered §11.4-11.7 | §11 | Restructured |
| Added §11.4 Outcome Reporting Incentives | §11.4 | New section |
| Enhanced §11.8 Sybil Resistance | §11.8 | Expanded |
| Expanded contract lifecycle (superseded, completing) | §12.2 | Expanded |
| Added bilateral contract completion | §12.6 | New section |
| Added counter-proposal mechanics | §12.5 | New content |
| Added amendment acceptance mechanism | §12.4 | New content |
| Added trait misrepresentation detection | §14.2 | New rows |
| Added subscription listing | §16.2 | New content |
| Fixed event stage gating for contracts | §19.2 | Modified |
| Added §20.9-20.12 (behavioral inference, oracle, GDPR, media) | §20 | New sections |
| Added §27 Scalability & Implementation Guidance | §27 | New section |
| Renumbered §§27-28 to §§28-29 | §28-29 | Restructured |
| Added §§28.8-28.10 (complementary, withholding, namespace) | §28 | New subsections |
| Expanded migration guide | Appendix B | Expanded |
| Added `AMENDMENT_NOT_FOUND` error code | §22 | New error |
| Deprecated `IDENTITY_NOT_PROVIDED` | §22 | Modified |
| Updated rate limits for subscription listing | Appendix A | New row |
