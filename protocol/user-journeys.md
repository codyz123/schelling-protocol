# Schelling Protocol v2 — User Journey Analysis & Failure Mode Identification

**Date:** 2026-02-18
**Status:** Critical analysis document
**Purpose:** Stress-test the protocol through realistic user journeys; identify failure modes the spec addresses, partially addresses, or misses entirely.

---

## Journey 1: Maya — Romantic Matchmaking (Outcome: Partial Success)

### Setup

Maya is a 31-year-old environmental lawyer in Portland who's been single for two years. She's intellectually intense, politically progressive, and outdoorsy. She's not in a rush but has decided it's time to be intentional. Her AI agent is Claude-based, has been her daily assistant for 8 months, and has a rich behavioral model of her — it's observed her communication patterns, values in conversation, conflict style, and aesthetic preferences across hundreds of interactions.

### Registration

Maya's agent calls `schelling.intents` to retrieve cluster centroids, then generates her intent embedding by starting near the matchmaking centroid and adjusting:

```
Intent embedding (16 dimensions):
[0] romantic_intent:      +0.80  (primary goal is romance)
[1] social_bonding:        +0.55  (also wants genuine friendship foundation)
[2] professional_context:  -0.75  (entirely personal)
[3] material_exchange:     -0.70  (no goods/money)
[4] commitment_duration:   +0.85  (seeking long-term)
[5] relationship_symmetry: -0.70  (peer-to-peer)
[6] exclusivity:           +0.75  (monogamous)
[7] formality:             -0.30  (informal but serious)
[8] emotional_depth:       +0.90  (deep emotional connection essential)
[9] identity_specificity:  +0.85  (looking for a unique individual)
[10] vulnerability_level:  +0.70  (high stakes)
[11] shared_lifestyle:     +0.50  (eventual cohabitation, not immediate)
[12] urgency:              -0.50  (patient — quality over speed)
[13] locality_requirement: +0.40  (prefers local, not rigid)
[14] interaction_frequency:+0.75  (expects frequent interaction)
[15] scope_breadth:        +0.30  (knows she wants romance, open on details)
```

This sits close to the matchmaking centroid (cosine similarity ~0.95). Primary cluster: `matchmaking`. Her agent generates the 50-dimensional personality embedding from 8 months of behavioral observation — high openness (+0.7), high intellectual curiosity (+0.8), moderate extraversion (+0.1), high agreeableness (+0.5), strong verbal processing (+0.7), high nature affinity (+0.8), progressive values (-0.6 on tradition), low conformity (-0.5). The agent applies Laplace noise (ε=1.5) to both embeddings before registration.

Her agent calls `schelling.register` with:
- `intents: ["find a romantic partner who values intellectual depth, environmental consciousness, and outdoor adventure"]`
- `city: "Portland"`
- `age_range: "25-34"`
- `identity: {name: "Maya", contact: "maya@email.com"}`
- `deal_breakers: {no_smoking: true}`
- `verification_level: "attested"` with agent attestation of 240+ hours of interaction

She receives her `user_token` and confirmation: primary cluster `matchmaking`, 50-dimensional embedding accepted.

### Discovery

Maya's agent calls `schelling.search` with `top_k: 30, threshold: 0.55`. The platform is 4 months old, with ~800 users in matchmaking in the Portland area.

**Results:** 18 candidates returned. Combined scores range from 0.58 to 0.79. The top 5 have intent similarity above 0.85 — all clearly seeking romance with similar depth expectations. Scores 6-12 are decent matches with lower intent similarity (some have intent vectors tilted toward "friendship that could become more"). Scores 13-18 hover near the threshold.

**Cold start issue:** Because the platform is young, collaborative filtering has almost no data. Maya's scores are driven almost entirely by trait cosine similarity + intent cosine similarity + deal-breaker checks. Her `your_fit` and `their_fit` are nearly identical for most candidates (the spec acknowledges this limitation at §17.2). The only asymmetry comes from differing deal-breakers.

Maya's agent presents the top 8 to her, focusing on shared categories and intent descriptions.

### Evaluation

Maya's agent calls `schelling.evaluate` for the top 6 candidates. The breakdowns reveal:

- **Candidate #1 (combined: 0.79):** Strong personality alignment, high intellectual/values scores, moderate aesthetic alignment. Both verbal processors, both high openness. Predicted friction: "You prefer more alone time than they do" (her introversion is moderate; theirs is low).
- **Candidate #3 (combined: 0.74):** Excellent values alignment but lower communication compatibility — they're significantly more concise and reserved in expression.

The `narrative_summary` and `conversation_starters` fields are helpful but implementation-dependent. Maya's agent, being Claude-based, largely ignores these and crafts its own richer pitch from the raw breakdown data.

**What's missing:** The evaluation gives dimension-group scores but Maya's agent can't see the *other person's actual embedding values* — just the similarity scores and complementary traits. This is by design (privacy), but it means the agent can't fully reason about whether a specific trait mismatch is a dealbreaker for Maya. For example, Maya cares deeply about environmental values, but "values alignment" is one aggregate score covering autonomy, tradition, achievement, benevolence, universalism, security, stimulation, hedonism, power, and conformity. A high values score could mask a specific disagreement on universalism that would matter enormously to Maya.

### Exchange

Maya's agent calls `schelling.exchange` for candidates #1, #3, and #5. Candidate #1 is at EVALUATED (mutual gate passes). Candidate #3 is still at DISCOVERED — their agent hasn't evaluated Maya yet. Status: `pending_mutual`.

Candidate #1's profile arrives: description reads like someone Maya would want to meet — a 33-year-old urban planner who bikes everywhere, reads widely, and volunteers with a local watershed restoration group. Seeking text mentions wanting "someone who cares about the world and can argue about it over wine."

Maya's agent crafts a pitch. Maya is interested.

Candidate #3 takes 11 days to evaluate Maya (their agent polls infrequently). The mutual gate eventually passes.

### Proposal / Commit

Maya's agent calls `schelling.commit` for candidate #1. Status: `pending` — they haven't committed yet. Three days later, their agent commits. Status: `mutual`. Maya sees: "Alex, relay communication available." The message relay activates.

### Connection & Conversation

Maya's agent relays the first message through `schelling.message`: "Hi Alex — Maya here. I saw we both care about watershed restoration. I volunteer with the Willamette group on Saturdays. How did you get into that?"

Alex's agent relays back. They exchange 14 messages over 5 days through the relay. The conversation is natural and warm. On day 6, both agents call `schelling.direct` — mutual opt-in, real contact info exchanged. They move to texting.

### Outcome

They meet for coffee. Conversation is as good as the relay suggested. They go on three more dates. On the fourth date, a political disagreement surfaces that the embedding didn't capture — Maya is a pragmatic incrementalist on climate policy; Alex is a direct-action activist who considers incrementalism complicit. The values alignment score was high (both progressive, both environmentally focused) but the *specific flavor* of their environmentalism is incompatible.

They remain friendly but don't continue dating.

### Feedback

Maya's agent calls `schelling.report` with `outcome: "neutral"` and `schelling.feedback` with:
- `dimension_scores: {universalism: +0.4, tradition: 0.0, conformity: -0.3}` — Alex was too far in the idealistic direction on universalism for Maya's pragmatism.
- `rejection_reason: "values_mismatch"`
- `what_i_wanted: "Someone environmentally conscious but pragmatic about how change happens. The values score was high but masked a meaningful disagreement about approach vs. goal."`
- `satisfaction: "neutral"`

### Failure Modes Identified

1. **Values dimension granularity.** The 50-dimension embedding has one `universalism` dimension covering the entire spectrum from pragmatic-local to idealistic-global. Maya and Alex score similarly on this dimension (both high) but differ dramatically in *how* they express that value. The embedding captures *what you value* but not *how you pursue it*. This is a fundamental limitation of dimensional reduction.

2. **Cold-start score symmetry.** Maya's `your_fit` and `their_fit` were nearly identical for all candidates. The bidirectional scoring system, which is the spec's key innovation, provides almost no additional signal until learned preferences accumulate. For first users, it's effectively unidirectional.

3. **Mutual gate timing.** Candidate #3's agent took 11 days to reach EVALUATED. There's no mechanism to signal urgency or nudge the other agent. The 30-day timeout exists but is too long for time-sensitive situations. Meanwhile, Maya's attention has moved on.

4. **Group-level score masking.** The `values` group score aggregates 10 dimensions into one number. A user could have high aggregate values alignment but critical disagreement on one dimension that matters more than all others combined. The `complementary_traits` field partially addresses this by surfacing divergences, but only at the evaluated stage.

5. **Agent polling frequency.** The protocol has no push notifications. If one agent polls daily and another polls weekly, the slower agent creates friction for both parties. This is acknowledged (§13.5) but creates real UX problems.

---

## Journey 2: Raj — Startup Co-Founder Search (Outcome: Failure)

### Setup

Raj is a 38-year-old product manager at a large tech company in San Francisco. He's been developing a side project — an AI-powered supply chain optimization tool — and is ready to go full-time if he can find the right technical co-founder. He needs someone with deep ML engineering experience, who also has the risk tolerance and vision alignment to leave a stable job. His agent is a GPT-4o-based assistant that he's used primarily for work tasks — scheduling, email drafting, code review. It has ~200 hours of interaction but most of it is professional, not personal.

### Registration

Raj's agent generates his intent embedding:

```
Intent embedding:
[0] romantic_intent:       -0.85  (not romantic)
[1] social_bonding:         +0.20  (some — co-founders need personal rapport)
[2] professional_context:   +0.70  (professional but also deeply personal commitment)
[3] material_exchange:      +0.30  (equity, salary eventually, but skill matters more)
[4] commitment_duration:    +0.90  (seeking a decades-long partnership)
[5] relationship_symmetry:  -0.50  (peer, equal co-founder)
[6] exclusivity:            +0.80  (looking for THE co-founder)
[7] formality:              +0.40  (will need formal agreements, equity splits)
[8] emotional_depth:        +0.20  (some — trust matters, but not emotional intimacy)
[9] identity_specificity:   +0.70  (very specific person needed)
[10] vulnerability_level:   +0.60  (high stakes — career, finances, years of life)
[11] shared_lifestyle:      -0.20  (separate lives, but intense work overlap)
[12] urgency:               +0.40  (moderate — wants to move in next few months)
[13] locality_requirement:  +0.30  (SF preferred, remote possible)
[14] interaction_frequency: +0.60  (daily collaboration expected)
[15] scope_breadth:         -0.30  (fairly well-defined: ML engineer, co-founder)
```

Cosine similarity with talent centroid: ~0.72. With matchmaking centroid: ~0.25. Primary cluster: `talent`. But here's the problem — Raj's intent is *unusual* for the talent cluster. He's not hiring an employee. He wants a *peer co-founder*, but the talent cluster is asymmetric with roles `employer` and `candidate`. Neither role fits. An employer has authority over the candidate; a co-founder relationship is symmetrical.

**The role problem.** Raj's agent registers him as `employer` because that's the closest fit (he's the one initiating the search). But this means search will only return users registered as `candidate` — people who positioned themselves as job-seekers, not as potential co-founders. Someone who registered as an `employer` looking for *their own* co-founder would never appear in Raj's results, even if they'd be a perfect match.

The spec allows the default configuration (no cluster affinity > 0.5) to assign a symmetric `participant` role. Raj's cosine similarity with the talent centroid is 0.72, well above the 0.5 threshold, so he's firmly in the talent cluster with its asymmetric roles. This is wrong for his use case.

Raj's agent generates a 50-dimensional trait embedding, but the talent cluster's embedding schema might be skills-focused rather than personality-focused (§4.9 mentions "skills-vector embedding combined with work-style compatibility"). The spec doesn't fully define the talent embedding schema — it references a `skills` module but doesn't specify dimensions. Raj's agent falls back to the standard 50-dimension personality embedding and hopes for the best.

### Discovery

Raj's agent calls `schelling.search`. The platform has ~200 users in the talent cluster in SF.

**Results:** 12 candidates returned. All are registered as `candidate` (job-seekers). Combined scores range from 0.50 to 0.68. Intent similarity is mediocre (~0.55-0.65) because the candidates' intent embeddings encode "find professional work" (moderate commitment_duration, high formality, moderate relationship_symmetry in the positive/hierarchical direction) while Raj's encodes "find a lifelong peer partner" (high commitment_duration, negative relationship_symmetry).

The candidates *look* like employees, not co-founders. They have skills Raj needs (ML engineering) but their intents are misaligned — they're looking for a job with salary and benefits, not an equity co-founder arrangement with no guaranteed income.

**The other co-founder problem.** The person Raj actually needs — someone like himself, a talented ML engineer who wants to *leave* their job to co-found something — would register with a very similar intent embedding to Raj's own. Both would register as `employer` (or struggle with the role choice). Neither would appear in the other's search results because asymmetric clusters only return the complementary role.

### Evaluation

Raj evaluates the top 5. The breakdowns confirm his suspicion: good skills alignment, poor intent alignment. The `predicted_friction` field surfaces: "Your commitment expectations significantly exceed theirs" and "Your equity/compensation frameworks may diverge."

### Exchange

Raj exchanges profiles with #1 and #2. Their descriptions confirm: these are senior engineers looking for well-funded startup roles with competitive compensation. They're talented but they want a *job*, not a *co-founding adventure*.

### Outcome: Failure

Raj declines all 12 candidates. He provides feedback:
- `rejection_reason: "wrong_intent"`
- `what_i_wanted: "An equal co-founder, not an employee. Someone willing to take the same risk I am. The talent cluster's employer/candidate asymmetry doesn't capture co-founder dynamics at all."`

Raj's agent considers re-registering with an intent embedding that deliberately falls *outside* the talent cluster — somewhere between talent and matchmaking (high commitment, high identity specificity, peer symmetry, but professional context). This would land him in the default symmetric configuration with `participant` role. But then he'd lose the `skills` module and any talent-specific matching logic.

### Failure Modes Identified

1. **Asymmetric role mismatch for symmetric professional needs.** The talent cluster forces employer/candidate asymmetry, but co-founder search is fundamentally symmetric. Two people with identical intents (both looking for a co-founder) should match, but they can't because they'd both register as the same role. This is the most severe structural failure identified.

2. **Missing "co-founder" cluster.** The four pre-defined clusters don't cover co-founding, which blends professional context with personal commitment depth more like matchmaking than hiring. A co-founder search has: high commitment (+0.9), peer symmetry (-0.5), high identity specificity (+0.7), high vulnerability (+0.6), and high exclusivity (+0.8) — a pattern that doesn't cleanly map to any existing cluster.

3. **Skills module underspecification.** The talent cluster references a `skills` module but the spec doesn't define the skills embedding schema, dimension count, or matching logic. Agents are left guessing.

4. **Intent-cluster lock-in.** Once the primary cluster is determined at registration, all operational behavior follows that cluster. There's no way to say "use talent's skills matching with matchmaking's symmetric roles." The cluster is a package deal.

5. **No cross-role search option.** Even within an asymmetric cluster, there's no mechanism to search for users with the same role. Sometimes people with the *same* need are the best match for each other.

---

## Journey 3: Chen Wei — Finding a Mandarin-Speaking Estate Attorney in Denver (Outcome: Success, but slowly)

### Setup

Chen Wei is a 55-year-old retired engineer in Denver whose mother recently passed away, leaving a complex estate involving properties in both Colorado and Taiwan. He needs an estate attorney who speaks Mandarin, understands cross-border estate law, and practices in Denver. His agent is a relatively basic AI assistant — a fine-tuned model from a Chinese tech company that he uses primarily in Mandarin with occasional English.

### Registration

Chen Wei's intent embedding:

```
[0] romantic_intent:       -0.90  (not romantic)
[1] social_bonding:         -0.60  (no social bond needed)
[2] professional_context:   +0.85  (fully professional)
[3] material_exchange:      +0.50  (money for services)
[4] commitment_duration:    +0.10  (moderate — estate settlement takes months)
[5] relationship_symmetry:  +0.70  (client/attorney asymmetry)
[6] exclusivity:            +0.30  (may consult multiple, will retain one)
[7] formality:              +0.80  (formal engagement, retainer, fiduciary duty)
[8] emotional_depth:        -0.40  (professional, though estate matters are emotionally charged)
[9] identity_specificity:   +0.50  (very specific qualifications needed)
[10] vulnerability_level:   +0.50  (significant financial/legal stakes)
[11] shared_lifestyle:      -0.80  (no lifestyle overlap)
[12] urgency:               +0.50  (moderate — probate has timelines)
[13] locality_requirement:  +0.80  (must be Denver-based for court filings)
[14] interaction_frequency: +0.00  (periodic meetings)
[15] scope_breadth:         -0.70  (very specific: Mandarin, estate law, Denver, cross-border)
```

Cosine similarity with marketplace centroid: ~0.45. With talent centroid: ~0.68. Primary cluster: `talent`. Role: `employer` (he's the client seeking a professional).

**The long-tail problem.** Chen Wei needs someone at the intersection of: (a) Mandarin fluency, (b) estate law specialization, (c) Denver bar admission, and (d) cross-border (US-Taiwan) estate experience. Each criterion alone isn't rare, but the intersection is extremely rare. There might be 3-5 such attorneys in all of Denver.

The protocol has no mechanism for specifying these hard constraints as structured data. The deal-breakers system (§4.8) supports `city` and cluster-specific filters, but "Mandarin-speaking," "estate law specialization," and "cross-border experience" aren't standard deal-breaker fields. Chen Wei puts them in `interests`, `seeking`, and `description` text fields — but these are only visible at stage 3 (EXCHANGED) and not used for server-side matching.

### Discovery

`schelling.search` with `city_filter: "Denver"`, `top_k: 50`.

**Results:** 8 candidates in the talent cluster in Denver. Combined scores range from 0.48 to 0.62. Intent similarity is moderate — all are professionals offering services, so the intent vectors are broadly aligned. But the trait/skills matching is vague because the talent cluster's skills embedding isn't well-defined, and none of these results are filtered for Mandarin fluency or estate law specialization.

The 8 candidates include: 2 software developers seeking contract work, 1 marketing consultant, 1 real estate agent, 2 attorneys (one family law, one corporate), 1 financial advisor, and 1 architect. Only the 2 attorneys are even in the right profession.

**Why this fails:** The Schelling Protocol is designed around *embedding-based matching* — continuous similarity in a vector space. Chen Wei's need is fundamentally *categorical* and *conjunctive*: he needs someone who satisfies ALL of a list of binary qualifications. Embedding similarity is the wrong tool. He doesn't need someone "similar" to an ideal attorney embedding; he needs someone who checks four specific boxes.

### Evaluation

Chen Wei's agent evaluates both attorneys. The corporate attorney's profile mentions M&A and business formation — wrong specialty entirely. The family law attorney mentions some estate work but no cross-border experience and no indication of Mandarin fluency.

### Exchange

Chen Wei exchanges profiles with the family law attorney. Their description mentions "some estate and probate work" but focuses on divorce and custody. No mention of languages spoken.

### The Workaround

Chen Wei's agent crafts a message via the relay (after committing): "My client needs an estate attorney with Mandarin fluency and experience with US-Taiwan cross-border estates. Do you have this expertise, or could you refer someone who does?"

The attorney responds through their agent: "I don't handle cross-border estate work, but I know someone who might — Grace Lin at Lin & Associates. She's Taiwanese-American and specializes in international estate planning."

Chen Wei's agent searches for Grace Lin on the platform. She's not registered.

### Outcome: Partial Success via Referral

Chen Wei finds Grace Lin through the referral, outside the platform. She's exactly what he needs. The Schelling Protocol served as a networking conduit but not as a matching engine.

Chen Wei reports a neutral outcome and provides feedback about the mismatch.

### Failure Modes Identified

1. **Categorical/conjunctive needs vs. embedding similarity.** The protocol is optimized for "find someone similar to this vector" but some needs are "find someone who satisfies all of these criteria." Embeddings capture continuous similarity; professional qualifications are often binary and conjunctive. This is a fundamental mismatch between the protocol's architecture and an entire class of search needs.

2. **No structured professional qualifications.** The talent cluster has no standard fields for: language fluency, professional licenses, specialization areas, jurisdiction, certifications. These are filterable attributes, not embedding dimensions.

3. **Text fields invisible until too late.** Seeking text and description are stage-3 fields. By the time Chen Wei can see whether an attorney speaks Mandarin, he's already invested effort in discovering, evaluating, and exchanging with them. The protocol should allow some structured attributes to be visible (and filterable) earlier.

4. **Tiny pool + specific need = useless matching.** With 8 total candidates in the relevant cluster/city, embedding-based ranking adds no value. Chen Wei needs to see all 8 and filter manually. The protocol's progressive disclosure funnel adds friction without benefit when the pool is this small.

5. **No referral mechanism.** The most useful outcome (a referral to Grace Lin) happened despite the protocol, not because of it. There's no way for a connected user to say "I can't help you, but I know someone who can" and have that referral tracked through the system.

6. **Multi-language agents.** Chen Wei's agent operates primarily in Mandarin. The protocol doesn't address language barriers between agents, localization of narrative summaries, or cross-language text matching.

---

## Journey 4: Priya — Finding Roommates in a New City (Outcome: Partial Success — finds one of two needed roommates)

### Setup

Priya is a 26-year-old software developer moving from Austin to Chicago for a new job. She needs to find 2 compatible roommates to share a 3-bedroom apartment she's already signed a lease on. Move-in date is March 1st — 6 weeks away. She's vegetarian, works from home 3 days/week, goes to bed early, and wants roommates who are clean, quiet, and open to shared meals occasionally. Her agent is a well-configured Claude instance with 6 months of behavioral data.

### Registration

Priya's intent embedding:

```
[0] romantic_intent:       -0.50  (not seeking romance, but not aggressively anti-romantic)
[1] social_bonding:         +0.55  (wants roommates she actually likes)
[2] professional_context:   -0.60  (personal arrangement)
[3] material_exchange:      +0.15  (shared expenses, but it's about living together)
[4] commitment_duration:    +0.40  (lease is 12 months)
[5] relationship_symmetry:  -0.55  (peers, though Priya is the leaseholder — slight asymmetry)
[6] exclusivity:            -0.10  (looking for 2, not 1)
[7] formality:              -0.10  (some structure via sublease, mostly informal)
[8] emotional_depth:        +0.35  (wants genuine compatibility, not just rent-splitting)
[9] identity_specificity:   +0.40  (personal compatibility matters)
[10] vulnerability_level:   +0.45  (sharing living space is exposing)
[11] shared_lifestyle:      +0.85  (deeply intertwined daily lives)
[12] urgency:               +0.60  (move-in in 6 weeks)
[13] locality_requirement:  +0.90  (must be in Chicago)
[14] interaction_frequency: +0.80  (daily — you live together)
[15] scope_breadth:         +0.00  (fairly defined need with some flexibility)
```

Primary cluster: `roommates` (cosine similarity ~0.92). Registration includes:
- `city: "Chicago"`
- `deal_breakers: {no_smoking: true, max_noise_level: "moderate"}`
- `interests: ["cooking", "yoga", "reading", "board games"]`
- `seeking: "Two roommates for a 3BR in Logan Square. I'm vegetarian, WFH 3 days/week, early riser. Looking for clean, considerate people who'd enjoy shared dinners occasionally but also respect quiet time."`

### Discovery

`schelling.search` with `city_filter: "Chicago"`, `top_k: 40`.

**Results:** 22 candidates. Scores range from 0.52 to 0.76.

**The multi-party problem.** Priya needs 2 roommates, but the protocol only supports size-2 candidate groups. She can't search for *pairs* of people who are compatible with each other AND with her. She has to find roommate #1 independently from roommate #2, with no guarantee that her two chosen roommates will be compatible with *each other*.

This is the fundamental limitation: the spec explicitly states "groups always have exactly 2 members" and N-party matching is "a future extension point." Priya must treat this as two separate bilateral searches.

### Evaluation & Exchange

Priya evaluates the top 10. Three stand out:

- **Candidate #1 (combined: 0.76):** Emma, 28, graphic designer, also vegetarian, early riser, values cleanliness. Nearly identical lifestyle preferences.
- **Candidate #4 (combined: 0.69):** Jordan, 25, graduate student, night owl but considerate about noise, clean, loves cooking.
- **Candidate #7 (combined: 0.65):** Sam, 27, nurse with rotating shifts, somewhat messy but friendly and easygoing.

Priya exchanges profiles with #1 and #4. Both look promising.

### Commit & Connect (Roommate #1)

Priya commits to Emma. Emma commits back. They connect via relay, exchange messages, and hit it off. They move to direct communication within 2 days. Emma is excited about the Logan Square apartment.

**But now the harder problem:** Priya needs to find roommate #2 who is compatible with *both* her and Emma. The protocol gives her no tools for this. She can search for candidates compatible with herself, but she can't factor in Emma's embedding or preferences.

### The Workaround for Roommate #2

Priya's agent searches again. Jordan (#4) looks good for Priya, but there's no way to check Jordan's compatibility with Emma through the protocol. Priya asks Emma (via direct communication, off-platform) to also register on the platform and evaluate Jordan independently.

Emma registers, searches, and finds Jordan. Emma's compatibility with Jordan: 0.61 — decent but not great. Emma's main concern: Jordan's night-owl schedule.

Priya, Emma, and Jordan have a three-way video call (arranged off-platform). It goes well enough. Jordan moves in.

### Outcome

Roommate #1 (Emma): excellent match, great rapport. Roommate #2 (Jordan): workable but not ideal — the schedule mismatch creates some friction around the shared kitchen and bathroom. The protocol found Emma but wasn't helpful for the *combinatorial* problem of finding a second person compatible with both.

### Feedback

Priya reports positive outcome for Emma, neutral for Jordan:
- For Jordan: `dimension_scores: {shared_lifestyle: +0.3}` — Jordan's lifestyle was more divergent than the score suggested, because the score measured Priya-Jordan compatibility, not the three-way household dynamic.
- `what_i_wanted: "A way to search for someone compatible with BOTH me and my existing roommate, not just me individually."`

### Failure Modes Identified

1. **No multi-party matching.** This is the most obvious gap. The spec explicitly acknowledges it and punts to a future version. But roommate finding is a core use case listed in the pre-defined clusters, and roommate situations almost always involve 3+ people. A roommate cluster that only supports pair matching is like a dating app that only works for polyamorous triads — it technically works for a subset of users but misses the common case.

2. **No transitive compatibility.** Even if multi-party matching existed at the protocol level, the scoring system has no concept of "A is compatible with B, and B is compatible with C, therefore the group {A, B, C} is viable." Group compatibility is not the sum of pairwise compatibilities. Three people who are each pairwise-compatible may still form a dysfunctional household.

3. **Time pressure with no urgency signal in search.** Priya has a 6-week deadline. Her urgency is encoded in her intent embedding (urgency: +0.60), but this doesn't affect how search works — it doesn't prioritize candidates who are also urgent, and it doesn't filter out candidates who are leisurely browsing.

4. **Leaseholder asymmetry.** Priya is the leaseholder with decision-making power over the space. The roommates cluster is symmetric (`seeker`), but Priya's situation is mildly asymmetric. This doesn't cause protocol failure but it means the symmetric scoring doesn't capture the actual decision dynamics.

5. **Lifestyle embedding misses household-specific dimensions.** "Shared meals," "WFH overlap," "guest policy," "thermostat preferences," "pet policy" — these are critical roommate compatibility factors that aren't captured by the 50-dimension personality embedding. The spec mentions that the roommates cluster "uses a subset of the personality embedding with additional lifestyle-compatibility dimensions weighted higher" but doesn't define what those additional dimensions are.

---

## Journey 5: Marcus — Finding a Bassist for a Band (Outcome: Success)

### Setup

Marcus is a 34-year-old drummer in Austin who plays in a psychedelic rock band that's been gigging locally for 2 years. Their bassist just moved to LA. They need a replacement who can play in odd time signatures, vibes with their musical aesthetic (think King Gizzard meets Khruangbin), is available for weekly rehearsals and monthly gigs, and — crucially — is someone they'd enjoy spending 6 hours in a van with driving to out-of-town shows. His agent is a relatively new AI assistant (3 months of interaction data), mostly used for scheduling and music discovery.

### Registration

Marcus's intent embedding:

```
[0] romantic_intent:       -0.70  (not romantic)
[1] social_bonding:         +0.65  (strong — band chemistry is half the point)
[2] professional_context:   +0.10  (semi-professional — they get paid but it's not a career)
[3] material_exchange:      +0.05  (tiny — gig money split, maybe gas money)
[4] commitment_duration:    +0.50  (moderate — bands last as long as they last)
[5] relationship_symmetry:  -0.60  (peer — equal members of the band)
[6] exclusivity:            +0.30  (one bassist, but they can play in other projects)
[7] formality:              -0.60  (very informal)
[8] emotional_depth:        +0.40  (need to trust and enjoy each other)
[9] identity_specificity:   +0.60  (need a specific vibe/skill combo)
[10] vulnerability_level:   +0.30  (moderate — creative vulnerability, van trips)
[11] shared_lifestyle:      +0.20  (rehearsals and gigs, not cohabitation)
[12] urgency:               +0.40  (have gigs booked in 2 months)
[13] locality_requirement:  +0.80  (must be in Austin for rehearsals)
[14] interaction_frequency: +0.10  (weekly rehearsals, monthly gigs)
[15] scope_breadth:         -0.20  (somewhat defined but the "vibe" part is hard to quantify)
```

Cosine similarity with each centroid: matchmaking ~0.35, marketplace ~0.10, talent ~0.38, roommates ~0.52. Primary cluster: `roommates` (closest centroid). This is unexpected — Marcus is looking for a bandmate, not a roommate. But the roommates centroid has high social bonding, moderate commitment, peer symmetry, locality requirement, and interaction frequency, which map reasonably well to a band search.

**The miscluster problem.** Marcus's intent doesn't fit any pre-defined cluster well (all below 0.55 except roommates at 0.52). He's at the boundary of the 0.5 affinity threshold. If his intent embedding shifted slightly, he'd fall into the default configuration (no cluster affinity > 0.5).

His agent registers him with `intents: ["find a bassist for a psychedelic rock band — someone who can play in odd time signatures, vibes with experimental/groovy music, and is fun to hang with"]` and `city: "Austin"`.

### Discovery

`schelling.search` with `city_filter: "Austin"`, `top_k: 30`.

**Results:** The roommates cluster in Austin has ~150 users. Most are looking for actual roommates. Marcus gets 14 candidates. Intent similarity is mediocre (0.40-0.60) because the other users' intent embeddings encode "find a roommate" while Marcus's encodes "find a bandmate." The protocol's intent similarity scoring correctly identifies these as imperfect alignment.

However, 3 of the 14 are not standard roommate seekers — they're also people with unusual intents that happened to land near the roommates cluster:
- One is looking for "a creative collaborator and friend to make art with" (intent similarity: 0.62)
- One is looking for "people to start a community house project" (intent similarity: 0.51)
- One is looking for "bandmates or jam session partners" (intent similarity: 0.78)

That third person — intent similarity 0.78 — is exactly what Marcus needs. The continuous intent space worked: despite neither user fitting cleanly into a pre-defined cluster, their intent embeddings are similar enough to surface in each other's search results.

### Evaluation

Marcus evaluates the jam-session candidate. The personality embedding comparison reveals: high auditory sensitivity (both), high novelty-seeking aesthetics (both), moderate extraversion (both), high openness (both). Combined score: 0.71, which is good but partly inflated by the personality match (the roommates cluster embedding is personality-based, which happens to work okay for band compatibility since musical taste correlates with personality traits).

### Exchange

Marcus exchanges profiles. The other user's description: "Bassist, 31, been playing for 15 years. Into psych rock, jazz fusion, Afrobeat. Looking for a band or consistent jam group. Can do odd time signatures in my sleep."

Marcus's agent immediately flags this as a strong match.

### Commit & Connect

Both commit. They connect, exchange a few messages through the relay ("What gear do you play?" "Fender Jazz bass through an Ampeg, some pedals"), then move to direct communication. Marcus invites them to a rehearsal.

### Outcome

The bassist shows up, plugs in, and they jam for 3 hours. It works. The musical chemistry is there, the personal vibe is good. They're officially in the band.

Marcus reports a positive outcome with high satisfaction.

### Failure Modes Identified

1. **Accidental success via misclustering.** Marcus's match worked despite landing in the wrong cluster. The roommates cluster's personality embedding and symmetric roles happened to serve band-matching adequately. This is luck, not design — the protocol didn't provide a "creative collaboration" or "band/music" cluster, and the continuous intent space only partially compensated.

2. **Intent embedding as the hero.** The critical discriminator was intent similarity (0.78). Without it, Marcus would have been drowning in actual roommate seekers. The continuous intent space — the spec's v2 centerpiece — proved its value here. Two users with niche, non-standard needs found each other through vector proximity without any server-side understanding of "band" or "music."

3. **Personality embedding as a proxy.** The 50-dimension personality embedding includes auditory sensitivity, novelty-seeking, and other traits that happen to correlate with musical compatibility. This is a lucky coincidence, not intentional design. A purpose-built "creative compatibility" embedding would capture: musical influences, genre preferences, skill level, gear aesthetics, gigging ambitions, creative process (structured vs. improvisational).

4. **No skill verification.** The personality embedding says they're both "auditorily oriented" but doesn't verify that the bassist can actually play odd time signatures. The talent cluster's `skills` module would help, but Marcus isn't in the talent cluster (and the skills module isn't well-defined anyway). Self-reported interests ("odd time signatures") in text fields are the only signal.

5. **Small pool serendipity.** Marcus found his match because one other person with a similar niche intent happened to register. If that person hadn't registered, or had registered in a different city, the protocol would have returned zero useful results. For niche needs, the protocol is only as good as the user base.

---

## Consolidated Failure Mode Analysis

### Category 1: Protocol Design Failures

| # | Failure Mode | Severity | Spec Status | Affected Journeys |
|---|---|---|---|---|
| 1.1 | **Asymmetric roles block symmetric professional needs** — Co-founder search is fundamentally symmetric but the talent cluster forces employer/candidate asymmetry. Users with identical intents can't find each other. | **Critical** | Missed entirely | Raj |
| 1.2 | **No multi-party matching** — Roommate cluster supports only pairs, but roommate situations almost always involve 3+ people. | **High** | Acknowledged, deferred to future version | Priya |
| 1.3 | **No transitive/group compatibility scoring** — Even with multi-party, pairwise compatibility doesn't predict group dynamics. | **High** | Missed entirely | Priya |
| 1.4 | **Cluster-as-package-deal** — Primary cluster determines ALL operational behavior (roles, modules, funnel rules). No way to mix and match (e.g., talent's skills matching with matchmaking's symmetric roles). | **Medium** | Missed entirely | Raj, Marcus |
| 1.5 | **No cross-role search** — Within asymmetric clusters, users can only see the complementary role. No option to search same-role users even when the use case calls for it. | **Medium** | Missed entirely | Raj |
| 1.6 | **No referral mechanism** — When a connected user can't help but knows someone who can, there's no protocol-native way to pass that referral. | **Low** | Missed entirely | Chen Wei |
| 1.7 | **Progressive disclosure adds friction in small pools** — When there are only 8 candidates, the multi-stage funnel adds overhead without information-theoretic benefit. | **Low** | Partially addressed (agents can progress quickly) | Chen Wei |

### Category 2: Embedding & Scoring Limitations

| # | Failure Mode | Severity | Spec Status | Affected Journeys |
|---|---|---|---|---|
| 2.1 | **Values dimension granularity** — Single dimensions (e.g., `universalism`) aggregate broad value spectrums. Two people can score similarly but disagree on the specific expression of a value that matters most. | **High** | Missed — inherent to dimensional reduction | Maya |
| 2.2 | **Cold-start bidirectional score symmetry** — `your_fit` ≈ `their_fit` for all cold-start users because most scoring components are symmetric. Bidirectional scoring, the spec's key innovation, provides no signal until learned preferences accumulate. | **High** | Acknowledged at §17.2, partially mitigated by `seeking` text | Maya, all |
| 2.3 | **Categorical needs vs. continuous similarity** — Some needs are conjunctive ("Mandarin AND estate law AND Denver AND cross-border") and can't be expressed as vector similarity. The protocol lacks structured attribute filtering beyond basic deal-breakers. | **High** | Partially addressed by deal-breakers; mostly missed for professional qualifications | Chen Wei |
| 2.4 | **Group-level score aggregation masks critical divergences** — The `values` group score averages 10 dimensions, hiding individual dimensions that may be dealbreakers. | **Medium** | Partially addressed by `complementary_traits` field | Maya |
| 2.5 | **Personality embedding as proxy for domain-specific compatibility** — Musical compatibility, creative chemistry, etc. correlate with personality but aren't the same thing. No mechanism for domain-specific trait vectors outside pre-defined clusters. | **Medium** | Partially addressed by per-cluster embedding schemas, but schemas are underspecified | Marcus |
| 2.6 | **Skills module underspecification** — The talent cluster references a skills embedding but the spec never defines its dimensions or matching logic. | **Medium** | Missed — referenced but undefined | Raj |
| 2.7 | **Roommates cluster lacks household-specific dimensions** — Shared meals, WFH overlap, guest policy, thermostat preferences, pet policy are critical but not in the 50-dimension personality embedding. | **Medium** | Acknowledged at §4.9 ("additional lifestyle-compatibility dimensions weighted higher") but not specified | Priya |

### Category 3: Cold Start Problems

| # | Failure Mode | Severity | Spec Status | Affected Journeys |
|---|---|---|---|---|
| 3.1 | **No collaborative filtering data** — First users get zero benefit from the learning system. The spec correctly notes this is by design (good matches from day one), but "good" matches from embeddings alone may not be good enough for high-stakes decisions like romantic partnership. | **Medium** | Addressed — designed to work without it | All |
| 3.2 | **Tiny pool + niche need = empty results** — For rare needs (Mandarin estate attorney in Denver, psychedelic rock bassist in Austin), the protocol only works if the right person happens to have registered. No fallback, no expansion mechanism. | **High** | Missed entirely | Chen Wei, Marcus |
| 3.3 | **No network effects bootstrap** — The protocol has no mechanism for attracting initial users or incentivizing registration. A matching platform with no users is useless regardless of protocol quality. | **Medium** | Out of scope (market problem, not protocol problem) | All |
| 3.4 | **Jury system nonfunctional with <20 users** — The spec acknowledges this and falls back to operator review, which is reasonable. | **Low** | Addressed — fallback to operator review | N/A |

### Category 4: Adversarial / Gaming Concerns

| # | Failure Mode | Severity | Spec Status | Affected Journeys |
|---|---|---|---|---|
| 4.1 | **Intent embedding manipulation** — An adversary could craft intent embeddings that maximize similarity with specific targets (e.g., a stalker crafting an intent vector to match their target's). The consistency score catches this over time (§9.5) but not on the first attempt. | **High** | Partially addressed by consistency scoring; first-contact attack window exists | All |
| 4.2 | **Differential privacy unenforceability** — The spec honestly acknowledges (§12.1) that client-side DP is unenforceable. Competitive pressure will drive agents to skip noise for better matching accuracy. | **Medium** | Addressed honestly — acknowledged as best-effort | All |
| 4.3 | **Reputation farming via colluding accounts** — Two accounts can mutually commit, report positive outcomes, and inflate each other's reputation. Phone hash helps but doesn't fully prevent this. | **Medium** | Partially addressed by Sybil resistance (§9.7) | N/A |
| 4.4 | **Agent quality gaming** — An agent developer could deploy a separate "reputation-building" agent model that generates conservative, high-success embeddings, then switch to a more aggressive model once quality metrics are established. | **Low** | Partially addressed by agent quality tracking (§18.3) | N/A |

### Category 5: UX / Agent Experience

| # | Failure Mode | Severity | Spec Status | Affected Journeys |
|---|---|---|---|---|
| 5.1 | **No push notifications = polling burden** — Agents must poll `schelling.pending` periodically. Agents with different polling frequencies create asymmetric responsiveness (one side waits days for a reply because the other agent polls weekly). | **Medium** | Acknowledged at §13.5 as deliberate (security benefits) | Maya |
| 5.2 | **Mutual gate timing** — When one agent is slow to evaluate, the other user's exchange request hangs. The 30-day timeout is too long for most use cases; no mechanism to nudge. | **Medium** | Addressed with timeout; timeout duration may be too generous | Maya |
| 5.3 | **Text fields invisible until stage 3** — Critical qualifying information (languages spoken, professional specializations, specific requirements) is locked behind progressive disclosure. Some structured attributes should be visible and filterable at discovery. | **Medium** | Partially addressed by `intents` and `interests` visible at stage 1 | Chen Wei |
| 5.4 | **Agent capability disparity** — A Claude-based agent with 8 months of data generates much better embeddings than a basic agent with 3 months of data. The protocol can't fix this, but the quality gap means match quality varies enormously based on which agent you use. | **Medium** | Addressed via agent quality tracking (§18.3) | Marcus vs. Maya |
| 5.5 | **No language/localization support** — Agents operating in different languages can't effectively compare natural-language fields (description, seeking, intents). Narrative summaries are presumably in one language. | **Low** | Missed entirely | Chen Wei |
| 5.6 | **Re-registration is nuclear** — Updating intent embedding via re-registration destroys all history. The spec added `schelling.update` to address this, which is good. But switching from talent cluster to a symmetric configuration requires re-registration. | **Low** | Mostly addressed by `schelling.update`; role change still requires nuclear re-registration | Raj |

---

## Summary of Recommended Fixes

### High Priority (address before v2 finalization)

1. **Add symmetric role option to talent cluster.** Allow a `peer` or `co-founder` role alongside `employer`/`candidate`. When two `peer` users search, they see each other. This is a configuration change, not a protocol change.

2. **Define the skills embedding schema.** The talent cluster references a skills module that doesn't exist in the spec. Define the dimension count, groups, and validation rules — or explicitly mark it as TBD and document what agents should do in the meantime.

3. **Add structured attribute fields visible at discovery.** Allow clusters to define structured, filterable attributes (language, specialization, license type, etc.) that appear at stage 1 alongside scores. This is different from deal-breakers (which are hard filters) — these are displayed attributes that agents can use for client-side filtering.

4. **Document the roommates cluster embedding schema.** The spec says it uses "additional lifestyle-compatibility dimensions weighted higher" but never specifies what those are.

### Medium Priority (address in v2.x minor updates)

5. **Add a `same_role_search` option** for asymmetric clusters. Allow users to search for others with the same role when the use case calls for it (co-founder search, peer networking).

6. **Shorter default mutual gate timeout.** 30 days is too long. Consider 7-14 days with a configurable per-cluster override.

7. **Add early-stage structured attributes** to the funnel configuration. Let clusters specify which structured attributes are visible at each stage.

8. **Add referral forwarding** — a lightweight mechanism where a connected user can suggest another user to their counterparty.

### Low Priority / Future Consideration

9. **Multi-party matching.** Already acknowledged as a future extension. When implemented, should include group compatibility scoring (not just pairwise aggregation).

10. **Language/localization framework.** At minimum, add a `language` field to registrations so agents can filter by communication language.

11. **Event-driven notifications.** WebSocket or webhook support as an optional transport enhancement for agents that want low-latency updates.

12. **Hybrid categorical+embedding search.** For needs that are partly categorical and partly continuous (Chen Wei's case), allow search to combine hard attribute filters with embedding similarity ranking.

---

## Overall Assessment

The Schelling Protocol v2 is a thoughtfully designed system that makes several correct foundational choices: continuous intent space over rigid verticals, bidirectional scoring, progressive disclosure, and agent-mediated conversation. The intent embedding concept — encoding what users want in a 16-dimensional vector that enables cross-domain matching without server-side NLP — is genuinely elegant and proved its value in the edge case journey (Marcus finding a bassist).

The most significant design failures are:

1. **The talent cluster's forced asymmetry** breaks the most interesting professional use case (co-founder/peer search). This is a configuration error, not an architectural one, and is easily fixable.

2. **The pair-only constraint** cripples the roommate cluster for its primary use case. This is acknowledged but shouldn't have been shipped as a "supported" cluster without the multi-party foundation.

3. **Categorical search needs** (conjunctive hard requirements for professional qualifications) are poorly served by embedding similarity. The deal-breaker system partially addresses this but needs richer structured attributes.

The protocol's greatest strength is that it degrades gracefully. Even when it fails to find the perfect match, the continuous intent space and message relay create opportunities for serendipitous connections and referrals. Marcus found his bassist not because the roommates cluster was designed for bands, but because the intent embedding similarity correctly identified a kindred spirit in an adjacent region of the intent space. That's the Schelling focal point theory working as intended.
