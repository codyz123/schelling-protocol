# Adversarial Review — Schelling Protocol v2

**Reviewer:** MoltBot (adversarial review subagent)
**Date:** 2026-02-18
**Documents reviewed:** `spec-v2.md`, `embedding-spec.md`, `intent-embedding-spec.md`, `PLAN.md`

---

## 1. Critical Issues

These are things that would cause the system to fail, be trivially gamed, or produce actively harmful results. Must fix before implementation.

---

### 1.1 ⛔ Centroid Vectors Are Contradictory Between Documents

The cluster centroids are defined in **two places** with **completely different values**.

**spec-v2.md §4.3:**
```
matchmaking: [0.9, 0.8, 0.0, 0.0, 0.0, -0.7, 0.0, 0.0, 0.3, 0.0, 0.5, 0.0, 0.0, 0.0, -0.2, 0.6]
```

**intent-embedding-spec.md (Pre-defined Cluster Centroids section):**
```
matchmaking: [+0.85, +0.60, -0.80, -0.70, +0.80, -0.60, +0.80, -0.20, +0.85, +0.80, +0.75, +0.60, -0.40, +0.20, +0.80, +0.20]
```

These are *completely different vectors* — not rounding differences. The intent-embedding-spec centroids are well-calibrated against the documented dimension semantics (dimension 0 = romantic_intent, dimension 2 = professional_context, etc.). The spec-v2.md centroids appear to be placeholders that don't match the dimension definitions at all (e.g., dimension 2 = 0.0 for matchmaking, but dimension 2 is `professional_context` which should be strongly negative for romance).

This same contradiction exists for all four centroids (marketplace, talent, roommates).

**Impact:** Two conforming implementations using different source documents would have completely incompatible cluster assignments. A user with affinity 0.8 to matchmaking on one server could have affinity 0.3 on another.

**Fix:** Delete the placeholder centroids from spec-v2.md §4.3 and reference the intent-embedding-spec.md centroids as canonical. Or copy the intent-embedding-spec centroids into spec-v2.md. One source of truth only.

---

### 1.2 ⛔ Re-registration Destroys Reputation — Contradicts Staleness System

Re-registration (§5.4) performs an **atomic DELETE + INSERT that cascades to ALL related records**: candidates, declines, outcomes, reputation events, negotiations, verifications, disputes, messages, and jury assignments.

This means:
- **Updating your embedding destroys your entire reputation history.**
- **Updating your embedding destroys all your candidate relationships.**
- **The other users in your candidate pairs lose their side of the funnel progress with no notification.**

But the staleness system (§18.7) *actively penalizes* users who don't re-register:
- After 90 days: visibility penalty on combined_score
- After 180 days: flagged as stale
- The server MAY create `profile_refresh` pending actions urging re-registration

**This is a catch-22.** The system tells users to re-register to stay fresh, but re-registration nukes everything they've built. A user with 6 months of reputation, active conversations, and ongoing negotiations would lose it all to avoid a visibility penalty.

**Impact:** Users who follow the staleness guidance get punished. Users who don't get penalized in search ranking. There is no winning strategy.

**Fix:** The `schelling.update` operation exists but explicitly excludes embedding and intent_embedding updates. Either:
1. Allow embedding updates via `schelling.update` with score recomputation for existing candidates (complex but correct), or
2. Make re-registration preserve reputation events and decline records (they're about the user, not the registration), or
3. Separate the "refresh staleness clock" action from "replace all data" — a `schelling.refresh` operation that just resets `last_registered_at` when the agent confirms the embedding is still accurate.

Option 3 is simplest and handles the common case (profile is still accurate, just old).

---

### 1.3 ⛔ Intent Embedding Is Trivially Gameable

The server has no NLP capability and cannot validate semantic consistency between natural-language intents and the intent embedding (§4.1, §6.3). Intent embeddings are generated entirely client-side by the agent.

**Attack:** An adversarial agent:
1. Calls `schelling.search` to observe other users' intent embeddings (available via `intent_similarity` scores — by searching with different intent vectors, you can triangulate others' embeddings).
2. Sets its own intent embedding to maximize cosine similarity with a target user.
3. Sets natural-language intents to something plausible ("looking for a partner") while the actual embedding is crafted for a specific victim.

Since `intent_similarity` contributes 20% of the directional fit score (§17.2), this gives a significant boost.

**More subtle attack:** A bad actor could generate an intent embedding that's closest to users who have high reputation scores, effectively cherry-picking the most trustworthy users to interact with (and potentially defraud).

**Impact:** The intent embedding system can be used as a targeting mechanism rather than a matching mechanism.

**Mitigations (none are complete):**
- The consistency scoring system would eventually catch agents whose high intent_similarity doesn't lead to good outcomes, but only after enough negative outcomes accumulate (minimum 5).
- Consider adding server-side heuristic checks: if an intent embedding changes dramatically between searches within a session, flag it.
- Consider signing intent embeddings with the agent's attestation so they can't be freely changed per-search.

---

### 1.4 ⛔ Differential Privacy Is Unenforceable

§15.5 says "A compliant agent MUST apply noise" but §12.1 says "The server cannot verify whether noise was applied or what epsilon was used."

An adversarial agent simply doesn't apply noise and gets strictly better matching accuracy. There is zero enforcement mechanism, zero detection mechanism, and zero consequence for non-compliance.

**Impact:** In a competitive ecosystem, agents that skip noise get better results for their users. This creates a race to the bottom where no agent applies noise, and the "privacy" property becomes fictional.

**Possible mitigations:**
- Server-side noise: The server could add its own noise layer on top of submitted embeddings. This wouldn't protect against the server operator, but it would protect users from each other.
- Statistical tests: If an agent's embeddings have suspiciously low variance across dimensions (no noise looks "too clean"), the server could flag them.
- Accept the limitation: Acknowledge in the spec that differential privacy is best-effort and depends on agent compliance. Be honest about the threat model.

---

### 1.5 ⛔ Decline Expiry Creates Infinite Harassment Loop

When a decline expires after 90 days (§5.11, §4.6), the declined user reappears in search results. If User A declines User B, B reappears in 90 days. A declines again. B reappears in 90 more days. This cycle repeats forever.

There is no mechanism to:
- Escalate the TTL based on repeated declines of the same person
- Permanently block a specific user
- Signal "never show me this person again"

**Impact:** A persistent, unwanted user keeps reappearing every 90 days. For matchmaking contexts this feels like stalking, even though it's passive (the system is re-surfacing them, not the person actively reaching out).

**Fix:** Track repeat-decline count per pair. Escalate TTL: 90 → 180 → 365 → permanent after 3 declines of the same person. Or add a `permanent: true` flag to `schelling.decline` that the user can choose for "never again" situations. The `schelling.reconsider` operation already provides a way to undo permanent declines if needed.

---

### 1.6 ⛔ Account Deletion Orphans Reputation Events

When User Y deletes their account (§5.28), the deletion cascades to "reputation events reported by this user." But these events are *about* other users.

**Attack scenario:**
1. User Y gives User X a `negative` outcome rating.
2. User X's reputation drops by some amount due to this event.
3. User Y calls `schelling.delete_account`.
4. The reputation event is deleted.
5. User X's reputation is now higher than it should be.

**Reverse attack:**
1. User Y gives many users positive ratings, building their reputation.
2. User Y deletes account.
3. All those users lose positive reputation events.

**Impact:** Account deletion can be weaponized to manipulate other users' reputations.

**Fix:** When a user deletes their account, anonymize their reputation events (remove reporter identity) rather than deleting them. The events still contribute to other users' scores but can't be traced back to the deleted user.

---

### 1.7 ⛔ Exclusive Commitment + Re-registration = Breach of Contract

In exclusive-commitment clusters (marketplace):
1. Seller commits to Buyer A (auto-declines Buyers B, C, D).
2. Seller re-registers (e.g., to update their listing).
3. Re-registration cascades and deletes ALL candidate records, including the commitment to Buyer A.
4. Buyer A's agent polls `schelling.connections` and gets... nothing. The deal has vanished.

**Impact:** The seller can unilaterally void a commitment with no reputation consequences by re-registering. Buyers B, C, D were already auto-declined and also lose their records.

**Fix:** Either block re-registration while the user has active commitments in exclusive clusters, or preserve committed candidate records across re-registration, or at minimum create a negative reputation event when re-registration destroys a commitment.

---

## 2. Design Concerns

Things that might not work well in practice. Should address before launch.

---

### 2.1 Geometric Mean Produces Counterintuitive Rankings

The combined score `sqrt(your_fit × their_fit)` strongly penalizes asymmetric fits:

| your_fit | their_fit | combined (geometric) | arithmetic mean |
|----------|-----------|---------------------|-----------------|
| 0.99 | 0.01 | 0.0995 | 0.50 |
| 0.50 | 0.50 | 0.50 | 0.50 |
| 0.90 | 0.10 | 0.30 | 0.50 |
| 0.80 | 0.40 | 0.566 | 0.60 |

The 99% / 1% match ranks below the 50% / 50% match. This means a user who is *perfect* for someone (your_fit = 0.99) but that person doesn't match their needs (their_fit = 0.01) is ranked below a mediocre mutual match.

**Is this always right?** In matchmaking, probably yes — unrequited love isn't a good match. In marketplace, maybe not — if a buyer perfectly wants what a seller has (your_fit = 0.99), the seller's lower fit score might just mean the seller has broader criteria (selling to anyone). The seller would still be happy to sell.

**Fix consideration:** Allow the ranking formula to be configurable per cluster. Marketplace could use arithmetic mean or weighted mean (higher weight on buyer→seller fit). Expose both `your_fit` and `their_fit` prominently so agents can apply their own ranking logic.

---

### 2.2 16 Dimensions May Be Insufficient for the Full Intent Space

The 16 dimensions cover: romantic_intent, social_bonding, professional_context, material_exchange, commitment_duration, relationship_symmetry, exclusivity, formality, emotional_depth, identity_specificity, vulnerability_level, shared_lifestyle, urgency, locality_requirement, interaction_frequency, scope_breadth.

Missing intent facets that can't be cleanly expressed:
- **Domain specificity** — "find a React developer" vs. "find a plumber" vs. "find a therapist" all map to similar intent vectors (professional, service-oriented) but are completely different searches.
- **Age/demographic targeting** — intent to match with specific demographics can't be expressed in 16-dim intent space.
- **Group vs. individual** — "find a band" vs. "find a guitar teacher" are different intent structures.
- **Reciprocity expectations** — "find someone to teach me" vs. "find someone to learn from" have overlapping but different intent structures.

As the platform scales beyond the four pre-defined clusters, novel intents will cluster into a small number of distinct regions in 16-dimensional space. The space may become crowded — mentorship, tutoring, consulting, and advising would all map to similar vectors.

**Impact:** Users with genuinely different needs may get matched because their intents can't be distinguished in 16 dimensions.

**Mitigation:** This is partially addressed by trait embeddings (a React developer's skills embedding is different from a plumber's). The 16-dim intent space is for goal structure, not domain content. But the spec should acknowledge this limitation and plan for future dimension expansion.

---

### 2.3 Cosine Similarity on Intents Ignores Magnitude

Cosine similarity is angle-based — it ignores vector magnitude. Two users pointing in the same direction with different magnitudes are scored identically.

For intents, magnitude carries signal:
- `romantic_intent: +0.95` (very sure) vs. `romantic_intent: +0.3` (mildly open to romance) — these point in the same direction but represent very different commitment levels.
- A user with strong signal on all dimensions has a clear, focused intent. A user with weak signal on all dimensions has a vague, diffuse intent. Cosine similarity treats these identically.

**Impact:** A user who is "definitely seeking a romantic partner" (all values high magnitude) and a user who is "maybe open to meeting people" (all values low magnitude, same direction) will appear to have high intent similarity.

**Possible fix:** Use a modified similarity metric that incorporates both angle and magnitude. For example, penalize when one user's intent vector has much lower magnitude than the other's: `intent_similarity = cosine_sim × min(norm_a, norm_b) / max(norm_a, norm_b)`.

---

### 2.4 Directional Scoring Is Symmetric at Cold Start

§17.2 says your_fit uses "preference alignment" (20% weight) — how well the candidate's values fall within the scorer's learned `ideal_ranges`. "When no learned preferences exist, defaults to embedding similarity."

Embedding similarity (cosine) is symmetric: cosine(A, B) = cosine(B, A). With no learned preferences (cold start for both users), the score components are:
- Trait similarity: symmetric (40%)
- Intent similarity: symmetric (20%)
- Preference alignment: defaults to embedding similarity = symmetric (20%)
- Deal-breaker pass: independent per user, could differ (10%)
- Collaborative signal: 0.5 for both with no data (10%)

So `your_fit` and `their_fit` will be nearly identical for new users (differing only on deal-breaker pass). The bidirectional scoring system collapses to unidirectional scoring until feedback accumulates.

**Impact:** The spec's core innovation — bidirectional scoring — is effectively disabled for new users. Combined_score ≈ your_fit ≈ their_fit for cold-start users.

**Fix consideration:** Incorporate asymmetric signals from registration data even without learned preferences. For example, compare the candidate's traits against the scorer's `seeking` text (via simple keyword matching or embedding comparison) to create asymmetry from day one. Or use the intent embedding difference (are both users seeking the same type of match?) to create natural asymmetry.

---

### 2.5 Jury System Doesn't Scale at Small Platform Sizes

Jury selection (§11.3) requires:
- No shared candidates with either party
- Different candidate pools from both parties
- Different agent_model from either party
- Reputation ≥ 0.6
- Not served jury duty in last 90 days

With 100 users, even after relaxation (dropping the 90-day cap and candidate-pool requirement), finding 3 jurors with reputation ≥ 0.6 and no shared candidates is difficult because search results overlap heavily in small populations.

With 10 users, it's **mathematically impossible**. Every user will have searched and discovered every other user, creating shared candidates with everyone.

**Impact:** The dispute resolution system is non-functional until the platform reaches a critical mass of users.

**Fix:** Define a fallback resolution mechanism for small platforms:
- Below N eligible jurors (e.g., < 20 users with rep ≥ 0.6), fall back to server-operator arbitration or algorithmic review.
- Explicitly state the minimum platform size at which the jury system activates.
- Consider allowing jurors from federated servers (even before full federation is specified).

---

### 2.6 Agent Quality Scoring Punishes Users, Not Agents

§18.3 says agents with quality score < 0.3 (with ≥ 50 outcomes) "MAY have their users' matches flagged with a quality warning in search results."

The user didn't choose their agent model. The user might not even know what agent_model string their agent reports. Flagging a USER's search results because their agent is statistically bad is punishing the wrong entity.

**Impact:** Users of less-popular or newer agents are penalized. This creates a network effect that entrenches dominant agent providers and punishes early adopters of new agents.

**Fix:** Show agent quality warnings to the *user's own agent* (so the agent can improve or the user can switch), but don't flag the user's matches to OTHER users. Agent quality should be a signal to the user about their own agent's reliability, not a scarlet letter visible to potential matches.

---

### 2.7 Consistency Scoring Algorithm Is Unspecified

§9.5 says consistency "measures how well a user's embedding predicts their actual behavior" and is computed by correlating compatibility scores with reported outcomes. But:
- What specific correlation method? Pearson? Spearman? 
- Correlation between what exactly? Combined_score and outcome rating?
- How is the 3-level outcome (positive/neutral/negative) mapped to a continuous value for correlation?
- What constitutes "high" consistency?

Two conforming implementations could produce completely different consistency scores for the same user.

**Fix:** Specify the exact computation. For example: Pearson correlation between `combined_score` at CONNECTED and outcome value (positive=1.0, neutral=0.5, negative=0.0), with `consistency = max(0, correlation)` (negative correlation → 0, meaning embedding is anti-predictive).

---

### 2.8 No Block/Mute for Message Relay

The message relay (§5.14) has rate limiting (100 messages/hour) but no mechanism to:
- Block a specific user from sending you messages
- Mute a conversation
- Report message content as abusive (separate from the dispute system, which requires stage CONNECTED and is heavyweight)

A user at CONNECTED stage receiving unwanted messages has only one option: decline the candidate pair entirely. There's no middle ground.

**Impact:** Harassment through the relay. Even at 100 messages/hour, that's a lot of unwanted contact.

**Fix:** Add a `schelling.relay_block` operation that stops message delivery from a specific candidate without fully declining the match. Also consider per-candidate message rate limits (e.g., max 10 messages before the other party responds).

---

### 2.9 Feedback Gaming

A user can submit deliberately wrong feedback to manipulate their learned preferences in pathological ways:

1. **Preference inflation:** Rate dimension scores as 0.0 (ideal) for traits the user actually dislikes, causing the system to recommend more candidates with those traits — who the user then declines, generating negative reputation events for those candidates.
2. **Collaborative poisoning:** A group of colluding users with similar profiles could all submit similar fake feedback, poisoning the collaborative filtering pool for users who resemble them.

**Impact:** The learning system is designed to trust user feedback. Adversarial feedback corrupts both individual learning and collaborative filtering.

**Fix:** Cross-validate feedback against actual behavior. If a user rates dimension X as ideal but consistently declines candidates with high values on dimension X, the feedback quality score should drop and the contradictory feedback should be discounted. The `feedback_quality_score` system partially addresses this via "consistency" checking, but the spec should make the adversarial threat model explicit.

---

## 3. Ambiguities

Places where the spec is unclear enough to cause incompatible implementations.

---

### 3.1 Directional Fit Computation for Embedding-Based Clusters

The spec describes `your_fit` as "how well the candidate matches what the caller is looking for" (§17.1) and lists 5 weighted components (§17.2). But several components are symmetric:

- **Trait similarity (40%):** Cosine similarity is symmetric. How is this made directional?
- **Preference alignment (20%):** Uses the *scorer's* learned `ideal_ranges`. This is correctly directional — but defaults to "embedding similarity" when no preferences exist (which is symmetric).
- **Collaborative signal (10%):** "Users with similar profiles tended to rate matches like this candidate positively/negatively." This is directional (it's from the scorer's perspective). But defaults to 0.5.

**Question:** For cold-start users, is `your_fit` literally identical to `their_fit` (minus deal-breaker differences)? The spec doesn't acknowledge this or explain how directional scoring works at cold start. An implementer reading the spec might expect `your_fit ≠ their_fit` always.

**Fix:** Explicitly state that for cold-start users, directional fits converge and explain what introduces asymmetry as data accumulates.

---

### 3.2 Timestamp Format Inconsistency

The spec uses two different timestamp formats inconsistently:

- **ISO 8601 strings:** `last_registered_at`, `filed_at` (in some places), `verdict_deadline`, `sent_at`, etc.
- **Unix timestamps in milliseconds (integers):** `filed_at` in `schelling.dispute` output, `expires_at` in `schelling.negotiate` output, `export_timestamp` in `schelling.export` output, `deleted_at` in `schelling.delete_account` output.

Within the same operation, `schelling.dispute` returns `filed_at` as an integer (Unix ms) and `verdict_deadline` as a string (ISO 8601).

**Impact:** Implementers will parse timestamps inconsistently. Client libraries will need to handle both formats.

**Fix:** Pick one format and use it everywhere. ISO 8601 is more human-readable and timezone-aware. Audit every timestamp field across all 29 operations for consistency.

---

### 3.3 Narrative Summary Generation Quality

§17.4 says narrative summaries are generated "server-side using template-based formatting from structured data" and "does NOT require a language model."

But the example: *"You both value intellectual conversation and show strong alignment in openness and curiosity. Your communication styles complement each other — you're more direct while they tend to be more expressive, which can create engaging dialogue."*

...is extremely difficult to generate from templates without NLP. Phrases like "can create engaging dialogue" require understanding the implication of complementary communication styles.

**Impact:** A strict "no language model" implementation will produce: "High alignment on dimensions: openness (0.92), intellectual_curiosity (0.88). Complementary dimensions: directness (you: 0.7, them: -0.3)." A lenient implementation will use an LLM. User experience differs dramatically.

**Fix:** Either:
1. Provide the actual templates in the spec so implementations produce identical output, or
2. Remove the "does NOT require a language model" claim and make narrative_summary an optional field that servers may implement with varying quality, or
3. Define narrative_summary as agent-responsibility (agents generate it from the raw data) rather than server-responsibility.

---

### 3.4 "Different Candidate Pools" for Jury Selection Is Undefined

§11.3 requires jurors to have "different candidate pools from both parties." What counts as a candidate pool?

- All current candidate pairs?
- All candidate pairs ever (including declined/expired)?
- Only candidate pairs at certain stages?
- Candidate pairs in the same intent cluster only?

**Impact:** Two implementers might produce different jury panels for the same dispute.

**Fix:** Define precisely: "A juror's candidate pool is the set of user_tokens that appear as the other party in any active (non-soft-deleted) candidate record involving the juror."

---

### 3.5 Negotiation Round Counting

§10.3 describes the negotiation flow but doesn't define whether the initial proposal counts as round 1. If `max_rounds: 5`:
- **Interpretation A:** 5 proposals total (initial + 4 counters)
- **Interpretation B:** Initial proposal + 5 counter-proposals = 6 total

The `round` field in the output "current negotiation round number" doesn't clarify.

**Fix:** State explicitly: "The first proposal is round 1. `max_rounds: 5` means a maximum of 5 proposals can be sent in total. The 6th attempt returns `MAX_ROUNDS_EXCEEDED`."

---

### 3.6 Implicit Signal Weights Are Unspecified

§7.8 assigns qualitative weights to implicit feedback signals:

| Pattern | Weight |
|---------|--------|
| Decline at DISCOVERED | "Low weight (broad signal)" |
| Decline at EVALUATED | "Medium weight" |
| Decline at EXCHANGED | "High weight (specific signal)" |
| Reached CONNECTED without negative report | "High weight" |
| COMPLETED with positive outcome | "Highest weight" |

No numerical weights are given. Two implementations will produce different learned preferences.

**Fix:** Either assign numerical weights (e.g., Low = 0.2, Medium = 0.5, High = 0.8, Highest = 1.0) or explicitly mark this as implementation-defined behavior.

---

### 3.7 schelling.update Doesn't Refresh Staleness Clock

§5.5 states: "last_registered_at is NOT updated by this operation (it reflects embedding freshness, not profile edits)."

But if a user updates their description, interests, seeking, and values_text (all the text fields), they've demonstrated they're still active. Their profile is arguably "fresh" in terms of engagement, even if the embedding hasn't changed.

An implementer might reasonably argue either way:
- "Staleness is about embedding freshness — the user's personality representation might be outdated."
- "Staleness is about profile freshness — the user is clearly still active."

**Fix:** This is a design decision, not an ambiguity, but the rationale should be stated clearly. If the intent is that only embedding re-registration resets staleness, say so and explain why (embeddings can drift as personalities evolve, text updates don't address this).

---

### 3.8 Error Code Gaps

Several failure modes don't have corresponding error codes:

- **Rate limit exceeded:** No error code defined (§16.3 mentions returning 429 for REST, but what's the JSON error code for MCP transport?)
- **User is paused/delisted:** What error does search return when the caller's own status is paused?
- **Verification request expired:** §5.19 says requests expire after 7 days, but no error code for attempting to fulfill an expired request.
- **Jury assignment expired:** What happens if a juror tries to submit a verdict after being replaced?

**Fix:** Add error codes: `RATE_LIMITED`, `USER_PAUSED`, `VERIFICATION_EXPIRED`, `JUROR_REPLACED`.

---

## 4. Edge Cases

Unusual scenarios the spec should explicitly address.

---

### 4.1 Cold Start: First 10 Users

With 10 users:
- Search returns 1–9 candidates (depending on cluster/role)
- Collaborative filtering requires 3 similar users with feedback — won't activate
- Jury system needs 3–5 uninvolved jurors — impossible when everyone has searched everyone
- Reputation is meaningless (everyone starts at 0.5, no outcome data)

**The platform is non-functional for dispute resolution and learning at small scale.** Base matching (trait + intent cosine similarity) works fine, but all the advanced features are inert.

**Recommendation:** Document the minimum viable population (MVP) for each feature. Something like:
- Base matching: 2+ users in compatible intents
- Learned preferences: 5+ feedback submissions (per user)
- Collaborative filtering: 50+ users with feedback
- Jury system: 20+ users with reputation ≥ 0.6
- A/B testing: 200+ total outcomes

---

### 4.2 Intent Space Crowding

With 10,000 users in the matchmaking region and 3 in the talent region:
- Matchmaking searches scan 10,000 candidates — the `top_k` cap of 100 handles this, but the server still evaluates all 10,000 for scoring.
- Talent searches return 1–2 candidates. The `threshold: 0.5` default might filter out all of them.
- No cluster-balancing mechanism exists — popular clusters dominate.

**Recommendation:** 
- Document expected performance characteristics at various scales (100, 1K, 10K, 100K users).
- Consider indexing strategies (§4.3 in the scaling section below).
- For sparse clusters, consider lowering the default threshold or surfacing a "few candidates available" signal.

---

### 4.3 Scale: 100K Users and Cosine Similarity

Searching 100K users requires computing cosine similarity on 16-dimensional intent embeddings AND 50-dimensional trait embeddings for every eligible user, then combining scores.

For a single search:
- 100K × cosine(16-dim) = ~100K × 32 multiplications + additions = ~3.2M FLOPs
- 100K × cosine(50-dim) = ~100K × 100 multiplications + additions = ~10M FLOPs
- Plus deal-breaker checks, preference alignment, collaborative signal per candidate

This is feasible in real-time (< 100ms on modern hardware) for a single search. But at 10 searches/hour × 100K users who might all search:

Peak load: 1,000,000 searches/hour = ~278 searches/second. Each scanning 100K users. That's 27.8 billion scoring operations per second. **This requires indexing.**

**Recommendation:** Acknowledge that brute-force search doesn't scale past ~10K users. Specify that servers SHOULD use approximate nearest neighbor (ANN) indexing (e.g., HNSW, IVF) for the intent embedding space to pre-filter candidates before full scoring. This is an implementation detail, not a protocol change, but it should be noted.

---

### 4.4 Compound Intents with Conflicting Configurations

A user whose intent embedding has cosine similarity > 0.5 with both the marketplace centroid and the matchmaking centroid. This activates both cluster configurations.

- Marketplace has `exclusive_commitment: true`; matchmaking has `exclusive_commitment: false`.
- Marketplace has `decline_ttl_days: 30`; matchmaking has `decline_ttl_days: 90`.
- Marketplace has `negotiation` module active; matchmaking doesn't.

Which configuration applies?

The spec says "The primary cluster's configuration is used as the default" (§4.3, point 2). But:
- What if the user commits in what looks like a marketplace context? Is it exclusive?
- What decline TTL applies?
- Can they negotiate with some matches and not others?

**Recommendation:** Specify that ALL operational behavior (exclusive commitment, decline TTL, module activation, funnel config) is determined by the primary cluster *at registration time* and is fixed for that registration. Cross-cluster behavior is for scoring only, not for operational rules.

---

### 4.5 Agent Model Discontinuation

Agent quality tracking (§18.3) tracks metrics per `agent_model` identifier. If a model is discontinued (e.g., Claude 3.5 is sunset), users registered with that model still have their `agent_model` recorded.

- Their quality metrics stop updating (no new outcomes from that model).
- The quality score remains frozen at whatever it was.
- If the score was low, users are perpetually flagged.
- If the user switches agents, does the new agent re-register with a different model string? That triggers the re-registration cascade (critical issue 1.2).

**Recommendation:** Agent quality scores should decay toward 0.5 (neutral) when no new outcomes have been recorded for > 180 days. Also, `schelling.update` should allow updating `agent_model` without full re-registration.

---

### 4.6 Mutual Gate Deadlock

User A evaluates User B and calls `schelling.exchange`. Gets `"pending_mutual"` — User B hasn't reached EVALUATED yet.

User B's agent has crashed / user B has abandoned the platform / user B is paused.

User A waits... indefinitely. The spec has no timeout for pending mutual gates. The 30-day timeout in PLAN.md §3.8 only applies to "EXCHANGED/COMMITTED for >30 days with no activity from one side" — but this is stuck at the EXCHANGE *attempt*, not at EXCHANGED stage.

**Recommendation:** Add a timeout for mutual gating: if the other party doesn't reach the required stage within N days (configurable, default 30), the requesting party can auto-decline without reputation penalty, or the pending request expires with a notification.

---

### 4.7 Privacy Reconstruction Attack

Given a user's intent embedding (16 dimensions with known semantic meaning) and their match scores with known candidates, an adversary could reconstruct significant personal information:
- Intent embedding dimensions directly reveal: romantic interest level, professional/personal orientation, urgency, locality requirement, commitment expectations, and more.
- Combined with trait embedding cosine similarity scores across multiple evaluations, an adversary could triangulate approximate values for personality dimensions.

With enough search results and evaluate calls, an adversarial agent could effectively profile a target user's personality and intentions without ever reaching EXCHANGED stage.

**Impact:** Progressive disclosure is undermined because scoring data at DISCOVERED/EVALUATED stages leak information about the underlying embeddings.

**Recommendation:** Consider quantizing scores to fewer precision levels at early stages (e.g., showing "high/medium/low" at DISCOVERED instead of exact floats). Or add noise to scores at early stages that decreases as the funnel progresses.

---

### 4.8 Identical Natural-Language Intents, Different Embeddings

Two agents process the same user goal: "find me a romantic partner who values honesty."

Agent A produces: `[0.85, 0.60, -0.80, -0.70, 0.80, -0.60, 0.80, ...]`
Agent B produces: `[0.90, 0.45, -0.70, -0.50, 0.70, -0.50, 0.75, ...]`

These are both reasonable but different. Cosine similarity between them: ~0.95 (close but not identical). Over time, as different agents register users with systematically different calibrations, the intent space drifts per agent model.

**Impact:** Users of Agent A cluster together; users of Agent B cluster together. Cross-agent matching quality degrades because the embeddings aren't calibrated to the same scale.

**Recommendation:** 
- The intent-embedding-spec.md calibration guidance helps, but is not enforceable.
- Consider publishing reference embeddings for common intents (not just cluster centroids) so agents can calibrate against a standard.
- Track cross-agent-model matching quality in analytics and flag when certain model pairs have systematically worse outcomes.

---

### 4.9 Federation with Different Custom Clusters

The spec says pre-defined centroids "MUST be identical across all conforming implementations" but custom clusters are server-specific (§4.10). If Server A defines a "mentorship" cluster with centroid X and Server B defines "mentorship" with centroid Y:

- Users on Server A near centroid X have different cluster configurations than users on Server B near centroid Y.
- Cross-server search would produce inconsistent cluster assignments.
- Module activation differs across servers for the same intent embedding.

**Recommendation:** When federation is specified, require that custom cluster centroids be either agreed upon across federated servers or be explicitly local (not participating in cross-server matching).

---

### 4.10 Near-Zero Intent Embeddings

The spec rejects all-zero intent embeddings (L2 norm must be non-zero, §6.3). But `[0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]` passes validation. Its cosine similarity with any vector is determined almost entirely by that vector's first dimension (romantic_intent). This produces pathological matching: the user appears to strongly prefer matching with users who have high romantic_intent, regardless of all other dimensions.

**Recommendation:** Add a minimum L2 norm threshold (e.g., norm > 0.5) or a minimum number of non-trivial dimensions (e.g., at least 3 dimensions with |value| > 0.1).

---

### 4.11 User Registers, Searches, Declines Everyone, Then Repeatedly Reconsiders

A user could:
1. Search and decline all 50 candidates.
2. Reconsider all 50.
3. Search again — all 50 are new candidate records starting at UNDISCOVERED.
4. Evaluate them again, getting fresh scores.
5. Repeat.

Each cycle creates new candidate records, potentially with different scores (if the server has updated its algorithm or if collaborative filtering weights have changed). This is a way to get repeated "fresh looks" at the same people.

**Impact:** Resource waste, and it defeats the purpose of funnel tracking (you can always start over).

**Fix:** Rate limit `schelling.reconsider` (the spec says 10/day, which helps) and/or count reconsidered-then-re-declined pairs toward a permanent exclusion (similar to the escalating decline TTL recommended in 1.5).

---

## 5. Recommendations

Specific fixes for each issue, prioritized.

---

### Priority 1: Must Fix (Critical)

| # | Issue | Fix |
|---|---|---|
| 1.1 | Contradictory centroids | Single source of truth. Copy intent-embedding-spec centroids into spec-v2.md, or reference one from the other. |
| 1.2 | Re-registration nukes reputation | Add `schelling.refresh` operation (resets staleness clock without data destruction). Preserve reputation events and decline records across re-registration. Allow embedding updates via `schelling.update` with score recomputation. |
| 1.5 | Decline harassment loop | Escalating TTL (90 → 180 → 365 → permanent). Add `permanent: true` option to decline. Track repeat-decline count per pair. |
| 1.6 | Account deletion orphans reputation | Anonymize (not delete) reputation events about other users when a user deletes their account. |
| 1.7 | Exclusive commitment + re-registration | Block re-registration while user has active commitments in exclusive clusters. |

### Priority 2: Should Fix (Design / Ambiguity)

| # | Issue | Fix |
|---|---|---|
| 3.2 | Timestamp inconsistency | Standardize on ISO 8601 strings everywhere. Audit all 29 operations. |
| 2.7 | Consistency scoring unspecified | Define exact algorithm: Pearson correlation between combined_score and outcome value (1.0/0.5/0.0). |
| 3.5 | Negotiation round counting | "First proposal is round 1. max_rounds=5 means 5 proposals total." |
| 3.6 | Implicit signal weights unspecified | Assign numerical weights or explicitly mark as implementation-defined. |
| 3.8 | Missing error codes | Add: RATE_LIMITED, USER_PAUSED, VERIFICATION_EXPIRED, JUROR_REPLACED. |
| 2.5 | Jury doesn't scale | Define fallback mechanism for small platforms. Document minimum viable population. |
| 2.8 | No relay block/mute | Add `schelling.relay_block` operation. Add per-candidate message rate limits. |
| 4.6 | Mutual gate deadlock | Add configurable timeout (default 30 days) for pending mutual gates. |
| 3.3 | Narrative summary generation | Provide actual templates in spec, or make it optional/agent-generated. |
| 3.4 | "Different candidate pools" undefined | Define precisely using set of other-party tokens in active candidate records. |

### Priority 3: Should Address (Edge Cases / Future-Proofing)

| # | Issue | Fix |
|---|---|---|
| 1.3 | Intent embedding gaming | Add intent embedding hash to registration; flag dramatic changes. Track consistency of intent_similarity vs. outcomes. |
| 1.4 | Unenforceable privacy | Add server-side noise option. Acknowledge in spec that client-side noise is best-effort. |
| 2.1 | Geometric mean pathology | Make ranking formula configurable per cluster. Expose raw directional scores prominently. |
| 2.3 | Cosine ignores magnitude | Consider augmented similarity metric incorporating magnitude ratio. |
| 2.4 | Cold-start symmetry | Document the limitation. Consider asymmetric signals from registration text fields. |
| 2.6 | Agent quality punishes users | Show warnings to user's own agent only, not to other users' agents. |
| 4.3 | Scale at 100K | Recommend ANN indexing in the spec as implementation guidance. |
| 4.4 | Conflicting cluster configs | Fix operational behavior to primary cluster at registration time. |
| 4.7 | Privacy reconstruction | Quantize scores at early stages or add stage-dependent noise. |
| 4.8 | Cross-agent calibration drift | Publish reference embeddings for common intents. Track cross-model quality. |
| 4.10 | Near-zero intent vectors | Add minimum L2 norm threshold (e.g., > 0.5). |

---

## Appendix: PLAN.md vs Spec Contradictions

The PLAN.md contains several statements that conflict with or have been superseded by the spec:

1. **PLAN.md Appendix A, Invariant 2:** "Decline is permanent. A declined pair can never be re-created." But spec-v2.md §5.11–5.12 explicitly define decline expiry and `schelling.reconsider`. The PLAN is wrong — declines are temporary with expiry.

2. **PLAN.md §8.1 Dispute Resolution:** "If both parties submit evidence → algorithmic review (LLM-based assessment of evidence)." The spec replaces this with the agent jury system. The PLAN's dispute resolution model is obsolete.

3. **PLAN.md §3.5.4 Cross-Vertical Reputation Bleed:** Uses "vertical" terminology throughout, but the spec replaces verticals with intent clusters. The bleed concept survives (§9.1 specifies 80/20 split) but the language should be reconciled.

4. **PLAN.md Appendix A, Invariant 3:** "The server never sees raw embeddings. Noise is applied client-side." But if noise is unenforceable (issue 1.4), this invariant is aspirational, not guaranteed.

---

*End of adversarial review.*
