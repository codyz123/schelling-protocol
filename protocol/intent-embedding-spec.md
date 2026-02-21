# Schelling Protocol -- Intent Embedding Specification v1.0

## Overview

The Schelling intent embedding is a 16-dimensional vector. Each dimension is a float in the range [-1.0, +1.0], where the extremes represent the far ends of a bipolar scale describing what a user is looking for. A score of 0.0 represents the midpoint — neither extreme applies, or the user's goal is genuinely neutral on that axis.

The intent embedding encodes **what the user wants to find or accomplish** — not who the user is. It is the complement to the 50-dimensional personality embedding (which encodes who the user is). Two users with identical personality embeddings but different intent embeddings are looking for different things. Two users with identical intent embeddings but different personality embeddings want the same thing but are different people.

The intent space must encode the full range of human coordination goals: romantic partnership, friendship, buying and selling goods, hiring and collaborating, shared living, casual social connection, mentorship, creative partnership, and everything in between. The 16 dimensions are chosen to be maximally discriminating across this space while remaining orthogonal enough that each dimension carries independent signal.

The server computes cosine similarity on intent embeddings exactly as it does on personality embeddings. No NLP, no text understanding, and no semantic parsing is required server-side. All semantic interpretation — understanding what the user actually wants and encoding it into 16 floats — lives in the agent.

---

# Dimension Reference

---

## Category: Relationship Nature (indices 0--3)

These dimensions encode the fundamental type of connection the user is seeking. They answer the question: "What kind of relationship is this?"

---

## 0. romantic_intent

### -1.0 -- Explicitly non-romantic

The user has zero romantic interest in the people they are trying to find. Romance is not merely absent — it would be unwelcome or inappropriate. This includes hiring a contractor, selling furniture, finding a study partner, or seeking professional mentorship. If the matched person expressed romantic interest, it would be a mismatch, not a bonus. The connection is valued entirely for its functional, social, or professional purpose.

### 0.0 -- Romance-neutral

The user is not specifically seeking romance but would not rule it out if it emerged organically. This includes goals like "find interesting people to hang out with" or "expand my social circle" where romantic connection is neither the point nor off the table. The user would evaluate a romantic development on its merits rather than treating it as either the goal or a violation.

### +1.0 -- Seeking romantic partnership

The user's primary goal is finding a romantic partner. The connection is valued specifically for its romantic potential — emotional chemistry, physical attraction, and the possibility of a love relationship are central criteria. This includes "find me a soulmate," "find me a husband," "I want to start dating again," and "find someone I could fall in love with." Success means finding someone they want to be in a romantic relationship with.

### Calibration notes

Look for explicit romantic language: "partner," "date," "relationship," "love," "soulmate," "husband," "wife." Score +0.7 or higher when romance is the stated or clearly implied goal. Score -0.7 or lower when the context makes romance inappropriate or unwanted (professional hiring, goods exchange, purely functional needs). The midrange (-0.3 to +0.3) is for genuinely open-ended social goals where romance is neither sought nor excluded.

---

## 1. social_bonding

### -1.0 -- No social bond sought

The user wants to accomplish a transaction or task and has no interest in forming a social connection with the other party. The relationship is purely instrumental: once the couch is sold, the freelancer delivers the design, or the service is rendered, there is nothing more to discuss. The other person's personality, values, and interests are irrelevant beyond their ability to complete the exchange. An ideal interaction is efficient, professional, and does not extend one minute beyond what is necessary.

### 0.0 -- Moderate social interest

The user would appreciate a pleasant interaction and is mildly interested in the other person beyond the immediate task, but social bonding is not the primary motivation. A friendly freelancer is better than a cold one, but friendliness is not a selection criterion. Corresponds to goals where social compatibility is a nice-to-have: finding a reliable handyman, joining a casual sports league, or attending a networking event.

### +1.0 -- Deep social connection sought

The user is specifically looking for friendship, companionship, or social belonging. The relationship's value lies in the human connection itself — shared experiences, mutual understanding, enjoyment of each other's company. This includes "find me friends," "I'm new in town and want to meet people," "find a community of people who share my interests," and the social dimension of "find a roommate who could also be a friend." The other person's personality and compatibility matter as much as or more than any functional role they fill.

### Calibration notes

Score based on whether the user would want to continue interacting with the matched person after any functional purpose is served. -0.7 or lower: no ongoing relationship desired. +0.7 or higher: the social relationship IS the purpose. Watch for language like "friend," "community," "hang out," "connect with," "meet people." Also watch for compound intents: a user seeking a "roommate who could be a friend" has social_bonding around +0.5 to +0.6, not +1.0.

---

## 2. professional_context

### -1.0 -- Entirely personal or informal

The connection exists wholly outside any professional framework. There are no deliverables, no compensation, no professional standards, and no work product expected. This includes seeking a romantic partner, selling personal belongings, finding friends, or looking for a hiking buddy. The interaction would feel strange if conducted with professional formality — a cover letter to find a drinking buddy would be absurd.

### 0.0 -- Mixed personal and professional

The connection blends personal and professional elements. A creative collaborator may need professional skill but the relationship is driven by shared passion rather than a paycheck. A mentor may be found through professional networks but the relationship involves personal growth. "Find someone to co-found a startup with" lives here — it is professional in substance but personal in the depth of commitment and trust required.

### +1.0 -- Fully professional

The connection is defined by professional norms, expectations, and structures. Compensation is expected, deliverables are specified, and the relationship is governed by professional standards or contracts. This includes hiring a freelancer, finding an employee, engaging a consultant, or seeking a business partner with a formal arrangement. Success is measured in work product, reliability, and professional competence.

### Calibration notes

The key signal is whether the user expects to pay or be paid, and whether professional standards govern the interaction. Score +0.7 or higher when money changes hands for services, when job titles or credentials matter, or when the user describes the need in terms of deliverables and qualifications. Score -0.7 or lower when the connection is personal, casual, or social. The midrange captures collaborations where passion and skill blend: creative partnerships, hobby-turned-business, co-founding.

---

## 3. material_exchange

### -1.0 -- Purely intangible

Nothing physical or monetary changes hands. The value of the connection is entirely in the experience, knowledge, relationship, or personal growth it provides. "Find me a soulmate," "find someone to practice Spanish with," "find a friend who shares my love of philosophy" — these produce value through human connection and shared experience, not through goods or currency.

### 0.0 -- Mixed tangible and intangible

The connection involves some material component alongside intangible value. A roommate arrangement involves financial exchange (rent) but also requires personal compatibility. A creative collaborator may eventually produce sellable work but the collaboration is driven by shared creative vision. The material element is present but is not the primary purpose or organizing principle of the connection.

### +1.0 -- Primarily tangible exchange

The connection exists to exchange physical goods, money, or paid services. "Sell my couch," "find someone to buy my car," "hire a house painter," "find a dog walker" — the value is in the tangible deliverable. The relationship is organized around the exchange: pricing, condition, delivery logistics, and payment terms are the relevant variables. Personal chemistry between parties is irrelevant as long as the exchange is completed satisfactorily.

### Calibration notes

Ask: does this intent involve a price? If yes, score +0.5 or higher. Does it involve physical goods changing hands? +0.7 or higher. Is the user describing an item or service with specifications (size, condition, budget)? +0.8 or higher. Score -0.7 or lower when the intent is purely relational — no goods, no money, no services. The midrange captures arrangements with material and relational components: roommate situations, co-working arrangements, barter relationships.

---

## Category: Commitment & Structure (indices 4--7)

These dimensions encode the shape and weight of the relationship the user is seeking. They answer the question: "How serious, structured, and enduring is this?"

---

## 4. commitment_duration

### -1.0 -- One-time or ephemeral

The interaction is expected to happen once and end. "Sell my couch" — once the couch is sold, the relationship is complete. "Find someone to help me move this Saturday" — the need expires on Sunday. There is no expectation of a recurring relationship, no follow-up, and no ongoing obligation. The interaction is a point in time, not a line extending into the future.

### 0.0 -- Moderate-term, open-ended

The connection has some expected duration but is not intended to be permanent. A semester-long study partner, a freelance contract lasting a few months, a friend of convenience in a city you will eventually leave. The user expects some continuity but would not be devastated if the relationship ended naturally. There is a soft expiration date, even if it is not explicit.

### +1.0 -- Permanent or lifelong

The user is seeking a connection intended to last indefinitely. "Find me a life partner," "find a best friend," "find a business co-founder I'll work with for decades." The user is willing to invest significant time in finding the right person because the expected duration justifies the search cost. The wrong match is not just inconvenient — it represents a meaningful life mistake. Permanence is a feature, not a constraint.

### Calibration notes

The clearest signal is explicit time language: "forever," "life partner," "long-term" → +0.7 or higher. "One-time," "quick," "just need someone for [specific event]" → -0.7 or lower. For intents without explicit duration, infer from the nature of the goal: selling an item is inherently one-time (-0.8); seeking a romantic partner implies long-term (+0.7 to +0.9); seeking a freelancer is moderate-term (-0.1 to +0.3). Be cautious: "find a roommate" is moderate (+0.3 to +0.5), not permanent — leases end.

---

## 5. relationship_symmetry

### -1.0 -- Peer-to-peer, fully equal

The user seeks someone who occupies the same role they do. Neither party is above the other, neither is serving the other, and neither is paying the other for services. Romantic partners, friends, co-founders with equal equity, fellow hobbyists, study partners, creative collaborators with equal creative authority — these are symmetrical relationships where both parties bring comparable standing and expect comparable treatment.

### 0.0 -- Partially asymmetric

The relationship has some structural asymmetry but is not a pure service or hierarchical arrangement. A mentorship is asymmetric in knowledge but mutual in respect. A roommate arrangement where one person owns the apartment and the other rents creates a mild asymmetry. A buyer and seller of a high-value item (a car, a home) have temporarily complementary roles but negotiate as relative equals.

### +1.0 -- Hierarchical or service relationship

One party clearly serves, reports to, or provides a service to the other. The user is either hiring someone (employer/client) or seeking to be hired (candidate/freelancer). There is a defined authority gradient: one party sets the terms, evaluates performance, and controls continuation. "Hire a designer," "find a babysitter," "find a personal trainer," "find a cleaning service" — these are relationships organized around one party providing a service to the other.

### Calibration notes

Look for role language: "hire," "employ," "find someone to do X for me" → +0.6 to +0.9 (depending on power differential). "Find a partner," "find a friend," "find someone to do X with me" → -0.6 to -0.9. The prepositions matter: "for me" implies asymmetry; "with me" implies symmetry. A user saying "find a co-founder" scores around -0.5 to -0.7 (peer); "find a CTO for my company" scores around +0.4 (partially asymmetric — they are the founder, the CTO reports to them).

---

## 6. exclusivity

### -1.0 -- Non-exclusive, open

The user is not seeking a dedicated or exclusive relationship with one person. They may want to find multiple people simultaneously who serve similar purposes: several potential buyers for their couch, multiple freelancers to compare bids, a group of friends rather than one best friend. Finding one good match does not end the search. "Sell my couch" is non-exclusive — sell to the first good buyer. "Find friends" is non-exclusive — more friends is better.

### 0.0 -- Moderately exclusive

The user would ideally find one or a few matches but is not rigidly committed to exclusivity. A freelancer might work with one client at a time on a project but is not exclusively contracted. A user seeking a roommate wants one (or a small number), and finding the right one ends the search, but the relationship itself does not preclude other social connections.

### +1.0 -- Exclusive, monogamous, or dedicated

The user seeks a single, exclusive connection. Finding the right match means committing to that person and ending the search. This is most obvious in romantic contexts ("find me a monogamous partner") but also applies in professional ones ("find THE co-founder," "find my one perfect wedding photographer"). The relationship, once established, is expected to be dedicated — divided attention would dilute or violate its purpose.

### Calibration notes

Romantic intent with language of commitment strongly suggests high exclusivity (+0.7 to +0.9). Marketplace transactions are typically non-exclusive (-0.4 to -0.7) — the seller doesn't care which buyer they sell to. Professional hiring can go either way: hiring one full-time employee is exclusive (+0.5); collecting freelancer bids is non-exclusive (-0.3). Social goals vary: "find a best friend" is moderately exclusive (+0.3); "find a community" is non-exclusive (-0.3).

---

## 7. formality

### -1.0 -- Casual and unstructured

The connection operates without formal agreements, contracts, or defined terms. There is no written understanding, no payment schedule, no service-level agreement, and no recourse mechanism beyond social norms. Friendships, casual dating, finding a hiking buddy, finding someone to jam with — these relationships are governed by mutual goodwill and social norms, not by paperwork or formal obligations.

### 0.0 -- Semi-structured

Some structure exists but it is not fully formalized. A roommate arrangement may have a lease but the interpersonal aspect is informal. A recurring freelance relationship may have verbal agreements about rates and timelines without a formal contract. The user expects some reliability and structure but does not require legal or contractual backing.

### +1.0 -- Formal and contractual

The connection is governed by explicit terms, contracts, or institutional frameworks. Employment agreements, purchase contracts, service-level agreements, formal partnerships with defined equity splits. The user expects written terms, clear deliverables, defined payment, and legal recourse if terms are not met. "Hire a contractor to renovate my kitchen" — this involves permits, contracts, insurance, and formal project management.

### Calibration notes

Score based on whether the user would expect a written agreement. "Find a friend" → -0.8. "Sell my couch on Craigslist" → -0.2 (informal transaction, maybe a receipt). "Hire a freelance designer" → +0.4 (contract, defined scope). "Hire a full-time employee" → +0.7 (employment agreement, benefits, legal framework). "Find a wedding venue" → +0.6 (contract, deposit, cancellation terms). The key question: would a lawyer plausibly be involved? If yes, score +0.5 or higher.

---

## Category: Personal Depth (indices 8--11)

These dimensions encode how personally invested the user needs to be in the matched person — how much the match depends on who someone is rather than what they can do. They answer: "How much does the person matter versus the function?"

---

## 8. emotional_depth

### -1.0 -- Purely functional

The user cares about what the other person can deliver, not who they are as a human being. Personality, values, emotional resonance — none of it matters as long as the couch is delivered, the code is written, or the lawn is mowed. Interactions should be efficient and task-focused. Small talk is tolerated but adds no value. The ideal match is competent, reliable, and not interested in becoming friends either.

### 0.0 -- Moderate emotional engagement

The user values some interpersonal warmth but it is not the point. A friendly freelancer is preferable to a hostile one; a study partner who is pleasant to be around makes the sessions more productive. Emotional connection is a quality-of-life factor, not a selection criterion. The user would not choose a less qualified match because they "clicked" emotionally, but all else being equal, warmth tips the scale.

### +1.0 -- Deep emotional connection required

The user is seeking someone with whom they can share vulnerability, trust, and genuine emotional intimacy. The value of the connection is inseparable from the emotional bond between the people involved. "Find me a soulmate," "find a best friend I can really talk to," "find a therapist I truly connect with" — these require not just functional compatibility but genuine emotional resonance. The matched person's inner world — their values, fears, joys, and way of being — matters as much as anything they can do.

### Calibration notes

Romantic intents almost always score +0.6 or higher. Marketplace transactions almost always score -0.6 or lower. The critical distinction in the middle range: would the user describe the ideal match in terms of personal qualities (kind, thoughtful, funny) or in terms of capabilities (skilled, fast, affordable)? Personal-quality language → higher. Capability language → lower. "Find a roommate" scores around +0.2 to +0.4; "find a roommate who could be a friend" scores +0.5 to +0.6.

---

## 9. identity_specificity

### -1.0 -- Any qualified person

The user needs someone who meets a set of functional criteria; beyond that, one qualified person is interchangeable with another. "Sell my couch" — any buyer with the money will do. "Find a plumber" — any licensed plumber in the area is fine. The matched person's unique identity — their specific personality, background, story — is irrelevant to the match quality. A different qualified person would produce the same outcome.

### 0.0 -- Some individual preference

The user has some preference for specific individual qualities beyond raw qualifications, but the match is not primarily about finding a unique person. A freelance designer with a portfolio the user likes is preferred over a generic one, but there are likely many acceptable matches. The user is selecting from a category of people with additional preference filters, not searching for a needle in a haystack.

### +1.0 -- Unique individual match required

The user is searching for a specific kind of person whose individual characteristics — personality, values, sensibility, life experience — are the primary matching criteria. "Find my soulmate" — there may be very few people in the world who are the right match. "Find a co-founder who shares my exact vision" — the match depends on a rare alignment of individual qualities. Swapping in a different person with similar qualifications would fundamentally change the outcome. The match is about THIS person, not a person like this.

### Calibration notes

The key question: how many people in the world could satisfy this intent? If thousands → score -0.5 or lower. If dozens → score around 0.0. If potentially only a handful → score +0.5 or higher. Romantic partnership is typically +0.7 to +0.9 (high identity specificity). Hiring a plumber is typically -0.7 to -0.9 (low). Finding a creative collaborator might be +0.3 to +0.5 (moderate — you need someone whose creative sensibility aligns with yours specifically).

---

## 10. vulnerability_level

### -1.0 -- Low stakes, low vulnerability

A bad match has minimal consequences. If the couch buyer flakes, list it again. If the freelancer underperforms, hire someone else. The user is not emotionally exposed, financially endangered, or personally at risk through this interaction. The worst case is mild inconvenience or wasted time. The user can walk away at any point with negligible cost.

### 0.0 -- Moderate stakes

A bad match is unpleasant but recoverable. A mismatched roommate means an awkward few months before the lease ends. A poorly chosen freelancer costs time and money to replace. The user has some skin in the game — enough to justify careful selection but not so much that a mistake is devastating.

### +1.0 -- High stakes, high vulnerability

A bad match has significant emotional, financial, or life consequences. Choosing the wrong romantic partner means heartbreak. Choosing the wrong business co-founder can destroy years of work. Choosing the wrong caregiver for a child puts a vulnerable person at risk. The user is exposing themselves — their heart, their finances, their safety, their future — and the cost of a bad match is severe and potentially irreversible.

### Calibration notes

Consider what the user stands to lose. Time only → -0.5 or lower. Time and money → around 0.0. Emotional well-being, safety, or major life trajectory → +0.5 or higher. Romantic intents: +0.6 to +0.9 (emotional vulnerability). Marketplace: -0.3 to -0.7 (financial risk but usually bounded). Hiring: +0.1 to +0.4 (depends on role importance). Roommates: +0.3 to +0.5 (sharing living space creates physical and emotional exposure). Childcare: +0.8 to +0.9.

---

## 11. shared_lifestyle

### -1.0 -- Fully independent lifestyles

The user and the matched person will have no overlap in daily life. They interact for a specific purpose and then return to completely separate existences. A one-time buyer, a remote freelancer in another timezone, a pen pal — their daily routines, living spaces, and physical worlds do not intersect. Lifestyle compatibility is irrelevant because their lifestyles never touch.

### 0.0 -- Moderate lifestyle overlap

The user and the matched person will share some aspects of daily life but not all. Colleagues who work together but live separately. Friends who see each other weekly. A creative collaborator who comes over to work on projects. There is enough overlap that lifestyle compatibility matters somewhat — similar schedules, compatible energy levels, aligned expectations about noise or cleanliness — but each person maintains a separate primary living environment and daily routine.

### +1.0 -- Deeply intertwined daily lives

The user and the matched person will share physical space, daily routines, and intimate aspects of everyday life. Romantic partners who cohabitate. Roommates. A live-in caregiver. Lifestyle compatibility is critical: sleep schedules, cleanliness standards, noise tolerance, cooking habits, guest policies, and a hundred other daily-life details become relevant compatibility factors. A mismatch on lifestyle is experienced every single day.

### Calibration notes

Ask: will these people share a kitchen? If yes, score +0.6 or higher. Will they share a bed? +0.8 or higher. Will they never meet in person? -0.7 or lower. Will they see each other daily? +0.3 to +0.5 depending on whether it is in a shared living space or a shared workplace. Remote professional relationships: -0.5 to -0.7. Roommates: +0.7 to +0.9. Romantic partners (assuming cohabitation intent): +0.8 to +0.9. "Find a friend" depends heavily on context: local friends with frequent hangouts score around +0.1 to +0.2; online friends score -0.3 to -0.5.

---

## Category: Logistics & Context (indices 12--15)

These dimensions encode the practical parameters of the search: how urgently the user needs a match, where the match must be, how often they will interact, and how well-defined the need is. They answer: "What are the constraints and parameters?"

---

## 12. urgency

### -1.0 -- Patient, open-ended search

The user is in no rush. They would rather wait months or years for an excellent match than settle for a mediocre one quickly. "I'm in no hurry — I want to find the right person." This is typical of high-stakes, identity-specific searches: finding a life partner, finding a best friend, finding a co-founder. The cost of a bad match exceeds the cost of waiting. The user will reject many candidates and search for as long as it takes.

### 0.0 -- Moderate timeline

The user has some time pressure but is not desperate. A few weeks to a few months is the expected search window. "I'd like to find a roommate before my lease starts in two months." "I need a freelancer for a project starting next quarter." The user balances quality against timeline and will make reasonable compromises to hit the deadline without accepting a clearly bad match.

### +1.0 -- Urgent, time-sensitive

The user needs a match soon — days, not months. "My roommate just moved out and rent is due." "I need to sell this couch before I move next weekend." "I need a plumber today — my basement is flooding." Speed dominates quality in the priority stack. The user will accept a good-enough match over a perfect one if the good-enough match is available now. Every day without a match has a tangible cost.

### Calibration notes

Look for temporal language: "ASAP," "this week," "before [imminent date]" → +0.6 to +0.9. "Whenever," "no rush," "taking my time" → -0.6 to -0.9. When no explicit timeline is given, infer from intent type: selling low-value items implies moderate-to-high urgency (+0.3 to +0.6); seeking a life partner implies low urgency (-0.4 to -0.7); seeking a freelancer implies moderate urgency (+0.1 to +0.3). Emergency services (plumber, locksmith) are maximally urgent (+0.9).

---

## 13. locality_requirement

### -1.0 -- Fully remote or digital

Physical proximity is completely irrelevant. The interaction can happen entirely online, by phone, or through digital channels. "Find someone to practice Spanish with over video calls." "Find a remote freelance developer." "Find an online chess partner." The matched person could be on another continent and the match quality would be unaffected. Geography is a non-factor.

### 0.0 -- Flexible on location

The user would prefer local but can work with remote, or vice versa. "Find a creative collaborator — ideally local so we can meet, but remote could work." The user would give a small preference boost to someone nearby but would not reject an otherwise-excellent match because of distance.

### +1.0 -- Must be local or in-person

Physical proximity is a hard requirement. The interaction requires being in the same place. "Sell my couch" — someone must come pick it up. "Find a roommate" — they must live in the same apartment. "Find a personal trainer" — they must be at the same gym. "Find someone to play pickup basketball with" — they must be in the same city. A remote match, no matter how otherwise compatible, is worthless.

### Calibration notes

Ask: could this interaction happen entirely over the internet? If yes, score -0.6 or lower. If no, score +0.6 or higher. Physical goods exchange: +0.7 to +0.9 (someone must pick up the couch). Roommates: +0.9 (definitionally local). Local services: +0.8 to +0.9. Romantic relationships: variable — "find a soulmate anywhere in the world" scores around -0.1 to +0.2; "find someone to date in my city" scores +0.5 to +0.7. Knowledge work: -0.4 to -0.7 (usually remote-capable). Online communities: -0.8 to -0.9.

---

## 14. interaction_frequency

### -1.0 -- One-time or very rare

The user expects to interact with the matched person once, or at most a few times. "Sell my couch" — one meeting to exchange goods and money. "Hire someone to fix my fence" — one project, then done. "Find a wedding photographer" — one event. There is no ongoing relationship after the initial purpose is served. Recurring interaction is neither expected nor desired.

### 0.0 -- Periodic or moderate

The user expects to interact regularly but not constantly. Weekly meetups, monthly check-ins, occasional collaboration sessions. "Find a tennis partner" — they play once a week. "Find a freelancer for ongoing projects" — work comes in waves. The relationship has rhythm but also has gaps, and the gaps are normal, not failures.

### +1.0 -- Continuous or daily

The user expects near-constant interaction with the matched person. Romantic partners who cohabitate see each other every day. Roommates share space daily. A full-time employee interacts with their employer every workday. The relationship is woven into the fabric of daily life, not an occasional event. Missing a day feels like an anomaly, not the default.

### Calibration notes

Ask: how often will these people interact in a typical week? Less than once → -0.5 to -0.9. Once or twice → -0.1 to +0.1. Several times → +0.2 to +0.4. Daily → +0.6 to +0.9. One-time transactions (selling items, one-off services) always score -0.7 or lower. Romantic partners with cohabitation intent: +0.8 to +0.9. Roommates: +0.7 to +0.8. Full-time employment: +0.6 to +0.7. Weekly hobby partners: -0.1 to +0.1. Online pen pals: -0.3 to -0.5.

---

## 15. scope_breadth

### -1.0 -- Narrow, specific need

The user knows exactly what they want and can describe it precisely. "Sell my mid-century modern walnut coffee table, $200 OBO." "Hire a React developer with 5+ years experience for a 3-month contract." "Find a licensed electrician to install a ceiling fan." The need is well-defined, the criteria are concrete, and an ideal match is objectively identifiable. The user is not exploring — they are executing a search with known parameters.

### 0.0 -- Moderately defined

The user has a general sense of what they want but is open to refining it. "Find a roommate — I know I want someone clean and quiet but I'm flexible on everything else." "Find a freelance designer — I'll know the right style when I see it." The user can describe some criteria but acknowledges that the best match might surprise them. Some exploration is welcome within a defined neighborhood of intent.

### +1.0 -- Broad, exploratory

The user is not sure what they want and is searching to discover it. "I'm new in town and just want to meet interesting people." "I'm bored with my routine and want to try something new." "I don't know what I'm looking for — I just feel like something is missing." The search itself is a process of self-discovery. Criteria will emerge from experience rather than being specified upfront. The user is open to unexpected matches and may redefine their intent as they encounter candidates.

### Calibration notes

The clearest signal is the specificity of the user's language. Concrete nouns, numbers, and specifications → -0.6 or lower. Vague, emotional, or process-oriented language → +0.6 or higher. "I want a 2BR apartment with a roommate who doesn't smoke" is narrow (-0.5). "I want to find my people" is broad (+0.6). "I'm just exploring" is very broad (+0.8). Note that scope_breadth is independent of commitment — a user can be broadly exploring for a permanent life partner (+0.4 scope, +0.9 commitment) or narrowly searching for a one-time service (-0.7 scope, -0.8 commitment).

---

# Pre-defined Cluster Centroids

The protocol ships with four pre-defined cluster centroids corresponding to the original verticals. Each centroid is a 16-dimensional vector in the intent embedding space. A user's proximity to each centroid (measured by cosine similarity) determines which cluster configurations apply.

These centroids are part of the protocol specification and MUST be identical across all conforming implementations.

---

## Matchmaking

**Intent archetype:** "Find a romantic life partner."

```
[+0.85, +0.60, -0.80, -0.70, +0.80, -0.60, +0.80, -0.20, +0.85, +0.80, +0.75, +0.60, -0.40, +0.20, +0.80, +0.20]
```

| Index | Dimension | Value | Rationale |
|---|---|---|---|
| 0 | romantic_intent | +0.85 | Primary goal is romance. |
| 1 | social_bonding | +0.60 | Strong social connection, but romance is the leading frame. |
| 2 | professional_context | -0.80 | Entirely personal. |
| 3 | material_exchange | -0.70 | No goods or money exchanged. |
| 4 | commitment_duration | +0.80 | Seeking a long-term or permanent partner. |
| 5 | relationship_symmetry | -0.60 | Peer-to-peer relationship between equals. |
| 6 | exclusivity | +0.80 | Monogamous, exclusive partnership. |
| 7 | formality | -0.20 | Informal relationship, though with serious intent. |
| 8 | emotional_depth | +0.85 | Deep emotional connection is essential. |
| 9 | identity_specificity | +0.80 | Seeking a unique individual, not a category. |
| 10 | vulnerability_level | +0.75 | High emotional stakes. |
| 11 | shared_lifestyle | +0.60 | Expects eventual cohabitation but not immediate. |
| 12 | urgency | -0.40 | Patient search — quality over speed. |
| 13 | locality_requirement | +0.20 | Mild local preference, but open. |
| 14 | interaction_frequency | +0.80 | Expects daily interaction once matched. |
| 15 | scope_breadth | +0.20 | Knows they want romance, somewhat open on details. |

---

## Marketplace

**Intent archetype:** "Buy or sell a physical item."

```
[-0.90, -0.80, -0.20, +0.90, -0.85, +0.50, -0.40, +0.40, -0.85, -0.85, -0.40, -0.85, +0.60, +0.70, -0.80, -0.70]
```

| Index | Dimension | Value | Rationale |
|---|---|---|---|
| 0 | romantic_intent | -0.90 | Not romantic. |
| 1 | social_bonding | -0.80 | No social connection sought. |
| 2 | professional_context | -0.20 | Not really professional — personal item exchange. |
| 3 | material_exchange | +0.90 | Primarily about physical goods and money. |
| 4 | commitment_duration | -0.85 | One-time transaction. |
| 5 | relationship_symmetry | +0.50 | Buyer/seller asymmetry. |
| 6 | exclusivity | -0.40 | Will sell to whoever shows up first. |
| 7 | formality | +0.40 | Some structure (pricing, condition) but no contracts. |
| 8 | emotional_depth | -0.85 | Purely functional. |
| 9 | identity_specificity | -0.85 | Any qualified buyer/seller. |
| 10 | vulnerability_level | -0.40 | Low stakes — bounded financial risk. |
| 11 | shared_lifestyle | -0.85 | No lifestyle overlap. |
| 12 | urgency | +0.60 | Moderate-to-high — want to complete the transaction. |
| 13 | locality_requirement | +0.70 | Usually need local pickup/delivery. |
| 14 | interaction_frequency | -0.80 | One-time meeting. |
| 15 | scope_breadth | -0.70 | Specific item, specific need. |

---

## Talent

**Intent archetype:** "Hire a skilled professional or find professional work."

```
[-0.85, -0.40, +0.90, +0.40, +0.30, +0.65, -0.20, +0.70, -0.60, -0.30, +0.30, -0.60, +0.30, -0.40, +0.30, -0.40]
```

| Index | Dimension | Value | Rationale |
|---|---|---|---|
| 0 | romantic_intent | -0.85 | Not romantic. |
| 1 | social_bonding | -0.40 | Mild — pleasant working relationship preferred. |
| 2 | professional_context | +0.90 | Fully professional. |
| 3 | material_exchange | +0.40 | Money changes hands (salary/fees), but skill matters more. |
| 4 | commitment_duration | +0.30 | Moderate — project or employment term. |
| 5 | relationship_symmetry | +0.65 | Employer/client has authority over scope and evaluation. |
| 6 | exclusivity | -0.20 | Depends on role — slightly non-exclusive (may evaluate multiple). |
| 7 | formality | +0.70 | Contracts, deliverables, professional standards. |
| 8 | emotional_depth | -0.60 | Professional, not personal. |
| 9 | identity_specificity | -0.30 | Skills matter more than the specific person. |
| 10 | vulnerability_level | +0.30 | Moderate — bad hire costs time and money. |
| 11 | shared_lifestyle | -0.60 | Separate personal lives. |
| 12 | urgency | +0.30 | Moderate — hiring has timelines. |
| 13 | locality_requirement | -0.40 | Often remote-capable. |
| 14 | interaction_frequency | +0.30 | Regular during engagement. |
| 15 | scope_breadth | -0.40 | Defined role or project scope. |

**Peer role guidance.** The talent cluster supports a `peer` role for symmetric professional matching (co-founder search, creative partnerships, peer collaborations). When generating intent embeddings for peer-role users, agents should note that the centroid above represents the *asymmetric* hiring archetype. Peer intents typically differ on key dimensions:

| Dimension | Hiring centroid | Typical peer/co-founder |
|---|---|---|
| `relationship_symmetry` (5) | +0.65 (hierarchical) | -0.50 to -0.70 (peer-to-peer) |
| `commitment_duration` (4) | +0.30 (moderate) | +0.70 to +0.90 (long-term partnership) |
| `social_bonding` (1) | -0.40 (mild) | +0.20 to +0.40 (personal rapport matters) |
| `vulnerability_level` (10) | +0.30 (moderate) | +0.50 to +0.70 (high stakes) |
| `exclusivity` (6) | -0.20 (non-exclusive) | +0.50 to +0.80 (seeking THE partner) |
| `identity_specificity` (9) | -0.30 (skills > person) | +0.50 to +0.70 (specific individual needed) |

A co-founder intent embedding will still have high `professional_context` and will land near the talent centroid (cosine similarity typically 0.55–0.75), placing it firmly in the talent cluster. The `peer` role ensures these users match with each other rather than with employer/candidate users.

---

## Roommates

**Intent archetype:** "Find someone to share a living space with."

```
[-0.40, +0.50, -0.60, +0.10, +0.50, -0.60, -0.10, -0.20, +0.30, +0.30, +0.40, +0.85, +0.30, +0.90, +0.80, +0.10]
```

| Index | Dimension | Value | Rationale |
|---|---|---|---|
| 0 | romantic_intent | -0.40 | Not seeking romance, but less emphatically non-romantic than marketplace. |
| 1 | social_bonding | +0.50 | Social compatibility matters — you live with this person. |
| 2 | professional_context | -0.60 | Personal arrangement. |
| 3 | material_exchange | +0.10 | Shared expenses, but the arrangement is about living together. |
| 4 | commitment_duration | +0.50 | Moderate — lease terms, typically months to a year. |
| 5 | relationship_symmetry | -0.60 | Peer-to-peer — fellow tenants. |
| 6 | exclusivity | -0.10 | Looking for one roommate but the relationship itself is not exclusive. |
| 7 | formality | -0.20 | Some structure (lease) but primarily informal. |
| 8 | emotional_depth | +0.30 | Some personal connection — you share a home. |
| 9 | identity_specificity | +0.30 | Personal compatibility matters more than for transactions. |
| 10 | vulnerability_level | +0.40 | Moderate-high — sharing living space is inherently exposing. |
| 11 | shared_lifestyle | +0.85 | Deeply intertwined daily lives — shared kitchen, bathroom, schedule. |
| 12 | urgency | +0.30 | Moderate — usually have a move-in date. |
| 13 | locality_requirement | +0.90 | Must be in the same physical location. |
| 14 | interaction_frequency | +0.80 | Daily — you live together. |
| 15 | scope_breadth | +0.10 | Fairly well-defined need with some flexibility on who. |

---

# Generation Guidance for Agents

## How to Generate an Intent Embedding

The agent's job is to translate the user's stated goals — expressed in natural language, through conversation, or through observed behavior — into a 16-dimensional intent embedding. This section provides guidance for agents performing this translation.

### Step 1: Identify the user's goals

Before generating any numbers, the agent should have a clear understanding of what the user wants. This may come from:

- Explicit statements: "I want to find a romantic partner."
- Conversational context: The user has been talking about loneliness, dating, and what they want in a partner.
- Behavioral signals: The user browsed dating-related features, asked about romantic matching, or described an ideal partner.

If the user's goals are unclear, the agent should ask clarifying questions before generating the embedding. A vague intent produces a mediocre embedding, and a mediocre embedding produces mediocre matches.

### Step 2: Rate each dimension independently

For each of the 16 dimensions, the agent should:

1. Read the anchor descriptions for -1.0, 0.0, and +1.0.
2. Consider the user's stated goals and the observable context.
3. Place the user on the scale based on where their intent falls between the anchors.
4. Record the value as a float in [-1.0, +1.0].

Rate each dimension independently. Do not let one dimension's score influence another — romantic_intent and emotional_depth are correlated in practice but must be rated separately. A user seeking a "pragmatic marriage" might score +0.8 on romantic_intent but only +0.3 on emotional_depth.

### Step 3: Validate against the anchor descriptions

After generating all 16 values, review the embedding as a whole. Does the vector make intuitive sense for what the user described? Check a few dimensions against their anchors:

- If romantic_intent is +0.9, does the user genuinely want a romantic partner?
- If urgency is +0.8, is there really a deadline?
- If shared_lifestyle is +0.7, will these people actually live together?

Adjust any dimensions where the initial rating does not survive scrutiny.

### Step 4: Validate norm and signal breadth

The L2 norm of the intent embedding must be ≥ 0.5 (near-zero vectors are rejected by the server because they produce pathological cosine similarity behavior). Additionally, at least 3 dimensions must have |value| > 0.1 — this ensures the embedding encodes signal across multiple intent facets, not just one. Beyond these minimums, no specific normalization is required. The server computes cosine similarity, which is invariant to vector magnitude. However, agents should produce vectors with clear, multi-dimensional signal — vectors where all values are near zero carry weak discriminating power.

---

## Handling Compound Intents

Users often want more than one thing. "Find a romantic partner AND make new friends." "Sell my couch AND find a roommate." The agent must produce a single 16-dimensional vector that encodes ALL of the user's goals.

**Approach: weighted blend, not arithmetic average.**

Do not simply average the centroids of the relevant clusters. Instead, think about what the user actually wants and rate each dimension based on the combined intent:

- **"Find a romantic partner and also make new friends"**: romantic_intent should be high (+0.7, not the average of +0.85 and 0.0). social_bonding should also be high (+0.7). The user wants both romance and friendship — the embedding should reflect that, not dilute both.

- **"Find a roommate who could also be a friend"**: This is not the average of the roommates centroid and a hypothetical friendship centroid. It is the roommates centroid with social_bonding and emotional_depth boosted. Rate each dimension based on the actual combined intent.

**When goals conflict**, prioritize the primary goal. If the user says "mainly looking for a partner, but also open to friendships," weight romantic dimensions heavily and social dimensions moderately. If the user gives no priority, treat goals as roughly equal.

**When goals are sequential** ("first sell my couch, then find a roommate"), generate a separate registration for each goal if the protocol allows multiple registrations, or encode the more urgent goal. Do not blend temporally separated intents into one embedding.

---

## Handling Vague Intents

Some users cannot articulate what they want: "I'm just exploring," "I don't know what I'm looking for," "something is missing in my life."

**Do not default to all zeros.** An all-zero intent embedding sits at the origin and has undefined cosine similarity with everything (or near-zero similarity with everything). This produces useless search results.

**Instead, encode what you can infer:**

- "I'm just exploring" → High scope_breadth (+0.7). Low urgency (-0.5). Moderate social_bonding (+0.3, since exploring usually implies wanting human connection). Low commitment (-0.2, since nothing is defined yet). Other dimensions at or near 0.0.

- "Something is missing in my life" → Moderate emotional_depth (+0.3). Moderate social_bonding (+0.4). Low scope_breadth could be either direction — the user does not know what they want, so actually this is high scope_breadth (+0.5). Low romantic_intent (+0.1 — slightly open to romance but not seeking it). Other dimensions near 0.0.

The goal is to produce an embedding that, while uncertain, at least points in a plausible direction. A vague embedding is better than a zero embedding, and the user's intent can be refined through feedback and re-registration as they interact with the system.

**Agents should also set a flag** (via natural-language intents or intent tags) indicating that the intent is exploratory. This helps other agents understand that the matched user may not have firm criteria.

---

## Intent Embedding vs. Personality Embedding

The intent embedding and personality embedding serve different purposes and must be generated independently:

| | Intent embedding (16-dim) | Personality embedding (50-dim) |
|---|---|---|
| **Encodes** | What the user wants to find | Who the user is |
| **Changes when** | The user's goals change | The user's personality changes (rarely) |
| **Derived from** | Stated goals, expressed desires, articulated needs | Observed behavior, communication patterns, decision-making |
| **Example** | "I want a romantic partner" → high romantic_intent | "She is warm and empathetic" → high agreeableness, empathy |
| **Temporal stability** | May change frequently (user sells couch, then looks for roommate) | Highly stable (personality is durable) |
| **Multiple per user** | User may re-register with different intents over time | One embedding per registration |

**Common confusion:** An extraverted user (high extraversion in personality embedding) is not necessarily seeking social bonding (high social_bonding in intent embedding). They might be an extraverted person who needs to sell a couch. The personality embedding says they are outgoing; the intent embedding says they want to exchange furniture for money. These are independent facts.

**Another common confusion:** A user seeking a romantic partner (high romantic_intent in intent embedding) is not necessarily a romantic person (personality embedding). They might be a pragmatic, analytically-minded person who has decided it is time to find a partner. The intent is romantic; the personality is analytical.

---

## Common Mistakes to Avoid

1. **Copying personality into intent.** The user is warm and social → agent sets social_bonding high. Wrong. Social_bonding reflects what the user WANTS, not who they ARE. A warm person might be looking to hire a plumber (social_bonding: -0.7).

2. **Defaulting to cluster centroids.** The user says "matchmaking" → agent copies the matchmaking centroid verbatim. Wrong, unless the user's intent is truly the generic archetype. "Find a pragmatic marriage partner" is matchmaking but with lower emotional_depth and higher formality than the centroid. Generate dimension by dimension.

3. **Ignoring compound intents.** The user says "find a roommate who could be a friend" → agent generates a pure roommates vector. Wrong. The "could be a friend" clause should boost social_bonding and emotional_depth above the roommates centroid.

4. **Over-scoring urgency.** Users often express wishes as urgent when they are not. "I really want to find someone!" is not the same as "I need to find someone by Friday." Score urgency based on actual time constraints, not emotional intensity.

5. **Confusing formality with seriousness.** A serious romantic search is not formal. A casual marketplace transaction has some formality (pricing, condition descriptions). Formality is about structural and contractual elements, not emotional weight.

6. **Treating dimensions as binary.** Most intents fall in the -0.5 to +0.5 range on most dimensions. Reserve extreme scores (-0.8 to -1.0 or +0.8 to +1.0) for cases where the user's intent is clearly and unambiguously at the extreme. "Sell my couch" is legitimately -0.9 on romantic_intent. "Find interesting people" is maybe -0.2 on romantic_intent — not -0.9.

7. **Producing flat vectors.** If all 16 values are between -0.2 and +0.2, the embedding is not discriminating enough. At least a few dimensions should have strong signal (|value| > 0.5) for any well-defined intent. If the user's intent truly produces a flat vector, the intent is probably too vague — go back to Step 1 and ask clarifying questions.

8. **Generating intent from demographics.** The user is 28, lives in Brooklyn, works in tech → agent infers they want to date. Wrong. Intent comes from what the user SAYS they want, not from demographic assumptions. Ask, don't assume.

---

# Calibration

When generating an intent embedding for a user, use the following prompt template as guidance for the rating process:

```
You are generating an intent embedding for a user of the Schelling Protocol.
For each dimension, consider the user's STATED GOALS — what they are looking
for, what they want to find, what they are trying to accomplish.

Use the anchor descriptions as reference points. A score of -1.0 means the
user's intent is fully aligned with the negative anchor. A score of +1.0
means full alignment with the positive anchor. A score of 0.0 means the
dimension is genuinely neutral or inapplicable to this intent.

Rate each dimension independently. Do not let one dimension's score influence
others — romantic_intent and emotional_depth are correlated in typical
intents but are independent dimensions that must be rated separately.

When insufficient information is available for a dimension, default to 0.0
rather than guessing. A zero is better than a wrong number.
```

Agents should aim for **goal grounding**: prefer the user's explicitly stated desires and articulated needs over inferred or assumed goals. When the user's words conflict with what the agent thinks they "really" want, trust the words. The user may refine their intent through feedback and re-registration.

---

# Versioning

This document defines **intent-schelling-1.0**. For this version, the following are fixed and must not change:

- **Dimension count**: 16 dimensions, indexed 0 through 15.
- **Dimension ordering**: The index-to-dimension mapping defined above is permanent for intent-schelling-1.0. Index 0 is always `romantic_intent`, index 15 is always `scope_breadth`.
- **Anchor semantics**: The behavioral anchors at -1.0, 0.0, and +1.0 for each dimension are fixed. Rewording for clarity is acceptable in supplementary materials, but the semantic content must not shift.
- **Value range**: Each dimension is a float in [-1.0, +1.0]. Values outside this range are invalid for intent-schelling-1.0 embeddings.
- **Cluster centroids**: The four pre-defined cluster centroid vectors (matchmaking, marketplace, talent, roommates) are fixed for intent-schelling-1.0.

Future versions may add, remove, or reorder dimensions, or adjust cluster centroids. Intent embeddings must always be tagged with their version identifier to ensure correct interpretation. An intent-schelling-1.0 embedding is not directly comparable to an embedding from a different version without an explicit mapping.

---

# Addendum: Agent Capabilities and Intent Embeddings

## Relationship Between Agent Capabilities and Intent Embeddings

Agent capabilities (§21.3 of the protocol spec) describe what an *agent* can do — schedule meetings, process payments, speak specific languages. These are orthogonal to intent embeddings, which describe what a *user* wants.

**Agent capabilities do NOT affect intent embedding generation.** The intent embedding encodes the user's goals in the 16-dimensional continuous space. An agent's ability to schedule meetings or process payments is a separate axis of matching, handled via exact-match filtering (`capability_filters` in search), not via embedding similarity.

**Why not encode capabilities in the intent embedding?** Capabilities are categorical and binary (the agent either can or cannot schedule meetings), while the intent space is continuous and gradient-based. Encoding discrete capabilities into a continuous embedding would waste dimensions and produce poor cosine similarity behavior. Instead, capabilities use the same exact-match filtering infrastructure as structured attributes — conjunctive, server-side, no NLP required.

**When capabilities inform intent generation.** An agent's capabilities may *indirectly* influence the intent embedding in one way: if the agent knows it can schedule meetings, it may register its user with intent embeddings that lean toward use cases requiring meeting coordination (e.g., higher `formality`, higher `interaction_frequency`). But this is the agent's judgment call during embedding generation, not a mechanical encoding of capabilities into intent dimensions.
