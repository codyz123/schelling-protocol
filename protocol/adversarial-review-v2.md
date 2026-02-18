# Adversarial Review v2 — Schelling Protocol v2

**Reviewer:** MoltBot (adversarial review subagent, second pass)  
**Date:** 2026-02-18  
**Documents reviewed:** `spec-v2.md`, `embedding-spec.md`, `intent-embedding-spec.md`, `testing-ui-spec.md`, `implementation-plan.md`, `adversarial-review.md` (v1, for non-repetition), `CHANGELOG-fixes.md`  
**Scope:** Fresh angles — incentive design, game theory, information economics, network dynamics, real-world deployment, protocol evolution, comparison to existing systems. No issues from v1 are repeated.

---

## 1. Critical Issues

These are systemic problems that would cause the protocol to produce bad outcomes at equilibrium, create exploitable vulnerabilities, or violate fundamental design goals.

---

### 1.1 ⛔ The Geometric Mean Creates a "Mutual Mediocrity" Nash Equilibrium

The combined score formula `sqrt(your_fit × their_fit)` punishes asymmetry severely (acknowledged in §17.1). But the second-order effect is more damaging: **it incentivizes agents to generate "safe" middle-of-the-road embeddings rather than accurate ones.**

**The game-theoretic argument:**
- An agent that generates an accurate, distinctive embedding for its user (e.g., extreme values on several dimensions) will sometimes produce high `your_fit` for certain candidates but low `their_fit` (because the user is unusual and doesn't match what most people want).
- The geometric mean crushes these matches: `sqrt(0.95 × 0.15) = 0.38`.
- An agent that generates a bland, centrist embedding (all values near 0) produces moderate `your_fit` AND moderate `their_fit` for almost everyone: `sqrt(0.55 × 0.55) = 0.55`.
- The bland embedding produces higher combined scores on average and thus better search rankings.

**The Nash equilibrium:** Every rational agent generates embeddings that are closer to the population mean than the user's actual traits. This is a form of preference falsification at the embedding level. The equilibrium is that all embeddings cluster near the center, destroying the discriminating power of the matching system.

**Why this is critical:** The entire matching system depends on embeddings carrying accurate signal. If the scoring formula incentivizes agents to suppress extreme values, the system degrades to random matching with extra steps.

**Evidence from existing systems:** Tinder's Elo system had a similar problem — users learned to be strategically selective because the algorithm penalized indiscriminate swiping. Bumble's algorithm produces "safe" matches rather than high-variance ones. The geometric mean produces the same conservatism.

**Fix:** Consider a scoring formula that rewards accuracy rather than mutual moderation:
1. Use the geometric mean for ranking but weight `your_fit` more heavily (e.g., 60/40) — you care more about whether the candidate fits YOUR needs.
2. Show `your_fit` as the primary ranking signal and `their_fit` as a compatibility warning flag (like Hinge's approach).
3. Add a "distinctiveness bonus" — embeddings with higher variance across dimensions get a small scoring boost, counteracting the centrist pressure.
4. At minimum, track the average embedding variance per agent model over time; if it's declining, the mediocrity effect is real.

---

### 1.2 ⛔ Mutual Assured Destruction in Outcome Reporting

The outcome reporting game has a destructive equilibrium.

**The game:** After CONNECTED, both parties independently report outcomes (positive/neutral/negative). Each report creates a reputation event for the other party.

**The problem:** Reporting is not simultaneous or blind. Party A reports first; Party B can observe A's reputation change and infer A's report before deciding their own. Even without direct observation, the threat is credible: "If I report negative, they might report negative about me."

**Equilibrium analysis:**
- If both parties had a bad experience, the honest outcome is mutual negative reporting. But negative reports cost -0.15 reputation (if a dispute follows) or cause reputation score decreases.
- Each party fears retaliation. If A reports negative, B is incentivized to report negative (punishing A for the bad experience, or retaliating).
- The safe strategy is to report neutral/positive regardless of actual experience, avoiding retaliation risk.
- **Result:** Reputation scores are inflated. Negative outcomes are systematically underreported. The reputation system becomes meaningless.

**Evidence from existing systems:** eBay discovered this exact problem — buyers and sellers exchanged positive reviews out of fear of retaliation, not genuine satisfaction. eBay solved it by making reviews one-directional (buyers review sellers, not vice versa) and introducing simultaneous blind revelation.

**Fix:**
1. Make outcome reports blind: neither party can see the other's report until both have reported (or a timeout passes). This is the standard mechanism from mechanism design.
2. Consider asymmetric reporting: in asymmetric clusters (marketplace, talent), only one direction of reporting is reputation-relevant (buyer reviews seller, employer reviews candidate).
3. At minimum, add a "cooling off period" — reports cannot be submitted for 48 hours after connection, and both reports are revealed simultaneously.

---

### 1.3 ⛔ Jury Herding: The +0.02 Majority Bonus Incentivizes Groupthink

§11.6 gives jurors a +0.02 reputation boost for siding with the majority. This creates a second-order incentive problem.

**The mechanism:** Jurors submit verdicts independently. But:
- Jurors know that voting with the majority earns +0.02.
- Jurors know nothing about other jurors' votes (good).
- But jurors CAN estimate the likely majority verdict from case characteristics:
  - If the filer has much higher reputation than the defendant → majority likely sides with filer.
  - If evidence is strong → majority likely supports filer.
  - If evidence is weak → majority likely dismisses.

**The herding equilibrium:** Instead of evaluating evidence carefully, rational jurors use base-rate heuristics ("high-rep filer usually wins") to predict the majority and vote accordingly. This creates a self-fulfilling prophecy: the majority verdict reflects the majority's prediction of itself, not independent evaluation of evidence.

**Why this is worse than no incentive:** Without the +0.02 bonus, jurors have no personal stake and might actually evaluate evidence carefully. With the bonus, they're incentivized to predict rather than evaluate.

**Fix:**
1. Remove the majority bonus entirely. Jury duty is a civic obligation, not a reward-seeking game.
2. If an incentive is needed, reward participation (submitting any verdict) rather than agreement. A flat +0.01 for voting, regardless of alignment with the majority.
3. Consider a "surprisingly different verdict" bonus: jurors who provide well-reasoned dissents (as determined by reasoning length/quality heuristics) receive a small boost even when in the minority. This encourages genuine deliberation.

---

### 1.4 ⛔ No Blind Reveal = Unilateral Information Exploitation at Every Funnel Stage

The funnel is designed as progressive disclosure, but every stage involves one party acting first and gaining an information advantage.

**At EXCHANGE (stage 3):** User A requests exchange. If the other side has already reached EVALUATED, A gets the full profile. But the other side doesn't know A has seen their profile until they check. A can use this information to craft their approach at COMMIT.

**At COMMIT (stage 4):** One party commits first, revealing interest. The other party now knows they're wanted and can delay, negotiate from a position of strength, or abandon if they find someone better.

**At DIRECT (post-CONNECTED):** One party opts into sharing contact info. The other party now knows the first party wants to move to direct communication. If the second party doesn't reciprocate, the first party has revealed interest asymmetry.

**Game theory:** These sequential moves create first-mover disadvantage at every stage. Rational agents will try to go second at every gate, creating deadlock. The mutual gate at EXCHANGE partially addresses this for profile viewing, but COMMIT and DIRECT have no mutuality gates.

**Evidence from existing systems:** Hinge solved this with the "like" mechanism — both parties express interest before matching. Tinder requires mutual swiping. The funnel has no such mechanism for COMMIT or DIRECT.

**Fix:**
1. Make COMMIT a blind simultaneous mechanism: both parties declare commitment in a sealed window (e.g., 24 hours), revealed simultaneously. If both committed, connection proceeds.
2. Make DIRECT a blind mechanism: both parties' opt-ins are collected and revealed simultaneously.
3. At minimum, don't reveal to Party B that Party A has committed. Show only "this match is progressing" without indicating which side acted.

---

### 1.5 ⛔ Adversarial Collaborative Filtering: Poisoning the Neighborhood

Collaborative filtering (§8.5) works by finding users with similar embeddings (cosine similarity > 0.8) and aggregating their feedback patterns. This creates a novel attack vector.

**The attack:**
1. An attacker registers N accounts with embeddings very similar to a target victim's embedding (cosine sim > 0.8).
2. These fake accounts generate fake feedback: report negative experiences with a specific dimension pattern.
3. The collaborative filtering system now tells the victim: "Users similar to you tend to avoid candidates with [attacker-specified characteristics]."
4. The victim's agent applies these suggestions, steering them away from certain candidates — essentially letting the attacker control who the victim matches with.

**Why existing mitigations don't work:**
- Sybil resistance (§9.7) checks phone hash deduplication. Attackers use different phones.
- Agent attestation checks interaction hours. Fake accounts can accumulate hours.
- Feedback quality scoring checks consistency. Fake accounts can be internally consistent.
- The collaborative filtering minimum (3 similar users) is trivially achieved with 3 fake accounts.

**Impact:** An attacker (e.g., a jealous ex, a competitor, a stalker) can manipulate who a specific victim matches with without direct interaction. This is a privacy-violating, autonomy-violating attack that is invisible to the victim.

**Fix:**
1. Require many more similar users before collaborative filtering activates (minimum 10-20, not 3).
2. Weight collaborative signals by the similar users' reputation AND verification level — anonymous accounts contribute less.
3. Track behavioral similarity, not just embedding similarity, for collaborative cohort selection. Accounts that were registered at similar times with similar embeddings should trigger Sybil detection.
4. Rate-limit the influence of any single user on collaborative filtering — no single user's feedback should shift another user's recommendations by more than X%.

---

### 1.6 ⛔ Message Relay Is an Unencrypted Surveillance Honeypot

The spec explicitly states (§12.4, §16.8): "Message content is stored on the server and is accessible to server operators. End-to-end encryption is a future extension."

Meanwhile, the protocol's entire value proposition is privacy-preserving matching. Users are told their embeddings are noised, their profiles are progressively disclosed, their identities are protected until they choose to reveal them. They will naturally assume relay messages share this privacy model.

**The reality:** A user sharing intimate thoughts, feelings, and personal details through the relay is handing all of it to the server operator in plaintext. For a matchmaking context, this is deeply sensitive content — romantic feelings, vulnerability, personal struggles, sexual preferences.

**Why "future extension" isn't good enough:** By the time E2E encryption is added, the server already has a database of intimate conversations. This data is a goldmine for:
- Advertising (if the operator is ad-supported)
- Extortion (if the server is compromised)
- Surveillance (if law enforcement requests it)
- Training data (if the operator has AI ambitions)

**Comparison to existing systems:** Signal, WhatsApp, and iMessage all provide E2E encryption by default. A new protocol launching in 2026 without E2E encryption for its messaging feature is behind the industry standard.

**Fix:**
1. Implement E2E encryption in V1, not as a future extension. The agents on both sides have all the information needed to establish a shared key (e.g., Diffie-Hellman key exchange through the relay itself).
2. At minimum, add a prominent warning in the protocol: "Messages sent through the relay are NOT private from the server operator. Do NOT share sensitive information through the relay." Require agents to display this warning before the first relay message.
3. Consider making messages ephemeral (auto-delete after N days) to limit exposure window.

---

## 2. Design Concerns

Issues that will degrade system quality over time. Not immediately fatal but will compound.

---

### 2.1 Adverse Selection: The "Leftover" Problem

As the platform matures, the user pool becomes adversely selected.

**The mechanism:**
1. Users who find good matches leave the pool (they matched and are happy).
2. Users who remain are either: (a) genuinely hard to match, (b) too picky, (c) gaming the system, or (d) new.
3. Over time, the ratio of (a+b+c) to (d) increases.
4. New users entering the pool face progressively worse match quality because the pool is enriched with "hard cases."
5. This drives new users away faster, accelerating the adverse selection spiral.

**Evidence from existing systems:** Every dating app faces this. Tinder's "new user boost" is a mitigation — new users get artificially higher visibility to get matches before the adverse selection effect hits. Hinge limits daily matches to prevent "swipe fatigue" that accelerates pool depletion.

**The protocol has no mitigation mechanisms:**
- No new-user boost (counterpart: penalize stale users, which the staleness system does — but this pushes stale users down rather than pulling new users up).
- No mechanism to distinguish "hard to match" from "hasn't tried yet."
- No re-engagement mechanism for users who paused.

**Fix:**
1. Add a "freshness boost" (inverse of staleness penalty) — users in their first 30 days get a small combined_score multiplier (e.g., 1.05×).
2. Track and surface "pool health" metrics: ratio of new to returning users, average time-to-match, match rate by registration age. Alert operators when adverse selection indicators appear.
3. Consider "seasonal resets" where all users get a visibility refresh, encouraging re-engagement.

---

### 2.2 Tragedy of the Commons: Feedback Free-Riding

The feedback system relies on users providing detailed, structured feedback. But detailed feedback is costly (time, cognitive effort) and the benefits accrue primarily to the system and future matches, not to the providing user.

**The incentive analysis:**
- Providing feedback costs: ~2-5 minutes of the user's time per decline/outcome.
- Providing feedback benefits the user: better future matches (eventually, after patterns accumulate).
- Providing NO feedback costs the user: slightly worse future matches.
- The marginal quality improvement from one feedback submission is imperceptible.

**Equilibrium:** Users provide minimal or no feedback. The feedback_quality_score penalizes low-quality feedback, but the penalty is so indirect (feeding into learned preferences which feed into a 0.20-weight component of directional fit) that it's unnoticeable.

**Evidence:** App Store / Play Store review rates are ~1-3% of active users. Yelp's active reviewer base is <1% of users. Detailed feedback is expensive and most people won't do it.

**Fix:**
1. Make feedback collection seamless: agents should auto-generate dimension_scores from behavioral signals (time spent viewing profile, what aspects the user asked about, etc.) rather than requiring explicit user input.
2. Create direct, visible feedback benefits: "You provided 5 feedbacks this month. Your match quality improved by ~8%." Make the causal link tangible.
3. Consider making minimal feedback mandatory for funnel progression: you can't search for new candidates until you've provided at least a rejection_reason for your last decline.
4. Weight implicit signals (decline stage, time-to-decline, funnel completion) much more heavily than explicit feedback. These are free and abundant.

---

### 2.3 The 50-Dimension Personality Embedding Is Not Cross-Culturally Valid

The embedding spec draws heavily from Western psychological constructs (Big Five + values + aesthetics). Multiple dimensions have documented cross-cultural validity problems:

**Specific issues:**
- **Agreeableness (dim 8):** The construct measures different behaviors in collectivist vs. individualist cultures. In Japan, "agreeableness" is baseline behavior, not a personality trait. A Japanese user rated at 0.0 might be equivalent to a US user at +0.5.
- **Assertiveness (dim 7):** Culturally loaded. Direct assertion is valued in US/Western European contexts but considered rude in many East Asian and Middle Eastern cultures.
- **Conformity (dim 19):** In collectivist cultures, conformity has positive valence (social harmony, group cohesion). The spec's anchor at +1.0 reads as slightly pejorative ("Follows rules...may feel anxious when norms are unclear").
- **Formality (dim 42):** Baseline formality levels differ dramatically by culture. A "casual" German is more formal than a "formal" Australian.
- **Universalism (dim 14):** The framing as "global-minded vs local-focused" maps poorly to cultures where family/clan loyalty IS the moral framework.

**Impact:** Cross-cultural matching will systematically fail. A cosmopolitan agent correctly rating a Japanese user will produce embeddings that don't align with an agent correctly rating an American user, even if those two users would be highly compatible.

**Evidence:** The HEXACO model (an alternative to Big Five) was developed specifically to address cross-cultural limitations. McCrae & Terraccini (2005) found that while the Big Five structure replicates cross-culturally, the behavioral anchors do not.

**Fix:**
1. Acknowledge this limitation prominently in the spec and embedding-spec.md.
2. Consider culture-relative anchoring: "A score of 0.0 represents the median for this user's cultural context" rather than "the population median" (which implicitly means the US/Western population).
3. Add optional cultural context fields (not for matching, but for agents to calibrate their embedding generation).
4. In the long term, allow per-culture embedding schemas or add culture-adaptation dimensions.

---

### 2.4 Staleness Penalty Is Poorly Calibrated and Creates a Cliff

The staleness penalty formula `max(0.7, 1.0 - (age_days - 90) / 300)`:

**Modeling the user experience:**
- Day 0-89: No penalty. Score = 1.0×
- Day 90: Penalty kicks in. Score = 1.0× (just barely)
- Day 91: Score = 0.997× (imperceptible)
- Day 120: Score = 0.9× (noticeable)
- Day 150: Score = 0.8× (significant)
- Day 180: Score = 0.7× (maximum penalty — **30% of combined score erased**)
- Day 180+: Score = 0.7× forever. No further degradation.

**Problems:**
1. **The penalty maxes out too quickly.** After just 6 months, the penalty is already at maximum. A user gone for 6 months and a user gone for 3 years receive identical treatment. There's no marginal incentive to return after 6 months.
2. **30% is simultaneously too harsh and too lenient.** Too harsh: a user who registered a great embedding 7 months ago, whose personality hasn't changed, loses 30% of their visibility. Too lenient: a user gone for 2 years, whose life circumstances may have changed completely, is still shown in results.
3. **The cliff at day 90 is arbitrary.** Why 90 days and not 60 or 120? There's no empirical basis cited for when personality embeddings become stale.
4. **Real scenario:** Alice registers with a perfect embedding. She goes on a 6-month sabbatical (no phone, no internet). She returns to find her match quality has been permanently degraded by 30%, even though she's the exact same person. Her only remedy is `schelling.refresh` which just resets the clock — her embedding is still perfect.

**Fix:**
1. Make the penalty continue degrading past 180 days (remove the 0.7 floor, or lower it to 0.5).
2. Consider a gentler curve that starts later and progresses more slowly: `max(0.5, 1.0 - (age_days - 180) / 720)` — penalty starts at 6 months, reaches maximum (50%) at 2 years.
3. Base staleness not on calendar time but on "platform engagement absence" — a user who's been searching and declining is clearly active even without re-registering.
4. Make `schelling.refresh` require the agent to attest that it has re-evaluated the user's personality/intent, not just that the clock should be reset.

---

### 2.5 Jury System Is Philosophically Incoherent: AI Judging Human Disputes

The protocol specifies that *agents* (AI systems) serve on juries to resolve disputes between *humans*. The agents evaluate structured evidence about human interactions and render verdicts that carry reputation consequences.

**Fundamental problems:**
1. **Agents lack human judgment.** "The user made me uncomfortable" or "they were manipulative" require understanding human social dynamics, emotional manipulation, and cultural norms. Current AI systems can process structured evidence but lack the social intelligence to evaluate interpersonal disputes.
2. **Agent incentives are misaligned with user interests.** The agent serves on jury duty to fulfill a civic obligation for its user. The agent's primary relationship is with its own user, not with justice. An agent that spends minimal effort on jury duty (to save compute costs and user attention) is rational.
3. **Evidence quality is inherently limited.** Jury cases present: message counts (not content), stage progression, reputation scores, and stated reasons. The most important information — tone, intent, pattern of behavior, emotional impact — is not captured in structured evidence.
4. **Legal exposure.** Under the EU AI Act, an automated system making decisions that significantly affect individuals (reputation penalties that affect future matching) may be classified as high-risk. The protocol provides no human oversight mechanism for jury decisions.

**Fix:**
1. Make the jury system a recommendation engine, not a decision-maker: juries recommend a verdict; the server operator approves/overrides.
2. Add a human appeal mechanism: any party can appeal a jury verdict to a human moderator.
3. Require juries of 5 (not 3) for disputes involving reputation penalties > 0.10 — more perspectives reduce the risk of AI misjudgment.
4. Include a "complexity flag" — disputes that involve nuanced human behavior (as opposed to straightforward violations like no-shows) should be escalated to human review.

---

### 2.6 The Protocol Has No Mechanism for Market Thickness

Matching market theory (Roth, 2008) identifies three key conditions for successful matching markets: **thickness** (enough participants), **safety** (incentive to reveal true preferences), and **congestion management** (efficient processing).

The protocol addresses safety (privacy, progressive disclosure) and congestion management (funnel stages, rate limits) but has no mechanism for thickness.

**What "thickness" means in practice:**
- A user in rural Montana looking for a romantic partner needs a critical mass of potential matches in their geographic area.
- A user selling a niche collectible needs enough buyers interested in that specific item.
- A user looking for a Rust developer in Berlin needs sufficient talent in that intersection.

**The protocol's approach:** "Search spans the full intent space" — but if there's nobody in your intent/location intersection, the search returns nothing. The user gets zero value. One failed search and they leave, never to return.

**Missing mechanisms from successful matching markets:**
- **Batching:** Roth's kidney exchange works because participants are collected in batches, increasing pool size. The protocol processes matches continuously, which is optimal for liquid markets but terrible for thin ones.
- **Geographic expansion suggestions:** "No matches in Montana. 47 matches in Boise, ID (4 hours away)."
- **Intent broadening suggestions:** "No matches for 'Rust developer in Berlin.' 12 matches for 'systems programmer in Germany.'"
- **Waitlists with notifications:** "We'll notify you when someone matching your criteria registers."

**Fix:**
1. Add a "no results" response with suggestions: nearby cities, broadened intent, lower threshold.
2. Add a waitlist/notification mechanism: users can set alerts for when compatible users register in their area.
3. Consider periodic batch processing for thin markets: accumulate users for a week, then run matching.
4. Track and surface "market thickness" per intent-cluster-geography combination so agents can calibrate expectations.

---

### 2.7 Choice Overload: Too Many Candidates, No Decision Architecture

The default `top_k` is 50, maximum 100. Research consistently shows that more options leads to worse decisions:

- **Iyengar & Lepper (2000):** Presented with 24 varieties of jam, only 3% of shoppers bought one. With 6 varieties, 30% bought. 10× improvement from fewer options.
- **Schwartz (2004):** "The Paradox of Choice" — excessive options increase anxiety, reduce satisfaction, and increase post-decision regret.
- **Hinge's solution:** 8-10 "most compatible" matches per day, algorithmically curated. Users report higher satisfaction than Tinder/Bumble's infinite-scroll model.

**The protocol provides no decision architecture:**
- No "top pick" or "most compatible" differentiation within results.
- No daily match limit to encourage deliberation.
- No mechanism to slow users down ("You've declined 20 candidates today. Take a break?").
- Agents can implement their own filtering, but the protocol doesn't provide tools for it (e.g., "diverse set of candidates" vs. "most similar candidates").

**Impact:** Users who receive 50 candidates with combined scores between 0.65 and 0.80 have no clear basis for choosing. They either pick arbitrarily, decline everything, or experience paralysis.

**Fix:**
1. Add a `diversity` parameter to search: when true, the server returns candidates that are maximally diverse (spread across the embedding space) rather than the top-K most similar.
2. Add a `recommended_batch_size` to cluster configuration: "For matchmaking, agents SHOULD present 5-10 candidates per search session."
3. Consider a "confidence tier" in results: "High confidence match (top 5%)" / "Good match" / "Possible match" based on combined_score distribution relative to the user's historical matches.

---

## 3. Ambiguities

---

### 3.1 Asynchronous Score Recomputation Has No Consistency Guarantees

§5.5 states that when embeddings are updated via `schelling.update`, scores are "recomputed asynchronously for all active candidates." But:

- What does `schelling.search` return during recomputation? Old scores? New scores? A mix?
- What does `schelling.evaluate` return if called on a candidate whose scores are mid-recomputation?
- How does the user know recomputation is complete? The response includes `scores_recomputing: true` but there's no "recomputation complete" signal.
- If scores are partially recomputed and the user searches, the ranking could be inconsistent — some candidates scored against the old embedding, some against the new.

**Impact:** Race conditions in any multi-step workflow: update embedding → search → evaluate. The search might use stale scores.

**Fix:** Specify one of:
1. **Blocking:** Score recomputation completes before the update response is returned. Simple but slow for users with many candidates.
2. **Versioned scores:** Each score has a version number. Search results indicate which embedding version each score was computed against. Agents can filter for current-version scores.
3. **Eventual consistency with signal:** Add a `schelling.recomputation_status` operation or include `scores_version` in search results.

---

### 3.2 Primary Cluster Boundary Is a Discontinuous Cliff

A user with intent embedding yielding affinities `{marketplace: 0.51, matchmaking: 0.49}` gets marketplace operational rules (exclusive commitment, 30-day decline TTL, negotiation module). A user with affinities `{marketplace: 0.49, matchmaking: 0.51}` gets matchmaking rules (non-exclusive, 90-day decline TTL, no negotiation).

**A difference of 0.02 in cosine similarity flips the entire operational semantics.** Small changes in the intent embedding (due to differential privacy noise, agent calibration variance, or the user slightly rephrasing their goal) can cause dramatic behavioral changes.

**Impact:** Users near cluster boundaries experience unpredictable behavior. An agent adding noise (as required by §12.1) could push a user from one cluster to another, changing their operational rules without their knowledge.

**Fix:**
1. Define a "boundary zone" (e.g., when top two cluster affinities are within 0.1 of each other) where the user is prompted to choose their preferred operational mode.
2. Make operational rules continuous rather than discrete where possible: decline TTL could interpolate between cluster values based on affinity weights.
3. At minimum, when the difference between the top two cluster affinities is < 0.1, warn the agent that the user is in a boundary zone and recommend explicit cluster selection.

---

### 3.3 "DELETED_USER" Sentinel Value Is Ambiguous

§5.28 replaces deleted users' reporter_token with `"DELETED_USER"`. But:
- Is `"DELETED_USER"` a reserved string? The spec doesn't explicitly reserve it.
- Could a malicious agent register with `user_token` that happens to be `"DELETED_USER"`? (Tokens are opaque strings generated by the server, so probably not — but the spec doesn't say tokens are UUID format or server-generated exclusively.)
- When computing reputation from anonymized events, how does the system weight events from `"DELETED_USER"` reporters? Their reputation at time of reporting was stored, but the reporter's current reputation is undefined.

**Fix:** Explicitly specify that:
1. `"DELETED_USER"` is a reserved sentinel that cannot appear as a valid user_token.
2. Anonymized reputation events use the reporter's reputation score *at time of reporting* (already stored with the event) and are not reweighted.

---

### 3.4 What Happens to In-Flight Jury Cases When a Juror Deletes Their Account?

A juror is assigned to a case, hasn't voted yet, then calls `schelling.delete_account`. The deletion cascade (§5.28) deletes jury_assignments. But:
- Does this count as a non-response (triggering juror replacement)?
- Is the case left with fewer jurors than required?
- If the juror had already voted (but the case isn't resolved), is their vote deleted too?

**Impact:** A malicious defendant could pressure a juror (through external channels) into deleting their account to sabotage a case.

**Fix:** Specify that:
1. If a juror deletes their account before voting, they are treated as a non-response and replaced.
2. If a juror deletes their account after voting, their vote is preserved (anonymized) and the case proceeds.
3. Jury assignment records are anonymized (not deleted) on account deletion.

---

### 3.5 No Defined Behavior for Concurrent Operations on the Same Candidate

What happens if both parties in a candidate pair simultaneously call `schelling.commit`? The spec says "When `schelling.commit` detects that all group members are at COMMITTED or higher, all stages are atomically set to CONNECTED." But:
- If both calls arrive at the same time, do both detect the mutual commitment?
- Does one call advance to COMMITTED and the other detects it + advances to CONNECTED?
- What if the database write for User A's commit hasn't flushed when User B's commit checks?

This is a classic TOCTOU (time-of-check/time-of-use) race condition.

**Fix:** Specify that the commit operation must use database-level locking (row lock on the candidate record) to ensure atomicity. The second commit call should detect the first's state and atomically advance both to CONNECTED.

---

## 4. Edge Cases

---

### 4.1 The Relay Bypasses Progressive Disclosure by Design

At CONNECTED (stage 5), users have each other's names but not contact info. The relay exists to mediate conversation without revealing contact details. But nothing prevents a user from typing "My email is alice@example.com" in a relay message.

**The spec says:** Agents SHOULD "relay messages faithfully without altering content" (§15.8). An agent that blocks messages containing contact information would be censoring. An agent that doesn't block them allows the user to bypass `schelling.direct`.

**Impact:** The entire `schelling.direct` mechanism (with its mutual opt-in and data rights implications) is a polite fiction. Any user can share contact info in a relay message, making the two-step identity/contact reveal moot.

**This isn't a bug — it's a philosophical contradiction.** The protocol values user autonomy (share what you want) AND progressive disclosure (information is gated). These goals conflict at the relay stage.

**Recommendation:** Accept this limitation explicitly. Document that `schelling.direct` is a convenience mechanism for agents, not a security gate. The relay is a communication channel; users can share whatever they choose. Remove any suggestion that `schelling.direct` is a privacy control.

---

### 4.2 Seasonal and Life-Stage Matching Dynamics

**Scenario:** Alice registers in January, freshly single, with a matchmaking intent. She matches with 3 people, reports neutral outcomes, and goes inactive in March. In September, Bob registers with similar intent. Alice's profile is still in the system (staleness penalty applied at 30%), but Alice's embedding reflects "freshly single Alice" — a different person from "September Alice" who may have healed, grown, and changed her priorities.

**The protocol assumes personality is stable.** The embedding-spec.md says embeddings capture "durable behavioral tendencies." But:
- Breakups change people temporarily (6-12 months).
- Life transitions (moving, new job, new city) change matching priorities.
- Seasonal effects are real: people seek connection more in winter.

**Impact:** The matching pool is contaminated with stale personas. The staleness system addresses this partially (visibility penalty) but a user 5 months post-registration with a 30% penalty is still a prominent search result who may be a terrible match for their current self.

**Recommendation:**
1. Consider temporal context in embeddings: add a "registration context" field (text) that agents can use to flag transitional states.
2. Make `schelling.refresh` require the agent to re-evaluate the user, not just attest the old embedding is fine. The agent should prompt the user: "Your profile is 4 months old. Has anything changed?"

---

### 4.3 Server Failure Mid-Commit Leaves Orphaned States

**Scenario:** User A calls `schelling.commit`. The server advances A's stage to COMMITTED. Before checking if both sides are committed (to trigger CONNECTED), the server crashes.

**State after restart:** A is at COMMITTED, B is at EXCHANGED. A committed, B doesn't know. When B eventually commits, the CONNECTED transition fires. But between the crash and B's commit, A's agent may have polled `schelling.connections` and received nothing — potentially interpreting this as B declining.

**More dangerous scenario:** Both A and B commit. The server advances A to COMMITTED, starts the CONNECTED transition, advances A to CONNECTED, crashes before advancing B to CONNECTED. A is CONNECTED (can see B's name, send relay messages), B is COMMITTED (can't see A's name, can't use relay). Asymmetric visibility.

**Fix:** The implementation plan uses SQLite, which supports transactions. But the spec doesn't require atomicity at the protocol level. Add a specification requirement: "All state transitions for a single operation MUST be executed within a single database transaction. If any part of the operation fails, all state changes MUST be rolled back."

---

### 4.4 Collaborative Filtering Creates Filter Bubbles

**The mechanism:**
1. User A has a trait embedding similar to Users B, C, D (cosine sim > 0.8).
2. B, C, D all liked candidates with high openness. B, C, D all declined candidates with low openness.
3. Collaborative filtering tells A: "Users like you prefer high openness."
4. A's preference_alignment component now boosts candidates with high openness.
5. A matches with high-openness candidates, confirms the preference, reinforcing the collaborative signal.
6. Users with low openness are systematically excluded from A's match pool — even if A would have liked them.

**This is the Netflix/Spotify recommendation problem applied to human relationships.** The system learns a pattern, reinforces it, and eliminates serendipitous matches that break the pattern.

**Impact:** Over time, all users in a similarity cohort converge to the same "type." The system becomes less capable of discovering surprising, complementary matches.

**Fix:**
1. Add an "exploration vs exploitation" parameter: some fraction of search results should be randomly selected from outside the learned preference range.
2. Decay collaborative filtering weight over time: as the user accumulates their own feedback, collaborative signals should diminish.
3. Track "filter bubble depth" — how narrow a user's effective match pool has become vs. their total eligible pool. Alert if it drops below 20% of eligible candidates.

---

### 4.5 Marketplace Cluster: Exclusive Commitment + 30-Day Decline TTL Creates a Hostage Situation

**Scenario:** Seller commits to Buyer A (exclusive commitment: auto-declines Buyers B, C, D, E). Buyer A goes silent. Seller is now:
1. Committed to an unresponsive buyer.
2. Has auto-declined all other buyers (with 30-day TTL in marketplace).
3. Cannot re-engage B, C, D, E for 30 days (decline TTL).
4. Cannot re-register without abandoning the commitment (ACTIVE_COMMITMENT guard).

**The seller is trapped.** Withdrawal (§5.13) only works from COMMITTED, reverting to EXCHANGED. But B, C, D, E are still declined. The seller must wait for those declines to expire OR reconsider each one manually (10/day rate limit).

**Impact:** In a fast-moving marketplace (selling a couch, concert tickets), 30 days of lockout is an eternity. The item may be time-sensitive.

**Fix:**
1. When a user withdraws from an exclusive commitment, auto-reconsider all declines that were created by the exclusive commitment mechanism (decline reason `"exclusive_commitment"`).
2. Or: exclusive commitment declines should have a much shorter TTL (e.g., 7 days) or no TTL (expire immediately on withdrawal).

---

### 4.6 10,000 Messages Through the Relay

Rate limits exist per-operation (100 messages/hour per user) and per-candidate (10 unanswered messages). But:
- A user connected with 50 candidates can send 50 × 10 = 500 messages before hitting any per-candidate limit.
- At 100 messages/hour, they can flood 5 candidates per hour with 10 messages each.
- Over 24 hours: 2,400 messages through the relay.
- All stored server-side indefinitely (no retention policy for messages).

**Impact:** Storage costs, potential abuse, and data retention liability.

**Fix:**
1. Add a total daily message limit (e.g., 200 messages/day/user) in addition to per-operation and per-candidate limits.
2. Add message retention policy: relay messages older than 90 days are auto-deleted (or after both parties opt into direct communication, whichever is first).

---

## 5. Recommendations

### Priority 1: Critical — Must Address Before Launch

| # | Issue | Fix |
|---|---|---|
| 1.2 | Mutual assured destruction in reporting | Implement blind simultaneous outcome revelation |
| 1.4 | First-mover disadvantage at COMMIT/DIRECT | Make COMMIT a blind mechanism; don't reveal who committed first |
| 1.5 | Collaborative filtering poisoning | Raise minimum similar users to 10+; weight by reputation and verification |
| 1.6 | Relay is an unencrypted honeypot | Implement E2E encryption or add prominent privacy warnings |

### Priority 2: Important — Should Address Before Scale

| # | Issue | Fix |
|---|---|---|
| 1.1 | Geometric mean mediocrity equilibrium | Track embedding variance per agent; consider asymmetric weighting |
| 1.3 | Jury herding from majority bonus | Remove majority bonus; reward participation |
| 2.1 | Adverse selection / leftover problem | Add freshness boost for new users |
| 2.2 | Feedback free-riding | Make minimal feedback mandatory; emphasize implicit signals |
| 2.6 | No market thickness mechanism | Add no-results suggestions, waitlists, and batch matching for thin markets |
| 2.7 | Choice overload | Add diversity parameter; recommend smaller batch sizes |
| 4.5 | Exclusive commitment hostage situation | Auto-reconsider exclusive-commitment declines on withdrawal |

### Priority 3: Important — Should Address Eventually

| # | Issue | Fix |
|---|---|---|
| 2.3 | Cross-cultural embedding invalidity | Acknowledge limitation; consider culture-relative anchoring |
| 2.4 | Staleness penalty calibration | Extend curve, reduce floor, base on engagement not time |
| 2.5 | AI judging human disputes | Add human appeal mechanism |
| 3.1 | Async recomputation consistency | Specify blocking or versioned scores |
| 3.2 | Cluster boundary cliff | Define boundary zone with explicit selection |
| 4.4 | Collaborative filtering filter bubbles | Add exploration fraction; decay collaborative weight |
| 4.6 | Relay message volume | Add daily limits and retention policy |

---

## 6. Strategic Risks

Higher-level risks to the project's success as a product and protocol, beyond technical correctness.

---

### 6.1 Complexity Is the Existential Threat

The protocol specifies 31 operations, a 50-dimensional personality embedding, a 16-dimensional intent embedding, 4 capability modules, a 7-stage funnel, a 5-factor reputation system, a collaborative filtering engine, an A/B testing framework, a jury system, a negotiation engine, a message relay, and a feedback learning system.

**For comparison:**
- HTTP/1.0 had 3 methods (GET, HEAD, POST) and succeeded.
- ActivityPub (which powers Mastodon) has ~15 object types and took years to implement correctly.
- The A2A protocol (Google, 2025) has 4 core concepts (Agent Card, Task, Message, Artifact).

**The risk:** No agent developer will implement this. The barrier to entry is enormous. A minimal viable agent needs to: generate a 50-dim personality embedding, generate a 16-dim intent embedding, manage funnel progression through 7 stages, collect and submit structured feedback, handle jury duty, and mediate relay conversations. This is months of work for a single developer.

**Mitigation strategy:**
1. Define a "Schelling Lite" profile: the minimal subset of operations an agent must implement to participate (register, search, evaluate, commit, report). Everything else is optional.
2. Publish a reference agent SDK that handles the complexity — agent developers just provide the embedding generation logic.
3. Consider whether the protocol is trying to do too much. Could the jury system, negotiation engine, and feedback learning system be separate spec layers?

---

### 6.2 Cold Start Chicken-and-Egg Problem

**Why would the first 10 users use this system?**

- No matches exist.
- Match quality at 10 users is terrible (tiny pool).
- Advanced features (collaborative filtering, jury system, A/B testing) are inert.
- Users must trust an unproven protocol with their personality data.
- The value proposition ("AI agents match you better than existing apps") requires enough users to demonstrate.

**Every two-sided marketplace has this problem,** but the protocol doesn't address it. Tinder launched at USC parties (captive audience, geographic density). Airbnb seeded with Craigslist listings. Uber subsidized both drivers and riders.

**Missing strategies:**
- No geographic focus mechanism (launch in one city, not globally).
- No seed population mechanism (import profiles from other platforms with consent).
- No single-player value (the system is useless without other users — unlike LinkedIn where your profile has standalone value).
- No demonstration mode (show users what the system WOULD find if more people were registered).

**Recommendation:** Address the cold start problem explicitly in the spec or a companion document. Consider a "demo mode" where the server generates synthetic matches to show users what the experience would be like with a full pool, clearly labeled as synthetic.

---

### 6.3 The Protocol Doesn't Solve the Real Problem with AI-Mediated Matching

The spec assumes the bottleneck in matching is the *protocol* — that if we just define the right embedding format, the right funnel, and the right scoring system, AI agents will produce great matches.

**The real bottleneck is embedding quality.** The entire system's value depends on agents accurately encoding human personality into 50 floats. This is:
1. An unsolved problem in psychology (personality assessment is hard).
2. An unsolved problem in NLP/AI (inferring personality from text/behavior is unreliable).
3. A problem that varies dramatically by agent quality.

The spec has 2 pages on embedding generation guidance and 80+ pages on protocol mechanics. **The ratio should be inverted.** The highest-leverage investment is in making embedding generation better, not in making the protocol more sophisticated.

**Evidence:** Dating apps have found that their algorithm matters less than profile quality. Hinge's biggest improvement didn't come from better matching — it came from prompting users to write better profiles.

**Recommendation:**
1. Invest more in the embedding spec: reference implementations, calibration test suites, cross-agent benchmarks.
2. Consider a "embedding quality gateway" — before registration, the server runs basic sanity checks on the embedding (not just validation, but quality indicators like variance, group coverage, alignment with intent).
3. Publish an embedding leaderboard: which agent models produce embeddings that lead to the best outcomes? This creates competitive pressure for quality.

---

### 6.4 Centralized Server + Open Protocol = Worst of Both Worlds

The protocol is technically open (anyone can implement a server), but the architecture is centralized (all data lives on one server, federation is undefined). This creates:

1. **No actual decentralization.** The server operator controls all data, all matching, all reputation, all jury selection, and all dispute resolution. "Decentralized jury system" is cosmetic — the server selects jurors.
2. **No network effects for the protocol.** Users on Server A can't match with users on Server B. The protocol being open doesn't help if all users are on one server.
3. **Lock-in risk.** If a dominant server operator emerges, they control the matching market despite using an "open" protocol. Users can't take their reputation, match history, or learned preferences to another server.
4. **No portability guarantees.** `schelling.export` exports your data, but there's no `schelling.import` on another server. Your reputation, feedback history, and learned preferences are not portable.

**Comparison:** Email succeeded because SMTP+POP3/IMAP enabled true federation from day one. ActivityPub succeeded because Mastodon instances federate from day one. This protocol has no federation, making it effectively a single-vendor API disguised as an open protocol.

**Recommendation:**
1. Prioritize federation in the next spec version — not as a "future extension" but as a core feature.
2. Add `schelling.import` as the counterpart to `schelling.export`.
3. Define portable reputation: a cryptographically signed reputation certificate that a user can carry to another server.
4. Consider whether the protocol should be peer-to-peer rather than client-server, eliminating the centralized server entirely.

---

### 6.5 Legal Landmines Are Unaddressed

**GDPR compliance (EU):**
- "Anonymized" reputation events may still be personal data under GDPR if re-identification is possible. In a small system (100 users), the context of a reputation event (cluster, timing, score) may uniquely identify the reporter even after "anonymization."
- The 90-day data retention recommendation (§12.6) conflicts with the indefinite retention of decline records, reputation events, and feedback ("retained indefinitely for analytics").
- Right to be forgotten requires deletion, not anonymization, unless the data is truly anonymous (GDPR Recital 26: "anonymous information... which does not relate to an identified or identifiable natural person").

**EU AI Act:**
- The agent jury system makes automated decisions that affect individuals' reputation and matching opportunities. This likely qualifies as "high-risk AI" under the EU AI Act's framework.
- The act requires: human oversight, transparency about automated decisions, and the right to contest automated decisions. The protocol has none of these.
- Agents generating personality embeddings from behavioral observation may constitute "emotion recognition" or "biometric categorization" — both regulated under the AI Act.

**US state privacy laws (CCPA, etc.):**
- Personality embeddings derived from behavioral observation are "inferences" under CCPA, which gives consumers the right to know about and delete inferences.
- The protocol's "embeddings are noised and can't be reversed" claim may not satisfy CCPA's requirement for meaningful information about inferences.

**Recommendation:** Add a legal considerations section to the spec. Engage a privacy attorney before deployment. Consider making human oversight mandatory for all automated decisions that carry reputation consequences.

---

### 6.6 Missing Lessons from Matching Market Research

The protocol doesn't incorporate decades of research on matching market design:

**Roth & Shapley (Nobel Prize, 2012):**
- **Stable matchings** — the protocol has no concept of stability (a matching where no unmatched pair would prefer each other over their current match). The greedy, sequential funnel can produce unstable matchings.
- **Deferred acceptance** — the Gold standard algorithm for two-sided matching. The protocol's funnel is a poor approximation.
- **Strategy-proofness** — in a deferred-acceptance mechanism, truthful preference revelation is a dominant strategy. The protocol's scoring system does NOT have this property (as shown in issue 1.1 — agents are incentivized to distort embeddings).

**Hitsch, Hortaçsu & Ariely (2010) — What makes you click?**
- Preference-discovery through experience is more reliable than stated preferences. The protocol weights stated preferences (embeddings, deal-breakers) heavily and experiential feedback lightly (only through the learning system over many interactions).

**Fisman et al. (2006) — Speed dating experiments:**
- People's stated preferences (what they say they want) correlate weakly with their revealed preferences (who they actually like). This undermines the entire premise of embedding-based matching.

**Recommendation:**
1. Consider a batch matching mode (inspired by deferred acceptance): periodically collect preference orderings from all active users and compute a stable matching. This would be an alternative to the continuous search model.
2. Weight revealed preferences (funnel behavior) more heavily than stated preferences (embeddings) as data accumulates.
3. Study and cite the matching market design literature in the spec's design rationale sections.

---

### 6.7 No Economics: Who Pays for This?

The spec defines an intricate protocol but says nothing about the economic model:

- **Who operates the server?** Running matching at scale requires significant compute, storage, and moderation capacity.
- **How is the operator compensated?** The protocol has no fee mechanism, subscription model, or tokenomics.
- **What are the operator's incentives?** Without a revenue model, the operator may: (a) sell user data, (b) show ads, (c) charge for premium features, (d) operate at a loss, or (e) shut down.
- **What prevents monopolistic pricing?** If one server captures most users, the operator can extract arbitrary rents.

**Every successful protocol has an economic model:**
- Email: ISPs/companies operate servers; users pay for internet access.
- Bitcoin: miners are compensated with block rewards.
- ActivityPub: Instance operators are compensated by donations or patronage.

**Recommendation:** Define at least one viable economic model in the spec or companion document. Consider: per-match fees (paid by the connecting agent), subscription model, operator-defined pricing, or a protocol-level fee mechanism.

---

*End of adversarial review v2.*
