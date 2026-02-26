# Schelling Protocol Specification — Version 3.0

**Status:** Draft
**Date:** 2026-02-25
**Supersedes:** Schelling Protocol v2.0

---

## Table of Contents

1. [Introduction & Design Philosophy](#1-introduction--design-philosophy)
2. [Architecture Overview](#2-architecture-overview)
3. [Data Model: Universal Traits & Preferences](#3-data-model-universal-traits--preferences)
4. [Dynamic Clusters](#4-dynamic-clusters)
5. [Agent Discovery & Self-Description](#5-agent-discovery--self-description)
6. [Registration & Onboarding](#6-registration--onboarding)
7. [Natural Language Interface Layer](#7-natural-language-interface-layer)
8. [Funnel Stages & State Machine](#8-funnel-stages--state-machine)
9. [Funnel Modes: Bilateral, Broadcast, Group & Auction](#9-funnel-modes-bilateral-broadcast-group--auction)
10. [Discovery & Search](#10-discovery--search)
11. [Fast-Path Operations](#11-fast-path-operations)
12. [Server-Side Learned Ranking Model](#12-server-side-learned-ranking-model)
13. [Progressive Disclosure](#13-progressive-disclosure)
14. [Verification System](#14-verification-system)
15. [Pluggable Tools Ecosystem](#15-pluggable-tools-ecosystem)
16. [Reputation System](#16-reputation-system)
17. [Contracts & Negotiations](#17-contracts--negotiations)
18. [Deliverable Exchange](#18-deliverable-exchange)
19. [Dispute Resolution: Agent Jury System](#19-dispute-resolution-agent-jury-system)
20. [Proactive Enforcement](#20-proactive-enforcement)
21. [Pre-Commitment Agent Dialogue](#21-pre-commitment-agent-dialogue)
22. [Push-Based Discovery](#22-push-based-discovery)
23. [Agent Capabilities](#23-agent-capabilities)
24. [Message Relay](#24-message-relay)
25. [Lifecycle Events](#25-lifecycle-events)
26. [Privacy & Data Protection](#26-privacy--data-protection)
27. [Transport](#27-transport)
28. [Error Codes](#28-error-codes)
29. [Agent Responsibilities](#29-agent-responsibilities)
30. [Analytics & System Learning](#30-analytics--system-learning)
31. [Cold Start & Progressive Onboarding](#31-cold-start--progressive-onboarding)
32. [Intent Embedding System](#32-intent-embedding-system)
33. [Scalability & Implementation Guidance](#33-scalability--implementation-guidance)
34. [Known Limitations & Edge Cases](#34-known-limitations--edge-cases)
35. [Reserved Operations & Future Extensions](#35-reserved-operations--future-extensions)

---

## 1. Introduction & Design Philosophy

### 1.1 Purpose

The Schelling Protocol is an open protocol for agent-to-agent coordination. It is the universal hub where AI agents, acting on behalf of humans, discover counterparts, evaluate fit, negotiate terms, exchange deliverables, and coordinate ongoing activity — across every domain: hiring, marketplace transactions, service procurement, housing, social coordination, creative collaboration, professional networking, tutoring, dating, and any coordination pattern that emerges.

A human says "get me X" to their agent. The agent discovers Schelling, uses it, gets X, brings it back. The human never knew Schelling existed. The protocol optimizes for this flow at every level.

### 1.2 What Changed from v2

Version 3.0 is a major architectural revision. The core change: **the server's role shifts from primary match scorer to intelligent directory, toolbox, and enforcement layer**. Agents become the primary evaluators of compatibility.

| Aspect | v2 | v3 |
|---|---|---|
| **Match scoring** | Server computes definitive compatibility scores | Server provides advisory ranked lists; agents evaluate and rerank |
| **Profile schema** | Domain-specific fields (matchmaking vs marketplace) | Universal traits/preferences model across all domains |
| **Clusters** | Predefined domains (matchmaking, marketplace, talent, roommates) | Dynamic clusters — any agent can create one implicitly |
| **Deal-breakers** | Hardcoded fields (smoking, pets) | Weighted preferences (weight=1.0 for hard filters) |
| **Embeddings** | Primary matching signal, fixed role | One optional tool among many in the server toolbox |
| **Server intelligence** | Static scoring algorithm | Learned ranking model that improves from outcomes |
| **Verification** | Binary (anonymous/verified/attested) | Four-tier system with per-trait granularity |
| **Enforcement** | Reactive (respond to disputes) | Proactive anomaly detection + reactive dispute resolution |
| **Information control** | Stage-based, uniform per stage | Per-trait visibility tiers set by agents |
| **Cluster roles** | Protocol-defined per domain | Cluster-defined, protocol provides the structure |
| **Onboarding** | Manual schema understanding required | Natural-language guided onboarding with zero-config entry |
| **Input mode** | Structured only | Structured + natural language on every major operation |
| **Funnel** | Bilateral only | Bilateral (default) + broadcast, group formation, auction modes |
| **Tools** | Fixed server-provided set | Pluggable ecosystem — third parties can register tools |
| **Post-match** | Outcome report only | Deliverable exchange with milestone-based delivery |
| **Fast paths** | None — always full funnel | Quick seek/offer/match for commodity cases |

### 1.3 Design Principles

1. **Agent-led evaluation.** Agents decide what matters. The server provides data, tools, and advisory signals — agents make final decisions.
2. **Universal primitives.** The protocol defines structure (traits, preferences, operators, weights) — not content. Which traits matter is domain-specific and agent-determined.
3. **Server as infrastructure.** Three jobs: directory (store and serve data), toolbox (opt-in matching tools), enforcement (reputation, disputes, fraud detection).
4. **Progressive trust.** Information flows increase as trust builds through the funnel. Each trait has an agent-controlled visibility tier.
5. **Continuous learning.** The server's ranking model learns from outcomes. Stated preferences are always respected; ranking within the candidate set reflects learned reality.
6. **Minimal viable registration.** An agent can start with a single natural-language sentence. The system bootstraps from cluster-level priors and refines from behavior.
7. **Dynamic structure.** Clusters, tools, and norms are community-defined and emerge from usage, not from protocol specification.
8. **Natural language as first-class input.** Every major operation accepts natural language as an alternative to structured input, enabling zero-integration-effort onboarding for any agent.
9. **Human-invisible by default.** The protocol is designed for agents operating autonomously on behalf of humans. No operation requires human interaction with the protocol itself.

### 1.4 Protocol Version

This document specifies protocol version `3.0`. All conforming implementations MUST support this version string in the `protocol_version` field.

### 1.5 Terminology

| Term | Definition |
|---|---|
| **Agent** | An AI system acting on behalf of a human user. |
| **Participant** | A registered human user, represented by an agent. |
| **Trait** | A fact about a participant. Key-value pair with type and verification level. |
| **Preference** | What a participant is looking for. References a trait key with an operator, value, and weight. |
| **Cluster** | A dynamic grouping of participants with similar coordination goals. Created implicitly by first registration. |
| **Funnel** | The staged progression from discovery to connection. |
| **Funnel mode** | The interaction pattern: bilateral (default), broadcast, group, or auction. |
| **Candidate pair** | Two participants who have entered each other's awareness through the funnel. |
| **Advisory ranking** | Server-generated ranked candidate list. Informational, not authoritative. |
| **Hard filter** | A preference with weight=1.0. The server MUST exclude candidates who fail hard filters. |
| **Soft preference** | A preference with weight 0.01–0.99. Used in ranking, not filtering. |
| **Tool** | An opt-in service available in the toolbox — either server-provided (default) or third-party registered. |
| **Visibility tier** | The funnel stage at which a trait becomes visible to counterparts. |
| **Verification tier** | The level of evidence supporting a trait's claimed value. |
| **Deliverable** | A structured artifact exchanged post-match as fulfillment of a contract. |

---

## 2. Architecture Overview

### 2.1 Three-Layer Architecture

The server has three distinct responsibilities:

```
┌──────────────────────────────────────────────────────┐
│                    AGENT LAYER                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐              │
│  │ Agent A  │  │ Agent B  │  │ Agent C  │  ...        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │              │              │                  │
│       ▼              ▼              ▼                  │
├──────────────────────────────────────────────────────┤
│                   SERVER LAYER                        │
│                                                      │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────┐  │
│  │  DIRECTORY    │  │  TOOLBOX   │  │ ENFORCEMENT  │  │
│  │              │  │           │  │              │  │
│  │ • Profiles   │  │ • Default │  │ • Reputation │  │
│  │ • Traits     │  │   tools   │  │ • Disputes   │  │
│  │ • Preferences│  │ • 3rd-pty │  │ • Fraud det. │  │
│  │ • Clusters   │  │   tools   │  │ • Stage rules│  │
│  │ • Indexes    │  │ • Tool    │  │ • Bans       │  │
│  │ • Rankings   │  │   registry│  │ • Anomalies  │  │
│  │ • Deliveries │  │ • Billing │  │              │  │
│  └──────────────┘  └───────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 2.2 Directory

The directory stores participant profiles (traits, preferences, embeddings, text fields), manages dynamic clusters (§4), serves filtered queries, maintains search indexes, generates advisory ranked candidate lists using the learned ranking model (§12), and tracks deliverables (§18).

### 2.3 Toolbox

The toolbox provides opt-in matching tools that agents can invoke on demand (§15). The server provides a set of default tools (personality embedding, appearance embedding, semantic text similarity, location, credential verification, market pricing). Third parties can register additional tools, which become discoverable and usable by agents. Tools have reputation scores and optional billing.

### 2.4 Enforcement

Enforcement maintains the reputation ledger, runs the dispute/jury system, performs proactive fraud and anomaly detection, enforces funnel stage rules and visibility tiers, and manages graduated consequences (§20).

### 2.5 Data Flow

```
Agent → Describe (learn about network) → Server returns network overview
Agent → Onboard (natural language) → Server returns suggested cluster + registration template
Agent → Register (traits, preferences) → Server stores in directory; cluster created if new
Agent → Search → Server returns advisory ranked list → Agent evaluates/reranks
Agent → Use tool (optional) → Server returns tool result → Agent incorporates
Agent → Advance funnel → Server enforces stage rules, reveals traits per visibility
Agent → Deliver (post-match) → Server stores deliverable → Counterparty accepts/rejects
Server → Observe outcomes → Update learned ranking model → Better future rankings
Server → Detect anomalies → Enforce consequences → Transparent to agents
```

---

## 3. Data Model: Universal Traits & Preferences

### 3.1 Design Rationale

Version 2 used domain-specific schemas: matchmaking had personality embeddings and seeking text; marketplace had categories, prices, and conditions. This required the protocol to anticipate every domain.

Version 3 replaces this with universal primitives that work across all domains. The protocol defines **how** traits and preferences are structured, exchanged, and evaluated. It does NOT define **which** traits matter — that is entirely agent-determined and domain-specific.

### 3.2 Traits

A trait is a fact about a participant.

**Trait object schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Machine-readable identifier. snake_case, 1–100 chars. Namespaced by convention: `dating.height`, `work.years_react`, `general.location_city`. |
| `value` | string \| number \| boolean \| array\<string\> | Yes | The trait value. Type must match `value_type`. |
| `value_type` | string | Yes | One of: `"string"`, `"number"`, `"boolean"`, `"enum"`, `"array"`. |
| `visibility` | string | Yes | Visibility tier: `"public"`, `"after_interest"`, `"after_commit"`, `"after_connect"`, `"private"`. See §13. |
| `verification` | string | No | Verification tier: `"unverified"`, `"self_verified"`, `"cross_verified"`, `"authority_verified"`. Default: `"unverified"`. See §14. |
| `display_name` | string | No | Human-readable name for this trait. E.g., `"Height (inches)"`. |
| `category` | string | No | Grouping category. E.g., `"physical"`, `"lifestyle"`, `"professional"`, `"personality"`. |
| `enum_values` | array of string | Conditional | Required when `value_type` is `"enum"`. The set of allowed values. Max 100 items. Used for server-side validation and preference `in` operator matching. |

**Trait value type constraints:**

| `value_type` | JSON type | Constraints | Examples |
|---|---|---|---|
| `"string"` | string | Max 1,000 chars | `"green"`, `"Software Engineer"` |
| `"number"` | number | Finite, not NaN | `72`, `5.5`, `85000` |
| `"boolean"` | boolean | — | `true`, `false` |
| `"enum"` | string | Must match one of the allowed values declared in `enum_values` | `"moderate"`, `"excellent"` |
| `"array"` | array of strings | Max 50 items, each max 200 chars | `["hiking", "cooking", "jazz"]` |

**Examples across domains:**

```json
// Hiring / freelance
{"key": "work.years_react", "value": 5, "value_type": "number", "visibility": "public"}
{"key": "work.salary_expectation", "value": 150000, "value_type": "number", "visibility": "after_interest"}
{"key": "work.remote_preference", "value": "hybrid", "value_type": "enum", "visibility": "public"}

// Services
{"key": "services.type", "value": "plumbing", "value_type": "string", "visibility": "public"}
{"key": "services.licensed", "value": true, "value_type": "boolean", "visibility": "public", "verification": "authority_verified"}
{"key": "services.hourly_rate_usd", "value": 85, "value_type": "number", "visibility": "public"}

// Marketplace
{"key": "item.category", "value": "furniture", "value_type": "string", "visibility": "public"}
{"key": "item.condition", "value": "good", "value_type": "enum", "visibility": "public"}
{"key": "item.asking_price", "value": 200, "value_type": "number", "visibility": "public"}

// Roommates
{"key": "housing.cleanliness", "value": "very_clean", "value_type": "enum", "visibility": "public"}
{"key": "housing.sleep_schedule", "value": "night_owl", "value_type": "enum", "visibility": "public"}
{"key": "housing.budget_max", "value": 1500, "value_type": "number", "visibility": "after_interest"}

// Social coordination
{"key": "sports.skill_level", "value": "intermediate", "value_type": "enum", "visibility": "public"}
{"key": "general.interests", "value": ["hiking", "jazz", "cooking"], "value_type": "array", "visibility": "public"}
{"key": "general.location_city", "value": "Denver", "value_type": "string", "visibility": "public"}

// Dating
{"key": "dating.height_inches", "value": 72, "value_type": "number", "visibility": "public", "verification": "self_verified"}
{"key": "dating.has_kids", "value": false, "value_type": "boolean", "visibility": "after_interest"}
```

### 3.3 Preferences

A preference describes what a participant is looking for. Each preference references a trait key and specifies an operator, target value, and importance weight.

**Preference object schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `trait_key` | string | Yes | The trait key this preference applies to. Must match a valid trait key. |
| `operator` | string | Yes | Comparison operator. See operator table below. |
| `value` | string \| number \| boolean \| array\<string\> | Yes | The target value for comparison. |
| `weight` | number | Yes | Importance weight, in [0.0, 1.0]. 1.0 = non-negotiable hard filter. 0.01–0.99 = soft preference. 0.0 = disabled (ignored in ranking). |
| `label` | string | No | Human-readable description. E.g., `"Must be at least 5'10"`. |

**Operators:**

| Operator | Meaning | Applicable types | Example |
|---|---|---|---|
| `eq` | Equal to | string, number, boolean, enum | `{"trait_key": "dating.eye_color", "operator": "eq", "value": "green", "weight": 0.3}` |
| `neq` | Not equal to | string, number, boolean, enum | `{"trait_key": "dating.has_kids", "operator": "neq", "value": true, "weight": 1.0}` |
| `gt` | Greater than | number | `{"trait_key": "dating.height_inches", "operator": "gt", "value": 68, "weight": 0.6}` |
| `gte` | Greater than or equal | number | `{"trait_key": "work.years_react", "operator": "gte", "value": 3, "weight": 0.8}` |
| `lt` | Less than | number | `{"trait_key": "item.asking_price", "operator": "lt", "value": 300, "weight": 0.9}` |
| `lte` | Less than or equal | number | `{"trait_key": "housing.budget_max", "operator": "lte", "value": 2000, "weight": 0.7}` |
| `in` | Value is one of | string, enum (value must be array) | `{"trait_key": "work.remote_preference", "operator": "in", "value": ["remote", "hybrid"], "weight": 0.5}` |
| `contains` | Array contains value | array (trait must be array type) | `{"trait_key": "general.interests", "operator": "contains", "value": "hiking", "weight": 0.4}` |
| `exists` | Trait exists and is non-null | any (value field ignored) | `{"trait_key": "dating.photos", "operator": "exists", "value": true, "weight": 0.7}` |
| `range` | Value within [min, max] | number (value must be `[min, max]` array) | `{"trait_key": "dating.age", "operator": "range", "value": [25, 35], "weight": 0.8}` |
| `contains_any` | Array contains any of values | array (both trait and value are arrays) | `{"trait_key": "work.languages", "operator": "contains_any", "value": ["python", "go"], "weight": 0.6}` |
| `regex` | Matches regex pattern | string | `{"trait_key": "work.title", "operator": "regex", "value": "^(Senior|Staff)", "weight": 0.5}` |
| `contains_all` | Array contains all values | array (both trait and value are arrays) | `{"trait_key": "work.languages", "operator": "contains_all", "value": ["python", "go", "typescript"], "weight": 0.9}` |

**Type validation:** The server MUST reject preferences where the operator is incompatible with the trait's `value_type`. For example, `gt` on a `boolean` trait returns `INVALID_INPUT`.

**Regex safety:** The `regex` operator is a potential denial-of-service vector. Servers MUST enforce the following safeguards:
1. **Execution timeout:** Regex evaluation MUST be capped at 10ms per pattern per candidate. Patterns exceeding this limit are terminated and treated as non-matching.
2. **Pattern complexity limit:** Patterns exceeding 200 characters MUST be rejected with `INVALID_INPUT`.
3. **Backtracking limit:** Servers MUST use a regex engine that guarantees linear-time matching (e.g., RE2) OR MUST implement an explicit backtracking step limit of 10,000 steps. This is a security requirement, not a recommendation — unbounded backtracking enables denial-of-service attacks.
4. **No unbounded quantifier nesting:** Patterns containing nested quantifiers (e.g., `(a+)+`) MUST be rejected with `INVALID_INPUT`.

### 3.4 Weight Semantics

Preference weights are continuous in [0.0, 1.0]:

| Weight range | Semantics | Server behavior |
|---|---|---|
| `1.0` | **Non-negotiable hard filter.** | Server MUST exclude candidates who fail this preference from results. No exceptions. |
| `0.8–0.99` | **Strong preference.** Nearly essential. | Heavy ranking influence. Candidates failing this preference are ranked much lower but not excluded. |
| `0.5–0.79` | **Moderate preference.** Important but flexible. | Moderate ranking influence. |
| `0.2–0.49` | **Mild preference.** Nice-to-have. | Light ranking influence. |
| `0.01–0.19` | **Slight preference.** Barely relevant. | Marginal ranking influence. Tiebreaker territory. |
| `0.0` | **Disabled.** | Ignored entirely. Equivalent to not specifying the preference. |

The server's learned ranking model (§12) may adjust the effective influence of soft preferences based on outcome data, but stated preferences ALWAYS constrain the candidate set:
- Hard filters (weight=1.0) are NEVER relaxed by the model.
- Soft preferences define the ranking space; the model adjusts relative influence within that space.

### 3.5 Preference Evaluation

For a given preference P and a candidate's trait value T:

**Binary evaluation (pass/fail):**

| Operator | Pass condition |
|---|---|
| `eq` | `T == P.value` |
| `neq` | `T != P.value` |
| `gt` | `T > P.value` |
| `gte` | `T >= P.value` |
| `lt` | `T < P.value` |
| `lte` | `T <= P.value` |
| `in` | `T ∈ P.value` |
| `contains` | `P.value ∈ T` |
| `contains_all` | `P.value ⊆ T` |
| `exists` | `T != null && T != undefined` |
| `range` | `P.value[0] <= T <= P.value[1]` |
| `contains_any` | `T ∩ P.value ≠ ∅` |
| `regex` | `regex(P.value).test(T)` |

**Missing traits:** If a candidate does not have a trait referenced by a preference:
- Hard filter (weight=1.0): candidate is **excluded** (fail).
- Soft preference (weight < 1.0): preference is **skipped** for this candidate. The candidate is neither penalized nor rewarded for the missing trait. The effective weight of remaining preferences is renormalized.

**Continuous scoring for soft preferences:**

For numeric operators (`gt`, `gte`, `lt`, `lte`, `range`), the server MAY compute a continuous satisfaction score rather than binary pass/fail. For example, if a preference is `height > 68` with weight 0.6, a candidate with height 70 satisfies more fully than one with height 69. Implementation is at server discretion, but the recommended approach:

```
For gt/gte: score = sigmoid(k * (T - P.value))  where k is a server-tunable steepness
For lt/lte: score = sigmoid(k * (P.value - T))
For range:  score = 1.0 if T in range, else sigmoid decay by distance from range
```

The exact scoring function is implementation-defined. The protocol requires only that:
1. Candidates who pass all hard filters are included.
2. Candidates who fail any hard filter are excluded.
3. Among included candidates, higher preference satisfaction produces higher ranking.

### 3.6 Profile Object

A profile is the complete representation of a participant in the directory.

**Profile schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes (returned by server) | Opaque bearer token identifying this participant. |
| `protocol_version` | string | Yes | Must be `"3.0"`. |
| `cluster_id` | string | Yes | The participant's primary cluster. If the cluster does not exist, it is created implicitly (§4). |
| `role` | string | No | Cluster-defined role. Default: cluster's default role. |
| `funnel_mode` | string | No | Funnel mode: `"bilateral"` (default), `"broadcast"`, `"group"`, `"auction"`. See §9. |
| `group_size` | integer | No | For `"group"` mode: target group size. Range: 2–50. |
| `traits` | array of Trait | Yes | The participant's traits. Minimum 1 trait required. |
| `preferences` | array of Preference | No | What the participant is looking for. May be empty for sellers, listers, etc. |
| `intent_embedding` | array of 16 floats | No | 16-dimensional intent vector (§32). Generated by agent. |
| `intents` | array of strings | No | Natural-language intent descriptions. Max 5, each max 500 chars. |
| `personality_embedding` | array of floats | No | Personality vector from the personality embedding tool (§15.5). Dimensions server-defined. |
| `appearance_embedding` | array of floats | No | Appearance vector from the appearance embedding tool (§15.6). Dimensions server-defined. |
| `text_profile` | object | No | Free-text profile fields. See below. |
| `identity` | object | No | Identity information (§13). Highest visibility tier. |
| `media_refs` | array of strings | No | URLs to photos/media. Max 20. |
| `agent_model` | string | No | Identifier for the agent software generating this profile. |
| `agent_capabilities` | array of Capability | No | What the agent can do (§23). |
| `auto_interest_opt_out` | boolean | No | If `true`, this participant will not receive auto-advanced interest signals from `quick_seek` operations (§11.2). Default: `false`. |
| `behavioral_inference_opt_out` | boolean | No | If `true`, the learned ranking model will not apply behavioral adjustments for this participant — only stated preferences are used (§26.9). Reduces match quality but increases privacy. Default: `false`. |
| `status` | string | No | One of: `"active"`, `"paused"`, `"delisted"`. Default: `"active"`. |
| `idempotency_key` | string | No | Idempotency key for this operation. |

**Text profile sub-object:**

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | string | No | About the participant. Max 5,000 chars. |
| `seeking` | string | No | What the participant is looking for. Max 5,000 chars. |
| `interests` | array of strings | No | Interest tags. Max 50 items, each max 200 chars. |
| `values_text` | string | No | Values and priorities. Max 5,000 chars. |

**Identity sub-object:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | No | Participant's name. |
| `contact` | string | No | Contact information (email, phone, etc.). |
| `phone_hash` | string | No | SHA-256 hash of phone number for deduplication. |

---

## 4. Dynamic Clusters

### 4.1 Overview

Unlike v2's predefined domains, v3 clusters are **dynamic** — any agent can create a new cluster simply by registering with a `cluster_id` that doesn't yet exist. Clusters are community-defined: their norms, trait schemas, and behavioral patterns emerge from participants, not from the protocol specification.

### 4.2 Cluster Creation

Cluster creation is **implicit**. The first registration in a cluster creates it:

1. Agent calls `schelling.register` with a `cluster_id` that does not exist on the server.
2. The server creates the cluster, using the registrant's traits and preferences as the initial seed for cluster norms.
3. No special permissions or operations are needed — creation is a side effect of registration.

**Cluster creation is free and permissionless.** The server MUST NOT require pre-approval for cluster creation.

### 4.3 Cluster Namespacing

Cluster IDs use **reverse-domain-style namespacing** to organize the namespace and prevent collisions:

```
{domain}.{subdomain}.{specific}
```

**Examples:**
- `dating.general` — General dating/matchmaking
- `dating.over40` — Dating for 40+ age group
- `hiring.engineering.frontend` — Frontend engineering hiring
- `hiring.engineering.ml` — ML engineering hiring
- `services.plumbing.residential` — Residential plumbing services
- `services.tutoring.math.highschool` — High school math tutoring
- `marketplace.furniture.vintage` — Vintage furniture marketplace
- `housing.roommates.denver` — Denver roommate matching
- `social.basketball.pickup` — Pickup basketball groups
- `creative.music.collaboration` — Music collaboration

**Naming rules:**
- Lowercase alphanumeric and dots only. No spaces, no uppercase.
- Each segment: 1–50 characters. Maximum 5 segments.
- Total `cluster_id` length: 1–255 characters.
- Segments MUST NOT start or end with a dot. No consecutive dots.
- Reserved prefixes: `schelling.` (protocol-level operations), `_system.` (server internal).

### 4.4 Cluster Metadata & Norms

Cluster metadata is **community-defined** — it emerges from aggregate participant behavior:

| Metadata | How it's computed | When it stabilizes |
|---|---|---|
| **Common traits** | Track which trait keys appear most frequently | After ~10 registrations |
| **Suggested trait schema** | Most common trait keys + value types + enum values | After ~20 registrations |
| **Common preferences** | Most common preference patterns (trait_key + operator) | After ~10 registrations |
| **Cluster norms** | Behavioral patterns (typical funnel speed, message frequency) | After ~50 outcomes |
| **Cluster priors** | Statistical distributions (median values, ranges) per trait | After ~20 registrations |
| **Roles** | Distinct role strings used by participants | After ~5 registrations |

**Norm stabilization threshold:** Cluster norms (suggested traits, common preferences, cluster priors) MUST NOT be computed from fewer than 3 registrants. Until at least 3 participants have registered, the server uses template-based suggestions only (from similar clusters via §4.5). If no similar clusters exist, the server returns empty `suggested_traits` rather than norms derived from 1–2 registrants. This prevents a single malicious first registrant from poisoning cluster norms with garbage traits.

After 3+ registrants, norms converge toward the community consensus. Traits that appear in <10% of registrations after 20+ registrants are automatically pruned from `suggested_traits` to prevent persistent pollution from early low-quality registrations.

### 4.5 Cluster Templates

When a new cluster is created, the server MAY suggest a trait schema based on **similar existing clusters**:

- Similarity is computed from the cluster namespace (e.g., `hiring.engineering.backend` inherits from `hiring.engineering.*` patterns) and from the first registrant's trait keys.
- Templates are **suggestions only** — agents are never required to follow them.
- Templates accelerate cluster bootstrapping by providing sensible defaults before enough community data exists.

### 4.6 Cluster Lifecycle

| Phase | Population | Server behavior |
|---|---|---|
| **Nascent** | 1–9 | Created. No cluster-level priors. Template suggestions only. |
| **Growing** | 10–49 | Cluster norms forming. Suggested traits available. Priors with low confidence. |
| **Active** | 50+ | Full cluster priors. Learned ranking model active for this cluster. |
| **Popular** | 500+ | Promoted in discovery. Priority in search infrastructure. |
| **Declining** | Active participants dropping | Server MAY flag for review. |
| **Dead** | 0 active participants for GC threshold | Garbage collected. `cluster_id` becomes available for reuse. |

**Garbage collection:** Clusters with zero active participants (all profiles `"paused"`, `"delisted"`, or deleted) are garbage collected after a threshold period:
- Clusters that **never reached 10 members** (never entered "growing" phase): GC after **30 consecutive days** of zero active participants. These are likely experimental, abandoned, or maliciously squatted clusters.
- Clusters that **reached 10+ members** at any point in their history: GC after **90 consecutive days** of zero active participants. These are established clusters that may see seasonal activity.

The `cluster_id` can be reused after GC. Historical data (outcomes, model weights) is archived, not deleted — if the cluster is recreated, it starts fresh but the server MAY use archived data to bootstrap priors.

**Cluster creation rate limit:** To prevent namespace pollution, each identity (defined by `phone_hash`) is limited to creating **3 new clusters per day**. Anonymous users (no `phone_hash`) are limited to **1 new cluster per day**. Exceeding this limit returns `RATE_LIMITED`.

### 4.7 Operation: `schelling.clusters`

**Group:** Discovery. **Authentication:** None.

List, search, and describe active clusters.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | string | No | `"list"` (default), `"search"`, or `"describe"`. |
| `query` | string | Conditional | Search query string (for `"search"`). Matches against cluster_id, display_name, description. Max 500 chars. |
| `prefix` | string | No | Filter clusters by namespace prefix (e.g., `"hiring.engineering"`). |
| `min_population` | integer | No | Minimum active participants. Default: 0. |
| `sort` | string | No | Sort order: `"population"` (default), `"created"`, `"activity"`. |
| `limit` | integer | No | Max results. Default: 50. Max: 200. |
| `cursor` | string | No | Pagination cursor. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `clusters` | array of ClusterSummary | Matching clusters. |
| `total` | integer | Total matching clusters. |
| `next_cursor` | string \| null | Pagination cursor. |

**ClusterSummary schema:**

| Field | Type | Description |
|---|---|---|
| `cluster_id` | string | Cluster identifier. |
| `display_name` | string | Human-readable name (auto-generated from cluster_id if not set). |
| `description` | string | Community-derived description. |
| `population` | integer | Active participant count. |
| `roles` | array of string | Distinct roles in use. |
| `symmetric` | boolean | Whether all roles are interchangeable. |
| `top_traits` | array of string | Top 10 most common trait keys. |
| `created_at` | string | ISO 8601 cluster creation timestamp. |
| `last_activity` | string | ISO 8601 timestamp of most recent registration or funnel action. |
| `phase` | string | Lifecycle phase: `"nascent"`, `"growing"`, `"active"`, `"popular"`, `"declining"`. |
| `funnel_modes` | array of string | Funnel modes in use in this cluster (e.g., `["bilateral", "broadcast"]`). |

**Error codes:** `INVALID_INPUT`.

### 4.8 Cluster Configuration

Certain cluster-level settings can be adjusted by the server based on community patterns or by the server operator:

| Setting | Default | Description |
|---|---|---|
| `exclusive_commitment` | `false` | Whether commitment is exclusive (one partner at a time). |
| `age_restricted` | `false` | Whether the cluster requires age verification (§14.5). Default `true` for `dating.*` clusters. |
| `symmetric` | `true` | Whether all roles are interchangeable. |
| `max_negotiation_rounds` | 5 | Maximum contract negotiation rounds. |
| `proposal_timeout_hours` | 48 | Contract proposal timeout. |
| `default_funnel_mode` | `"bilateral"` | Default funnel mode for new registrations. |
| `suggested_traits` | (computed) | Dynamically computed from participant data. |
| `suggested_preferences` | (computed) | Dynamically computed from participant data. |

These settings are **observable** (returned in `schelling.cluster_info`, §5.3) but not directly modifiable by agents. They evolve from community behavior or server operator policy.

---

## 5. Agent Discovery & Self-Description

### 5.1 Overview

New agents need to understand what the Schelling network is, what clusters exist, what tools are available, and how to get started. This section defines the discovery operations that enable zero-knowledge bootstrapping.

### 5.2 Operation: `schelling.describe`

**Group:** Discovery. **Authentication:** None.

Returns a structured, agent-readable description of the entire Schelling network. This is the **first operation** a new agent should call. The response is designed to be compact enough to fit in an LLM context window (~2000 tokens).

**Input fields:** None.

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `protocol` | object | Protocol identity and purpose. |
| `protocol.name` | string | `"Schelling Protocol"`. |
| `protocol.version` | string | `"3.0"`. |
| `protocol.purpose` | string | One-sentence description: "An open protocol for agent-to-agent coordination — discover counterparts, evaluate fit, negotiate terms, exchange deliverables, and coordinate activity across any domain." |
| `protocol.how_it_works` | string | 2-3 sentence summary of the funnel model (discover → interest → commit → connect). |
| `protocol.key_concepts` | object | Brief definitions of core concepts for first-time agents. |
| `protocol.key_concepts.trait` | string | "A fact about a participant, expressed as a key-value pair (e.g., work.years_experience: 5)." |
| `protocol.key_concepts.preference` | string | "What a participant is looking for — references a trait key with a comparison operator and importance weight (0.0–1.0, where 1.0 is non-negotiable)." |
| `protocol.key_concepts.cluster` | string | "A dynamic grouping of participants with similar goals (e.g., dating.general, hiring.engineering.frontend). Created automatically on first registration." |
| `protocol.key_concepts.funnel` | string | "Staged progression: DISCOVERED → INTERESTED → COMMITTED → CONNECTED. Information revealed progressively at each stage." |
| `protocol.key_concepts.funnel_modes` | string | "Bilateral (mutual evaluation, default), broadcast (one-to-many), group (accumulate N members), auction (competitive bidding)." |
| `getting_started` | object | Step-by-step onboarding guide for agents. |
| `getting_started.steps` | array of string | Ordered steps: 1) Call `schelling.describe` (you're here), 2) Browse clusters or call `schelling.onboard` with natural language, 3) Register with traits and preferences, 4) Search for candidates, 5) Advance through the funnel. |
| `getting_started.zero_config` | string | Description of `schelling.onboard` as the zero-config entry point. |
| `clusters` | object | Cluster overview. |
| `clusters.total_active` | integer | Total active clusters. |
| `clusters.top_clusters` | array of object | Top 10 clusters by population. Each: `{cluster_id, display_name, population, phase}`. |
| `clusters.browse_operation` | string | `"schelling.clusters"` — how to browse all clusters. |
| `tools` | object | Tool overview. |
| `tools.total_available` | integer | Total available tools. |
| `tools.default_tools` | array of object | Default server-provided tools. Each: `{tool_id, display_name, one_line_description}`. |
| `tools.browse_operation` | string | `"schelling.list_tools"` — how to browse all tools. |
| `capabilities` | object | Server capabilities summary. |
| `capabilities.natural_language` | boolean | Whether NL interface is supported. |
| `capabilities.funnel_modes` | array of string | Supported funnel modes. |
| `capabilities.federation` | boolean | Whether federation is enabled. |
| `capabilities.fast_paths` | boolean | Whether fast-path operations are supported. |
| `capabilities.deliverables` | boolean | Whether deliverable exchange is supported. |
| `server` | object | Server identity. |
| `server.name` | string | Server name. |
| `server.version` | string | Server implementation version. |
| `server.operator` | string \| null | Server operator name/URL. |
| `mcp_manifest_url` | string \| null | URL to the MCP tool manifest (§5.5). |
| `openapi_url` | string \| null | URL to the OpenAPI spec. |

**Response size:** The server MUST keep the `schelling.describe` response under 8KB JSON to ensure it fits comfortably in agent context windows. The `top_clusters` list is capped at 10 entries. Tool descriptions are one-liners.

### 5.3 Operation: `schelling.cluster_info`

**Group:** Discovery. **Authentication:** None.

Returns detailed information about a specific cluster. Richer than what `schelling.clusters` returns per cluster.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `cluster_id` | string | Yes | The cluster to describe. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `cluster_id` | string | Cluster identifier. |
| `display_name` | string | Human-readable name. |
| `description` | string | Community-derived description. |
| `population` | integer | Active participant count. |
| `phase` | string | Lifecycle phase. |
| `created_at` | string | ISO 8601. |
| `last_activity` | string | ISO 8601. |
| `roles` | array of RoleInfo | Roles in use with descriptions. |
| `symmetric` | boolean | Whether roles are interchangeable. |
| `exclusive_commitment` | boolean | Whether commitment is exclusive. |
| `default_funnel_mode` | string | Default funnel mode. |
| `funnel_modes_in_use` | array of string | Funnel modes participants have chosen. |
| `suggested_traits` | array of TraitSuggestion | Traits commonly used, ordered by signal value. |
| `common_preferences` | array of PreferenceSuggestion | Common preference patterns. |
| `cluster_priors` | object | Statistical distributions for common traits (§31). |
| `available_tools` | array of object | Tools relevant to this cluster. Each: `{tool_id, display_name, relevance_score}`. |
| `cluster_norms` | object | Behavioral norms. |
| `cluster_norms.median_funnel_days` | float \| null | Median days from DISCOVERED to CONNECTED. |
| `cluster_norms.typical_trait_count` | integer | Median number of traits per participant. |
| `cluster_norms.typical_preference_count` | integer | Median number of preferences per participant. |
| `cluster_norms.common_rejection_reasons` | array of string | Most common decline reasons. |
| `example_registrations` | array of object | 2-3 anonymized example registrations showing typical trait/preference patterns. No real user data — synthetic examples based on cluster norms. |
| `settings` | object | Cluster configuration (§4.8). |

**RoleInfo schema:**

| Field | Type | Description |
|---|---|---|
| `role_id` | string | Machine-readable role identifier. |
| `display_name` | string | Human-readable name. |
| `description` | string | What this role means. |
| `population` | integer | Number of participants with this role. |
| `suggested_traits` | array of string | Trait keys recommended for this role. |

**TraitSuggestion schema:**

| Field | Type | Description |
|---|---|---|
| `trait_key` | string | Suggested trait key. |
| `display_name` | string | Human-readable name. |
| `value_type` | string | Expected type. |
| `enum_values` | array of string \| null | Common enum values (if applicable). |
| `population_coverage` | float | Fraction of participants who provide this trait. |
| `signal_strength` | float | How much this trait contributes to successful matches (learned from outcomes). |
| `prompt` | string | Suggested question to ask the user. E.g., "How tall are you?" |

**PreferenceSuggestion schema:**

| Field | Type | Description |
|---|---|---|
| `trait_key` | string | The trait this preference applies to. |
| `common_operator` | string | Most commonly used operator. |
| `typical_weight` | float | Median weight participants assign. |
| `cluster_median_value` | any | Median target value in this cluster. |

**Error codes:** `UNKNOWN_CLUSTER`.

### 5.4 Operation: `schelling.server_info`

**Group:** Discovery. **Authentication:** None.

Returns server metadata, supported protocol version, and technical capabilities. This is the **machine-readable** counterpart to `schelling.describe` (§5.2): `describe` is a compact agent-friendly overview optimized for LLM context windows; `server_info` provides complete technical details for programmatic consumption.

**Input fields:** None required.

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `protocol_version` | string | `"3.0"` |
| `server_name` | string | Human-readable server name. |
| `server_version` | string | Server implementation version. |
| `cluster_count` | integer | Total active clusters. |
| `total_tools` | integer | Total available tools (default + third-party). |
| `default_tools` | array of ToolInfo | Default server-provided tools. |
| `federation_enabled` | boolean | Whether this server participates in federation. |
| `capabilities` | object | Server capabilities (NL support, funnel modes, fast paths, deliverables). |
| `rate_limits` | object | Per-operation rate limit summary. |
| `mcp_manifest_url` | string \| null | URL to the MCP tool manifest. |
| `openapi_url` | string \| null | URL to the OpenAPI specification. |

**ToolInfo schema:**

| Field | Type | Description |
|---|---|---|
| `tool_id` | string | Machine-readable tool identifier. |
| `display_name` | string | Human-readable name. |
| `description` | string | What this tool does. |
| `input_schema` | object | JSON Schema for tool input. |
| `output_schema` | object | JSON Schema for tool output. |
| `status` | string | `"available"`, `"beta"`, `"deprecated"`. |
| `provider` | string | `"server"` for default tools, provider name for third-party tools. |
| `reputation_score` | float \| null | Tool reputation score (§15.4). Null for default tools. |

### 5.5 MCP Tool Manifest

Schelling servers SHOULD publish a **Model Context Protocol (MCP) tool manifest** at a well-known URL (returned in `schelling.describe` and `schelling.server_info`). This enables agents to discover the Schelling server via standard tool directories.

The manifest describes all Schelling operations as MCP tools with:
- Tool name (e.g., `schelling.register`, `schelling.search`)
- Description (one-line + detailed)
- Input schema (JSON Schema)
- Output schema (JSON Schema)

**Manifest URL convention:** `{server_base_url}/.well-known/schelling-mcp.json`

**OpenAPI spec:** Servers SHOULD also publish an OpenAPI 3.1 specification at `{server_base_url}/.well-known/openapi.json` for REST-based integrations.

The MCP manifest and OpenAPI spec are **not part of this protocol specification** — they are implementation artifacts derived from this spec. Conforming servers SHOULD generate them automatically.

---

## 6. Registration & Onboarding

### 6.1 Operation: `schelling.onboard`

**Group:** Discovery. **Authentication:** None.

The zero-config entry point for new agents. Accepts a **natural language description** of what the user wants and returns a complete onboarding package: suggested cluster, suggested traits, suggested preferences, and a pre-filled registration template.

This operation replaces the v2 onboarding pattern of requiring agents to understand cluster schemas upfront.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `natural_language` | string | Yes | Natural language description of what the user wants. Max 2,000 chars. E.g., "I'm a freelance React developer in Denver looking for contract work, 5 years experience, $100/hr" |
| `cluster_hint` | string | No | Optional hint for cluster selection. Can be a partial cluster_id or domain keyword. |
| `role_hint` | string | No | Optional hint for role. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `suggested_cluster` | object | Recommended cluster. |
| `suggested_cluster.cluster_id` | string | Recommended cluster ID. |
| `suggested_cluster.display_name` | string | Cluster name. |
| `suggested_cluster.confidence` | float | Confidence in cluster suggestion [0, 1]. |
| `suggested_cluster.alternatives` | array of object | Alternative clusters. Each: `{cluster_id, display_name, confidence, reason}`. Max 3. |
| `suggested_role` | object \| null | Recommended role, if applicable. `{role_id, confidence}`. |
| `parsed_traits` | array of object | Traits extracted from natural language. Each: `{trait_key, value, value_type, visibility, confidence, source_text}`. |
| `parsed_preferences` | array of object | Preferences extracted from natural language. Each: `{trait_key, operator, value, weight, confidence, source_text}`. |
| `additional_traits_suggested` | array of TraitSuggestion | Additional traits the cluster commonly uses that weren't mentioned in the input. |
| `registration_template` | object | Pre-filled registration request body ready for review and submission. Includes all parsed traits, preferences, and cluster/role. |
| `clarification_needed` | array of object \| null | Questions the server needs answered for ambiguous input. Each: `{question, context, options}`. Null if input was unambiguous. |
| `cluster_priors` | object | Cluster-level priors for the suggested cluster (§31). |

**Confidence scoring:**
- `>= 0.9` — High confidence, agent can auto-accept.
- `0.7–0.89` — Good confidence, agent should present to user for confirmation.
- `0.5–0.69` — Moderate confidence, agent should ask user to verify.
- `< 0.5` — Low confidence, agent should present alternatives and ask user to choose.

**Example request:**
```json
{
  "natural_language": "I'm a freelance React developer in Denver, 5 years experience, looking for contract work at $100/hr",
  "cluster_hint": "hiring"
}
```

**Example response:**
```json
{
  "suggested_cluster": {
    "cluster_id": "hiring.engineering.frontend",
    "display_name": "Frontend Engineering Hiring",
    "confidence": 0.92,
    "alternatives": [
      {"cluster_id": "hiring.engineering.fullstack", "display_name": "Full-Stack Engineering Hiring", "confidence": 0.78, "reason": "React developers often do full-stack work"},
      {"cluster_id": "services.development.web", "display_name": "Web Development Services", "confidence": 0.65, "reason": "Freelance/contract work also fits services clusters"}
    ]
  },
  "suggested_role": {"role_id": "candidate", "confidence": 0.95},
  "parsed_traits": [
    {"trait_key": "work.primary_skill", "value": "React", "value_type": "string", "visibility": "public", "confidence": 0.98, "source_text": "React developer"},
    {"trait_key": "work.years_experience", "value": 5, "value_type": "number", "visibility": "public", "confidence": 0.95, "source_text": "5 years experience"},
    {"trait_key": "general.location_city", "value": "Denver", "value_type": "string", "visibility": "public", "confidence": 0.99, "source_text": "in Denver"},
    {"trait_key": "work.hourly_rate_usd", "value": 100, "value_type": "number", "visibility": "after_interest", "confidence": 0.97, "source_text": "$100/hr"},
    {"trait_key": "work.engagement_type", "value": "contract", "value_type": "enum", "visibility": "public", "confidence": 0.90, "source_text": "contract work"}
  ],
  "parsed_preferences": [],
  "additional_traits_suggested": [
    {"trait_key": "work.languages", "display_name": "Programming Languages", "value_type": "array", "population_coverage": 0.85, "signal_strength": 0.7, "prompt": "What programming languages do you work with?"},
    {"trait_key": "work.remote_preference", "display_name": "Remote Work Preference", "value_type": "enum", "population_coverage": 0.80, "signal_strength": 0.6, "prompt": "Do you prefer remote, hybrid, or on-site work?"}
  ],
  "registration_template": {
    "protocol_version": "3.0",
    "cluster_id": "hiring.engineering.frontend",
    "role": "candidate",
    "traits": [
      {"key": "work.primary_skill", "value": "React", "value_type": "string", "visibility": "public"},
      {"key": "work.years_experience", "value": 5, "value_type": "number", "visibility": "public"},
      {"key": "general.location_city", "value": "Denver", "value_type": "string", "visibility": "public"},
      {"key": "work.hourly_rate_usd", "value": 100, "value_type": "number", "visibility": "after_interest"},
      {"key": "work.engagement_type", "value": "contract", "value_type": "enum", "visibility": "public"}
    ],
    "preferences": [],
    "intents": ["Freelance React developer seeking contract work"]
  },
  "clarification_needed": null
}
```

**Error codes:** `INVALID_INPUT`, `NL_PARSE_FAILED`.

### 6.2 Operation: `schelling.register`

**Group:** Core. **Authentication:** None (initial) or Bearer token (re-registration).

Register a new participant or re-register an existing one. If the specified `cluster_id` does not exist, the cluster is created implicitly (§4.2).

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `protocol_version` | string | Yes | Must be `"3.0"`. |
| `cluster_id` | string | Yes | Primary cluster. Created implicitly if new. |
| `role` | string | No | Role within the cluster. Default: cluster's default role. |
| `funnel_mode` | string | No | Funnel mode: `"bilateral"` (default), `"broadcast"`, `"group"`, `"auction"`. See §9. |
| `group_size` | integer | No | For `"group"` mode: target group size (including organizer). Range: 2–50. Required when `funnel_mode` is `"group"`. |
| `auto_fill` | boolean | No | For `"group"` mode: auto-form the group when `group_size` qualified participants express interest. Default: `true`. If `false`, organizer manually approves each member. |
| `group_deadline` | string | No | For `"group"` mode: ISO 8601 deadline. If group is not filled by this time, current members are notified and can proceed with a partial group. |
| `traits` | array of Trait | Conditional | At least 1 trait required (unless `natural_language` is provided). Maximum 200 traits. |
| `preferences` | array of Preference | No | Maximum 100 preferences. |
| `natural_language` | string | No | Natural language description. Server parses into traits/preferences (§7). If both `natural_language` and `traits` are provided, explicit traits take precedence and NL fills gaps. |
| `intent_embedding` | array of 16 floats | No | Intent vector (§32). |
| `intents` | array of strings | No | Natural-language intent descriptions. Max 5. |
| `personality_embedding` | array of floats | No | From personality embedding tool. |
| `appearance_embedding` | array of floats | No | From appearance embedding tool. |
| `text_profile` | object | No | Free-text profile fields (description, seeking, interests, values_text). |
| `identity` | object | No | Name, contact, phone_hash. |
| `media_refs` | array of strings | No | Photo/media URLs. Max 20. |
| `agent_model` | string | No | Agent software identifier. |
| `agent_capabilities` | array of Capability | No | Agent capabilities (§23). Max 50. |
| `agent_attestation` | object | No | Agent attestation metadata. |
| `status` | string | No | Initial status. Default: `"active"`. |
| `user_token` | string | No | For re-registration. If provided, replaces existing profile. |
| `idempotency_key` | string | No | Idempotency key. |

**Agent attestation sub-object:**

| Field | Type | Description |
|---|---|---|
| `model` | string | Agent model identifier. |
| `method` | string | How trait data was collected. |
| `interaction_hours` | number | Hours of interaction with the user. |
| `generated_at` | string | ISO 8601 timestamp. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `user_token` | string | Bearer token for this participant. Store securely. |
| `protocol_version` | string | `"3.0"`. |
| `cluster_id` | string | Assigned cluster. |
| `cluster_created` | boolean | Whether this registration created a new cluster. |
| `cluster_affinities` | object | Cosine similarity to cluster centroids (if intent_embedding provided). |
| `trait_count` | integer | Number of traits stored. |
| `preference_count` | integer | Number of preferences stored. |
| `profile_completeness` | float | Estimated profile completeness for this cluster (0.0–1.0). |
| `suggested_additions` | array of string | Trait keys that would improve profile quality. |
| `nl_parsed` | object \| null | If `natural_language` was provided: the parsed structured form. `{traits: [...], preferences: [...], intents: [...]}`. Null if no NL input. |

**Validation rules:**

1. `protocol_version` must be `"3.0"`.
2. `cluster_id` must conform to naming rules (§4.3). If it doesn't exist, it is created.
3. `role` must be valid for the specified cluster (if the cluster already has established roles). For new clusters, any role string is accepted.
4. At least 1 trait is required (from explicit `traits` or parsed from `natural_language`). Each trait must have valid `key`, `value`, `value_type`, and `visibility`.
5. Trait keys must be unique within a profile. Duplicate keys return `INVALID_INPUT`.
6. Preference `trait_key` values do not need to reference traits in the participant's own profile — they reference traits in OTHER participants' profiles.
7. Preference weights must be in [0.0, 1.0].
8. If `intent_embedding` is provided, it must have exactly 16 elements, all finite floats in [-1.0, 1.0], L2 norm ≥ 0.5, and at least 3 dimensions with |value| > 0.1.
9. If `user_token` is provided (re-registration), the existing profile is fully replaced. All candidate records, reputation, and history are preserved. Traits and preferences are replaced atomically.
10. Re-registration with active commitments in an exclusive-commitment cluster returns `ACTIVE_COMMITMENT`.
11. `funnel_mode` must be one of `"bilateral"`, `"broadcast"`, `"group"`, `"auction"`. If `"group"`, `group_size` is required.
12. **Per-identity registration limit:** Each identity (`phone_hash`) is limited to **20 active registrations** across all clusters. Anonymous users (no `phone_hash`) are limited to **5 active registrations** total (tracked by IP + agent fingerprint). Exceeding this returns `MAX_REGISTRATIONS`.
13. **Age-restricted clusters:** If the target cluster has `age_restricted: true` (§4.8), the participant MUST have at least one age-related trait (e.g., `general.age`, `dating.age`) with verification tier `"self_verified"` or higher. If not present, registration succeeds but the participant cannot advance past DISCOVERED until age verification is provided. The server returns `age_verification_needed: true` in the response.

**Error codes:** `VERSION_MISMATCH`, `INVALID_CLUSTER_ID`, `INVALID_ROLE`, `INVALID_INPUT`, `INVALID_INTENT_EMBEDDING`, `ACTIVE_COMMITMENT`, `NL_PARSE_FAILED`, `MAX_REGISTRATIONS`, `AGE_VERIFICATION_REQUIRED`.

### 6.3 Operation: `schelling.update`

**Group:** Core. **Authentication:** Bearer token.

Update specific fields of an existing profile without full re-registration.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `traits` | array of Trait | No | Traits to add or update. Matched by `key`. |
| `remove_traits` | array of string | No | Trait keys to remove. |
| `preferences` | array of Preference | No | Preferences to add or update. Matched by `trait_key`. |
| `remove_preferences` | array of string | No | Preference trait_keys to remove. |
| `natural_language` | string | No | Natural language update description. Server parses into trait/preference updates (§7). |
| `text_profile` | object | No | Updated text profile fields (partial update). |
| `intent_embedding` | array of 16 floats | No | Updated intent vector. |
| `intents` | array of strings | No | Updated intent descriptions. |
| `personality_embedding` | array of floats | No | Updated personality vector. |
| `appearance_embedding` | array of floats | No | Updated appearance vector. |
| `media_refs` | array of strings | No | Updated media URLs. |
| `agent_model` | string | No | Updated agent model. |
| `agent_capabilities` | array of Capability | No | Updated agent capabilities. |
| `status` | string | No | Updated status. |
| `funnel_mode` | string | No | Updated funnel mode. |
| `group_size` | integer | No | Updated group size (for group mode). |
| `auto_fill` | boolean | No | Updated auto-fill setting (for group mode). |
| `group_deadline` | string | No | Updated group deadline (for group mode). |
| `auto_interest_opt_out` | boolean | No | Updated auto-interest opt-out setting. |
| `behavioral_inference_opt_out` | boolean | No | Updated behavioral inference opt-out setting. |
| `identity` | object | No | Updated identity information. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `updated` | boolean | Always `true` on success. |
| `trait_count` | integer | Total traits after update. |
| `preference_count` | integer | Total preferences after update. |
| `profile_completeness` | float | Updated completeness score. |
| `nl_parsed` | object \| null | If `natural_language` was provided: the parsed updates. |

**Behavior:**
- Traits are upserted by `key`. Providing a trait with an existing key replaces it.
- Preferences are upserted by `trait_key`. Providing a preference with an existing `trait_key` replaces it.
- `remove_traits` and `remove_preferences` are processed before additions.
- The server MUST enforce a minimum of 1 trait after the update. If `remove_traits` would remove all traits and no new traits are being added, the operation returns `INVALID_INPUT` with message "At least 1 trait is required."
- Updating `intent_embedding` recalculates cluster affinities.
- Updating traits or preferences that affect active candidate pairs does NOT automatically recalculate rankings. The server will recalculate on the next search or when the learned model runs its update cycle.
- If `natural_language` is provided alongside explicit trait/preference changes, explicit changes take precedence. NL-parsed changes fill gaps only.

**Error codes:** `USER_NOT_FOUND`, `INVALID_INPUT`, `INVALID_INTENT_EMBEDDING`, `USER_PAUSED`, `ACTIVE_COMMITMENT`, `NL_PARSE_FAILED`.

### 6.4 Operation: `schelling.refresh`

**Group:** Core. **Authentication:** Bearer token.

Reset the staleness clock without changing any data. Use when the profile is still accurate but approaching staleness thresholds.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `refreshed_at` | string | ISO 8601 timestamp. |
| `next_refresh_due` | string | ISO 8601 timestamp when refresh should be called again. |

**Rate limiting:** 1 per 30 days.

**Error codes:** `USER_NOT_FOUND`, `RATE_LIMITED`.

---

## 7. Natural Language Interface Layer

### 7.1 Overview

Every major Schelling operation accepts an optional `natural_language` field as an alternative to (or supplement for) structured input. The NL layer is **syntactic sugar** — it generates the same structured operations underneath. This lowers the integration barrier: agents don't need to understand the full trait/preference schema to use the protocol.

### 7.2 How It Works

1. Agent submits a request with `natural_language` field (and optionally structured fields).
2. Server parses the natural language using its NLP pipeline + cluster norms + learned schemas.
3. Server generates equivalent structured input (traits, preferences, filters, etc.).
4. Server executes the operation using the structured form.
5. Server returns BOTH the parsed structured form AND the operation results.
6. Agent can verify the parsing was correct and correct any misinterpretations.

### 7.3 NL-Enabled Operations

The following operations support the `natural_language` field:

| Operation | NL field parses into |
|---|---|
| `schelling.onboard` (§6.1) | Cluster suggestion, traits, preferences |
| `schelling.register` (§6.2) | Traits, preferences, intents |
| `schelling.update` (§6.3) | Trait updates, preference updates |
| `schelling.search` (§10.1) | Trait filters, preference overrides, intent description |
| `schelling.quick_seek` (§11.2) | Full fast-path parameters |
| `schelling.quick_offer` (§11.3) | Full fast-path parameters |

### 7.4 Parsing Behavior

**Precedence:** When both `natural_language` and structured fields are provided:
1. Explicit structured fields always take precedence.
2. NL-parsed fields fill gaps (traits/preferences not covered by explicit input).
3. Conflicts are resolved in favor of explicit input.

**Cluster context:** The NL parser uses the target cluster's norms and trait schemas to improve parsing accuracy. A phrase like "5 years experience" in a `hiring.*` cluster maps to `work.years_experience: 5`, while in a `services.*` cluster it maps to `services.years_in_business: 5`.

**Confidence thresholds:** Each NL-parsed field includes a confidence score:
- `>= 0.8`: Auto-applied to the operation.
- `0.5–0.79`: Applied but flagged in the response for agent review.
- `< 0.5`: Not applied. Returned in `clarification_needed` for the agent to resolve.

### 7.5 Clarification Protocol

When NL parsing is ambiguous, the server returns a `clarification_needed` array instead of (or alongside) results:

```json
{
  "clarification_needed": [
    {
      "question": "Did you mean $100/hour or $100,000/year?",
      "context": "Parsed '$100' from 'looking for work at $100'",
      "field": "work.hourly_rate_usd",
      "options": [
        {"label": "$100/hour", "value": {"trait_key": "work.hourly_rate_usd", "value": 100}},
        {"label": "$100,000/year", "value": {"trait_key": "work.salary_usd", "value": 100000}}
      ]
    }
  ]
}
```

The agent resolves clarifications by resubmitting with explicit structured fields.

### 7.6 NL Response Format

Every operation that processes NL input includes an `nl_parsed` field in the response:

```json
{
  "nl_parsed": {
    "input_text": "a React developer in Mountain Time, $80-120/hr, available next week",
    "traits": [
      {"trait_key": "work.primary_skill", "value": "React", "confidence": 0.97, "source_span": "React developer"},
      {"trait_key": "work.timezone", "value": "America/Denver", "confidence": 0.85, "source_span": "Mountain Time"},
      {"trait_key": "work.hourly_rate_min_usd", "value": 80, "confidence": 0.92, "source_span": "$80-120/hr"},
      {"trait_key": "work.hourly_rate_max_usd", "value": 120, "confidence": 0.92, "source_span": "$80-120/hr"}
    ],
    "preferences": [
      {"trait_key": "work.available_date", "operator": "lte", "value": "2026-03-04", "weight": 0.8, "confidence": 0.70, "source_span": "available next week"}
    ],
    "warnings": ["'available next week' interpreted as before 2026-03-04. Verify this date."],
    "unparsed_segments": []
  }
}
```

### 7.7 Error Handling

| Scenario | Behavior |
|---|---|
| NL input is completely unparseable | Return `NL_PARSE_FAILED` error with `suggestions` field |
| NL input is partially parseable | Parse what's possible, return `clarification_needed` for the rest |
| NL + structured input conflict | Structured input wins, NL-conflicting fields noted in `nl_parsed.warnings` |
| No NL support on server | Return `FEATURE_NOT_SUPPORTED` error |

### 7.8 NL Input Security

Natural language input is **untrusted user content** — it MUST NOT be treated as instructions to the server. The following security requirements apply to all NL processing:

1. **Structured extraction only.** NL parsing MUST be implemented as structured data extraction (extracting traits, preferences, intent from text), never as instruction-following. The NL pipeline MUST NOT execute commands, grant permissions, or modify server state beyond the operation being performed.
2. **Same validation.** NL-parsed output MUST pass the same validation rules as structured input (§6.2). The NL parser cannot grant elevated privileges, verification tiers, rate limit overrides, or bypass any protocol constraint.
3. **Independent confidence.** NL-parsed confidence scores MUST be computed by the server's parsing pipeline independently of the input text. The input text MUST NOT be able to influence its own confidence score (e.g., "VERY CONFIDENT: my height is 72" should not increase the confidence on the height extraction).
4. **Input sanitization.** Servers SHOULD sanitize NL input: strip control characters (U+0000–U+001F except newlines), limit to printable Unicode + common whitespace, and detect injection patterns (e.g., "SYSTEM:", "OVERRIDE:", "IGNORE PREVIOUS"). Detected patterns SHOULD be stripped and flagged in `nl_parsed.warnings`.
5. **Rate limit parity.** NL-parsed preferences (whether from `schelling.search`, `schelling.update`, or any other NL-enabled operation) count toward the same rate limits as structured input. Specifically, NL-parsed preference changes count toward the 20/hr preference update rate limit (§26.10). This prevents NL as a side channel to bypass structured rate limits.
6. **Address detection.** NL parser SHOULD detect address patterns (street addresses, zip codes) in input text and automatically set the visibility of extracted location traits to `"after_connect"` or `"private"`, with a warning in `nl_parsed.warnings`. Addresses should not default to `"public"` visibility.

---

## 8. Funnel Stages & State Machine

### 8.1 Stage Definitions

The funnel has four stages. Each participant in a candidate pair has an independent stage.

| Stage | Value | Name | Description |
|---|---|---|---|
| 1 | `DISCOVERED` | Discovered | The participant is aware of the other party. Entered via `schelling.search`. |
| 2 | `INTERESTED` | Interested | The participant has expressed interest. Entered via `schelling.interest`. |
| 3 | `COMMITTED` | Committed | The participant has committed. Entered via `schelling.commit`. |
| 4 | `CONNECTED` | Connected | Mutual commitment achieved. Both parties at stage 3+. Automatically elevated by server. |

**Stage state machine (per-participant, bilateral mode):**

```
                 search
                   │
                   ▼
             ┌─────────────┐
             │  DISCOVERED  │──── decline ────→ (removed / TTL)
             │     (1)      │
             └──────┬───────┘
                    │ interest
                    ▼
             ┌─────────────┐
             │  INTERESTED  │──── decline ────→ (removed / TTL)
             │     (2)      │
             └──────┬───────┘
                    │ commit
                    ▼
             ┌─────────────┐
             │  COMMITTED   │──── withdraw ───→ back to INTERESTED
             │     (3)      │
             └──────┬───────┘
                    │ both committed → server auto-elevates
                    ▼
             ┌─────────────┐
             │  CONNECTED   │──── report outcome ──→ (funnel complete)
             │     (4)      │
             └─────────────┘
```

For non-bilateral funnel modes (broadcast, group, auction), see §9.

### 8.2 Stage Transitions

**Key invariants:**
1. Stages only advance, never retreat (except withdraw: COMMITTED → INTERESTED).
2. A participant cannot skip stages. DISCOVERED → INTERESTED → COMMITTED → CONNECTED.
3. CONNECTED requires BOTH parties to reach COMMITTED. The server auto-elevates both to CONNECTED when this condition is met.
4. Each participant's stage is independent until CONNECTED.
5. Stage transitions are atomic. The server MUST serialize concurrent operations on the same candidate pair using optimistic concurrency control or database-level locking.

**Concurrent operation semantics:**

| Operation A | Operation B (simultaneous) | Resolution |
|---|---|---|
| `interest` (party 1) | `interest` (party 2) | Both succeed. Mutual interest achieved. |
| `commit` (party 1) | `commit` (party 2) | Both succeed. Auto-elevate to CONNECTED. |
| `decline` (party 1) | `commit` (party 2) | Whichever is serialized first wins. If decline processes first, commit returns `CANDIDATE_NOT_FOUND` (candidate removed). If commit processes first, decline still succeeds (declining a committed candidate is valid). |
| `decline` (party 1) | `interest` (party 2) | Same serialization logic as above. |
| `withdraw` (party 1) | `commit` (party 2) | If withdraw processes first, commit returns `STAGE_VIOLATION` (other party no longer committed). If commit processes first, auto-elevate to CONNECTED occurs, then withdraw processes (see §8.7 for withdraw from CONNECTED). |

**Idempotent stage advancement:** Calling a stage-advancing operation when the caller is already at or past the target stage is a no-op that returns the current state. For example, calling `schelling.interest` when already at INTERESTED returns `your_stage: 2` without error. This prevents duplicate-request failures in unreliable networks.

### 8.3 Operation: `schelling.interest`

**Group:** Funnel. **Authentication:** Bearer token.

Express interest in a candidate. Advances the caller from DISCOVERED to INTERESTED.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair ID. |
| `contract_proposal` | object | Conditional | **Required when the candidate's `funnel_mode` is `"auction"`.** The bid, conforming to the contract proposal schema (§17.3). Contains `terms` (object, required), `type` (string, required), `milestones` (array, optional), `expires_at` (string, optional). Returns `INVALID_INPUT` if the candidate is in auction mode and no proposal is provided. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `candidate_id` | string | The candidate pair. |
| `your_stage` | integer | Caller's new stage (2). |
| `their_stage` | integer | Other party's current stage. |
| `mutual_interest` | boolean | Whether both parties are now at INTERESTED or higher. |
| `newly_visible_traits` | array of Trait | Other party's traits that became visible at this stage (see §13). |
| `contract_id` | string \| null | If auction mode: the contract ID created from the bid. Null for non-auction modes. |
| `interest_expires_at` | string \| null | For group mode: ISO 8601 timestamp when this interest expression expires (72 hours from now). The participant must refresh interest before this time or they are removed from the group queue. Null for non-group modes. |

**Group mode interest expiry:** In group mode, interest expressions expire after **72 hours** to prevent inactive participants from blocking group formation. Expired participants are removed from the group queue. Participants can refresh interest by calling `schelling.interest` again (idempotent — resets the 72-hour clock). The group organizer can also manually remove inactive members via `schelling.decline`.

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`, `USER_PAUSED`, `GROUP_FULL` (group mode: group has reached target size), `AUCTION_CLOSED` (auction mode: auction is no longer accepting bids).

### 8.4 Operation: `schelling.commit`

**Group:** Funnel. **Authentication:** Bearer token.

Commit to a candidate. Advances the caller from INTERESTED to COMMITTED. If both parties are COMMITTED, the server auto-elevates to CONNECTED.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair ID. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `candidate_id` | string | The candidate pair. |
| `your_stage` | integer | Caller's new stage. |
| `their_stage` | integer | Other party's current stage. |
| `connected` | boolean | Whether both parties are now CONNECTED (stage 4). |
| `newly_visible_traits` | array of Trait | Traits newly visible at this stage. |

**Exclusive commitment clusters:** If the cluster has `exclusive_commitment: true`, committing to one candidate prevents committing to others until the commitment is withdrawn or the match completes.

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`, `ACTIVE_COMMITMENT`, `USER_PAUSED`.

### 8.5 Operation: `schelling.decline`

**Group:** Funnel. **Authentication:** Bearer token.

Decline a candidate. Removes them from the active candidate pool with a TTL.

**Stage gating:** Decline is available at stages DISCOVERED (1), INTERESTED (2), and COMMITTED (3). At CONNECTED (4), use `schelling.report` to report the outcome or `schelling.withdraw` to break the connection. Calling decline at CONNECTED returns `STAGE_VIOLATION`.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair ID. |
| `reason` | string | No | Rejection reason code. One of: `"not_interested"`, `"dealbreaker"`, `"timing"`, `"logistics"`, `"other"`. |
| `feedback` | object | No | Structured feedback. See §30.6. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `declined` | boolean | Always `true`. |
| `decline_count` | integer | Total declines of this specific person. |
| `permanent` | boolean | Whether this decline is permanent (3+ declines of the same person). |
| `expires_at` | string \| null | ISO 8601 expiry timestamp, or null if permanent. |

**TTL escalation:**

| Decline count | TTL |
|---|---|
| 1st | 30 days |
| 2nd | 90 days |
| 3rd+ | Permanent (no reconsideration) |

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `ALREADY_DECLINED`.

### 8.6 Operation: `schelling.reconsider`

**Group:** Funnel. **Authentication:** Bearer token.

Reconsider a previously declined candidate, if the decline has not expired and is not permanent.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair ID. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `reconsidered` | boolean | Always `true`. |
| `your_stage` | integer | Caller's current stage (reset to DISCOVERED). |

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `NO_ACTIVE_DECLINE`, `PERMANENT_DECLINE`.

**Rate limiting:** 10 per day.

### 8.7 Operation: `schelling.withdraw`

**Group:** Funnel. **Authentication:** Bearer token.

Withdraw a commitment. Returns the caller from COMMITTED or CONNECTED back to INTERESTED.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair ID. |
| `reason` | string | No | Reason for withdrawal. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `withdrawn` | boolean | Always `true`. |
| `your_stage` | integer | Caller's new stage (2 = INTERESTED). |

**Withdrawal from CONNECTED:** If both parties were CONNECTED and one withdraws, both parties revert: the withdrawer goes to INTERESTED (stage 2), and the other party goes back to COMMITTED (stage 3). The connection is broken. Any active contracts are set to `"terminated"` with reason `"withdrawal"`. Pending deliverables (delivered but not yet accepted/rejected) are cancelled with status `"cancelled_withdrawal"`. Accepted deliverables are unaffected. Message relay is disabled until reconnection.

**Stage gating:** Withdraw is valid at COMMITTED (3) or CONNECTED (4). Calling withdraw at DISCOVERED (1) or INTERESTED (2) returns `STAGE_VIOLATION`.

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`.

### 8.8 Operation: `schelling.report`

**Group:** Funnel. **Authentication:** Bearer token.

Report the outcome of a connection. Available at CONNECTED stage.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair ID. |
| `outcome` | string | Yes | One of: `"positive"`, `"neutral"`, `"negative"`. |
| `feedback` | object | No | Structured feedback (§30.6). |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `reported` | boolean | Always `true`. |
| `reported_at` | string | ISO 8601 timestamp. |

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`, `ALREADY_REPORTED`.

### 8.9 Operation: `schelling.connections`

**Group:** Funnel. **Authentication:** Bearer token.

List all candidate pairs for the caller, optionally filtered by stage.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `stage_filter` | integer | No | Filter to candidates at this stage or higher. |
| `cluster_filter` | string | No | Filter to a specific cluster. |
| `mode_filter` | string | No | Filter by funnel mode. |
| `limit` | integer | No | Max results. Default: 50. Max: 200. |
| `cursor` | string | No | Pagination cursor. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `candidates` | array of CandidateRecord | Candidate pairs. |
| `total` | integer | Total candidates matching filter. |
| `next_cursor` | string \| null | Pagination cursor. |

**CandidateRecord schema:**

| Field | Type | Description |
|---|---|---|
| `candidate_id` | string | Candidate pair ID. |
| `your_stage` | integer | Caller's stage. |
| `their_stage` | integer | Other party's stage. |
| `cluster_id` | string | Cluster. |
| `funnel_mode` | string | Funnel mode for this pair. |
| `advisory_score` | float | Server's advisory combined score (quantized to 2 dp at DISCOVERED; full precision at INTERESTED+). |
| `your_fit` | float | How well they fit your preferences. |
| `their_fit` | float | How well you fit their preferences. |
| `intent_similarity` | float | Intent embedding similarity (if both have intent embeddings). |
| `visible_traits` | array of Trait | The other party's traits visible at your current stage (§13). |
| `intents` | array of string | The other party's intent descriptions. |
| `agent_capabilities` | array of Capability | The other party's agent capabilities. |
| `reputation_score` | float | The other party's reputation. |
| `verification_summary` | object | Summary of the other party's verification levels. |
| `stale` | boolean | Whether the other party's profile is stale (>180 days). |
| `computed_at` | string | ISO 8601 timestamp of last score computation. |
| `updated_at` | string | ISO 8601 timestamp of last state change. |

### 8.10 Operation: `schelling.pending`

**Group:** Core. **Authentication:** Bearer token.

List pending actions for the caller (new messages, jury duty, inquiries, contracts, deliverables, etc.).

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `actions` | array of PendingAction | Pending actions. |

**PendingAction schema:**

| Field | Type | Description |
|---|---|---|
| `action_type` | string | Type: `"new_message"`, `"new_inquiry"`, `"new_contract"`, `"new_event"`, `"event_ack_required"`, `"contract_amendment"`, `"jury_duty"`, `"mutual_interest"`, `"mutual_commit"`, `"profile_refresh"`, `"enforcement_notice"`, `"new_deliverable"`, `"delivery_accepted"`, `"delivery_rejected"`, `"group_filled"`, `"auction_bid"`, `"broadcast_response"`. |
| `candidate_id` | string \| null | Associated candidate pair, if applicable. |
| `details` | object | Action-specific details. |
| `created_at` | string | ISO 8601 timestamp. |

---

## 9. Funnel Modes: Bilateral, Broadcast, Group & Auction

### 9.1 Overview

The default funnel assumes **bilateral mutual evaluation**: two parties discover each other, progressively evaluate, and mutually commit. This works well for high-stakes scenarios (dating, hiring) but is cumbersome for simpler cases.

Version 3 adds three additional funnel **modes** that alter the evaluation pattern. These are funnel VARIANTS, not replacements — the bilateral funnel remains the default and is appropriate for most use cases.

### 9.2 Mode Selection

Funnel mode is set per-registration via the `funnel_mode` field:

| Mode | Value | Description | Use case |
|---|---|---|---|
| **Bilateral** | `"bilateral"` | Default. Mutual evaluation through all stages. Both parties must independently advance. | Dating, hiring, roommates, mentorship |
| **Broadcast** | `"broadcast"` | "I need X" → multiple respondents → requester picks best. Requester evaluates; responders just need to meet criteria. | "I need a plumber by Thursday", job postings, RFPs |
| **Group** | `"group"` | "I need N people for Y" → accumulate qualified participants until group is full. | Pickup basketball, group projects, dinner reservations, study groups |
| **Auction** | `"auction"` | Multiple parties competing on price/terms for a single opportunity. | Contractor bidding, freelance work, service pricing |

### 9.3 Broadcast Mode

In broadcast mode, the **requester** is the evaluator. Respondents opt in by expressing interest, but they do not evaluate the requester.

**Broadcast funnel:**
```
Requester registers with funnel_mode="broadcast"
  │
  ├── Respondent A discovers → expresses interest (opts in)
  ├── Respondent B discovers → expresses interest (opts in)
  ├── Respondent C discovers → expresses interest (opts in)
  │
  └── Requester reviews all respondents → selects best → commits to one
      │
      └── Selected respondent auto-elevated to CONNECTED
          (other respondents receive "not_selected" notification)
```

**Key differences from bilateral:**
- Respondents do NOT set preferences against the requester. They opt in or not.
- Only the requester advances candidates through the funnel.
- The requester can commit to one respondent without the respondent needing to independently commit (respondent's interest is sufficient consent).
- When the requester commits, the selected respondent is auto-elevated to CONNECTED.
- Non-selected respondents receive a `"not_selected"` pending action and their candidate pair stage is reset.

**Stage semantics in broadcast mode:**

| Stage | Requester | Respondent |
|---|---|---|
| DISCOVERED | Aware of respondent | Aware of request (via search/subscription) |
| INTERESTED | Reviewing respondent | Opted in to be considered |
| COMMITTED | Selected this respondent | N/A (auto-elevated) |
| CONNECTED | Match made | Match made |

### 9.4 Group Formation Mode

In group mode, the **organizer** seeks to fill a group of N participants. Participants join by expressing interest and meeting criteria. The group auto-forms when enough qualified participants accumulate.

**Group funnel:**
```
Organizer registers with funnel_mode="group", group_size=5
  │
  ├── Participant A discovers → expresses interest (joins queue)
  ├── Participant B discovers → expresses interest (joins queue)
  ├── Participant C discovers → expresses interest (joins queue)
  ├── Participant D discovers → expresses interest (joins queue)
  ├── Participant E discovers → expresses interest (joins queue)
  │
  └── group_size reached → all participants auto-elevated to CONNECTED
      (all receive "group_filled" notification with member list)
```

**Key differences from bilateral:**
- No pairwise evaluation. Participants meet the organizer's criteria (preferences/hard filters) and join.
- The server manages the queue. When `group_size` qualified participants have expressed interest, the group auto-forms.
- All participants (including organizer) are elevated to CONNECTED simultaneously.
- After CONNECTED, participants can message each other (all-to-all, not just pairwise).
- The organizer MAY manually select from the queue if `auto_fill: false` is set on the registration. Otherwise, it's first-come-first-served among qualifying participants.

**Group-specific registration fields (also in `schelling.register` §6.2 and `schelling.update` §6.3):**

| Field | Type | Required | Description |
|---|---|---|---|
| `group_size` | integer | Yes (for group mode) | Target group size including organizer. Range: 2–50. |
| `auto_fill` | boolean | No | Whether to auto-form when `group_size` qualified participants express interest. Default: `true`. If `false`, organizer manually approves each member. |
| `group_deadline` | string | No | ISO 8601 deadline. If group is not filled by this time, current members are notified and can proceed with a partial group. |

**Group connections:** In group mode, when the group is formed, the server creates candidate pairs between ALL members (not just organizer↔member). For a group of 5, this creates 10 candidate pairs, all at CONNECTED.

### 9.5 Auction Mode

In auction mode, the **poster** creates an opportunity and **bidders** compete on price/terms.

**Auction funnel:**
```
Poster registers with funnel_mode="auction"
  │
  ├── Bidder A discovers → submits bid (via contract proposal)
  ├── Bidder B discovers → submits bid (via contract proposal)
  ├── Bidder C discovers → submits bid (via contract proposal)
  │
  └── Poster reviews bids → accepts best → CONNECTED with winner
      (other bidders receive "auction_closed" notification)
```

**Key differences from bilateral:**
- Bidders express interest AND submit a contract proposal in a single step (interest + propose).
- The poster reviews bids (contract proposals) and accepts one.
- Accepting a bid auto-elevates both parties to CONNECTED with the accepted contract active.
- Rejected bidders receive their contract proposals back with status `"rejected"`.
- The poster MAY set a deadline. When the deadline passes, the poster selects from received bids.

**Auction-specific behavior:**
- `schelling.interest` in auction mode MUST include a `contract_proposal` field (the bid).
- Bids are visible only to the poster, not to other bidders (sealed-bid auction).
- The poster can request counter-bids from specific bidders using `schelling.contract` with `action: "counter"`.

### 9.6 Mode Interaction Rules

| Rule | Description |
|---|---|
| Mode is per-registration | Each registration has one mode. A user can have multiple registrations in different modes. |
| Cross-mode search | Searches return candidates regardless of mode. Mode is visible in search results. |
| Mode-specific stage gating | Some operations behave differently per mode (documented in each operation). |
| Mode change | Can be changed via `schelling.update`. Active candidate pairs retain their original mode. |

---

## 10. Discovery & Search

### 10.1 Operation: `schelling.search`

**Group:** Discovery. **Authentication:** Bearer token.

Search for compatible candidates. The server returns an **advisory ranked list** using its learned ranking model. Agents receive this list and apply their own filters, reranking, and evaluation.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `cluster_id` | string | No | Cluster to search. Default: caller's primary cluster. |
| `top_k` | integer | No | Maximum results. Default: 50. Max: 200. |
| `threshold` | float | No | Minimum advisory score. Default: 0.0 (return all). Range: 0.0–1.0. |
| `trait_filters` | array of TraitFilter | No | Additional server-side trait filters beyond the caller's registered preferences. |
| `capability_filters` | array of string | No | Required agent capabilities. Conjunctive (AND). |
| `intent_filter` | string | No | Filter by intent description (substring match). |
| `mode_filter` | string | No | Filter by funnel mode. |
| `exclude_stale` | boolean | No | Exclude stale profiles. Default: `false`. |
| `natural_language` | string | No | Natural language search description. Parsed into trait_filters and/or preference overrides (§7). |
| `cursor` | string | No | Pagination cursor. |
| `idempotency_key` | string | No | Idempotency key. |

**TraitFilter schema (ad-hoc search-time filters):**

| Field | Type | Required | Description |
|---|---|---|---|
| `trait_key` | string | Yes | Trait to filter on. |
| `operator` | string | Yes | Same operators as preferences. |
| `value` | any | Yes | Target value. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `candidates` | array of SearchResult | Ranked candidate list. |
| `total_scanned` | integer | Total profiles evaluated. |
| `total_matches` | integer | Total profiles passing filters. |
| `ranking_explanation` | object | Explanation of how the ranking was generated (§12.4). |
| `next_cursor` | string \| null | Pagination cursor. |
| `pending_actions` | array of PendingAction | Caller's pending actions (convenience). |
| `nl_parsed` | object \| null | If `natural_language` was provided: the parsed search parameters. |

**SearchResult schema:**

| Field | Type | Description |
|---|---|---|
| `candidate_id` | string | Candidate pair ID (created if new). |
| `advisory_score` | float | Server's advisory combined score. Quantized to 2 dp at DISCOVERED. |
| `your_fit` | float | How well they fit your preferences. Quantized to 2 dp. |
| `their_fit` | float | How well you fit their preferences. Quantized to 2 dp. |
| `intent_similarity` | float \| null | Intent embedding cosine similarity (mapped to [0,1]). Null if either party lacks intent embedding. |
| `preference_satisfaction` | object | Per-preference satisfaction breakdown for the caller's preferences. |
| `visible_traits` | array of Trait | The candidate's traits visible at DISCOVERED stage (`"public"` visibility only). |
| `intents` | array of string | Candidate's intent descriptions. |
| `agent_capabilities` | array of Capability | Candidate's agent capabilities. |
| `reputation_score` | float | Candidate's reputation. Quantized to 2 dp. |
| `verification_summary` | object | Count of traits at each verification tier. |
| `funnel_mode` | string | Candidate's funnel mode. |
| `group_size` | integer \| null | For group mode: target group size. |
| `group_filled` | integer \| null | For group mode: current members. |
| `stale` | boolean | Whether the profile is stale. |
| `computed_at` | string | ISO 8601 timestamp. |

**preference_satisfaction object:**

Maps each of the caller's preference `trait_key` values to a satisfaction result:

```json
{
  "dating.height_inches": {"satisfied": true, "score": 0.85, "candidate_value": 71},
  "dating.has_kids": {"satisfied": true, "score": 1.0, "candidate_value": false},
  "work.years_react": {"satisfied": false, "score": 0.0, "missing": true}
}
```

| Field | Type | Description |
|---|---|---|
| `satisfied` | boolean | Whether the preference passes (binary). |
| `score` | float | Continuous satisfaction score [0,1]. |
| `candidate_value` | any \| null | The candidate's actual trait value (if visible at this stage). Null if trait exists but is not yet visible. |
| `missing` | boolean | True if the candidate does not have this trait. |

**Search algorithm overview:**

1. **Hard filter pass.** Exclude candidates who fail any of the caller's weight=1.0 preferences or search-time `trait_filters`.
2. **Soft preference scoring.** For remaining candidates, compute weighted preference satisfaction.
3. **Advisory model scoring.** Apply the learned ranking model (§12) which blends preference satisfaction with outcome-learned signals.
4. **Intent similarity.** If both parties have intent embeddings, compute cosine similarity and factor into advisory score.
5. **Embedding similarity.** If both parties have personality/appearance embeddings, compute similarity and factor in.
6. **Staleness penalty.** Apply visibility penalty for profiles older than 90 days.
7. **Rank and return.** Order by advisory score descending, truncate to `top_k`.

**Error codes:** `USER_NOT_FOUND`, `UNKNOWN_CLUSTER`, `INVALID_INPUT`, `USER_PAUSED`, `RATE_LIMITED`, `NL_PARSE_FAILED`.

### 10.2 Advisory Score Composition

The advisory score is the server's best estimate of match quality. It is **advisory** — agents receive it as one input among many and may rerank based on their own logic.

**Advisory score formula:**

```
advisory_score = sqrt(your_fit × their_fit)
```

Where `your_fit` = how well the candidate fits the caller's preferences, and `their_fit` = how well the caller fits the candidate's preferences. The geometric mean penalizes asymmetric fits.

**your_fit components (configurable weights, defaults below):**

| Component | Default weight | Description |
|---|---|---|
| Preference satisfaction | 0.40 | Weighted sum of preference scores (§3.5). |
| Personality embedding similarity | 0.15 | Cosine similarity of personality embeddings (if both exist). Default: 0.5 when missing. |
| Intent similarity | 0.10 | Cosine similarity of intent embeddings (if both exist). Default: 0.5 when missing. |
| Learned adjustment | 0.20 | Signal from the learned ranking model (§12). Default: 0.5 at cold start. |
| Collaborative signal | 0.10 | From collaborative filtering. Default: 0.5 when insufficient data. |
| Verification bonus | 0.05 | Higher for candidates with more verified traits. |

**Raw scores always available.** `your_fit` and `their_fit` are always returned alongside `advisory_score`. Agents MAY implement their own scoring entirely and use server results only for discovery.

---

## 11. Fast-Path Operations

### 11.1 Overview

The full funnel (register → search → interest → inquire → commit → connect → contract → deliver) is powerful but heavyweight. For commodity and simple cases ("I need a plumber by Thursday", "I'm available for tutoring"), fast-path operations compress the round-trips while using the full protocol underneath.

### 11.2 Operation: `schelling.quick_seek`

**Group:** Fast-path. **Authentication:** Bearer token or None (auto-registers).

One-call search that registers (if needed), searches, filters, ranks, and optionally auto-advances top candidates to INTERESTED.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | No | Bearer token. If omitted, a temporary registration is created. |
| `intent` | string | Yes | Natural language description of what's needed. Max 2,000 chars. |
| `cluster_id` | string | No | Cluster to search. Auto-detected from intent if omitted. |
| `constraints` | object | No | Structured constraints (trait filters). |
| `max_results` | integer | No | Maximum results. Default: 5. Max: 20. |
| `auto_advance` | boolean | No | If `true`, auto-advance top candidates to INTERESTED via `auto_interest` (see below). Default: `false`. |
| `deadline` | string | No | ISO 8601 deadline for urgency signaling. |
| `budget` | object | No | Budget constraints: `{min, max, currency}`. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `user_token` | string | Bearer token (new if auto-registered). |
| `cluster_id` | string | Cluster searched. |
| `candidates` | array of SearchResult | Ranked candidates with visible traits. |
| `total_matches` | integer | Total matches found. |
| `auto_advanced` | array of string | Candidate IDs auto-advanced to INTERESTED (if `auto_advance: true`). |
| `nl_parsed` | object | How the intent was parsed into structured form. |
| `registration_created` | boolean | Whether a new registration was created. |

**Auto-advance and consent:** When `auto_advance` is `true`, the interest signals are tagged as `auto_interest` (distinct from manual interest). Recipients who have set `auto_interest_opt_out: true` in their profile (§6.2) are skipped — they do not receive auto-advanced interest and are not included in the `auto_advanced` list. Auto-advanced interest signals are excluded from the learned ranking model's funnel advancement signals (§12.6) to prevent gaming.

**Under the hood:** `quick_seek` executes the following steps atomically:
1. If no `user_token`: call `schelling.onboard` → `schelling.register` with parsed traits/preferences.
2. Call `schelling.search` with parsed filters.
3. If `auto_advance`: call `schelling.interest` on top N candidates (excluding those with `auto_interest_opt_out: true`), tagged as `auto_interest`.
4. Return combined results.

**Example:**
```json
// Request
{
  "intent": "I need a plumber in Denver by Thursday, budget $100-200",
  "auto_advance": true,
  "max_results": 5
}

// Response
{
  "user_token": "tok_abc123...",
  "cluster_id": "services.plumbing.residential",
  "candidates": [...],
  "total_matches": 12,
  "auto_advanced": ["cand_001", "cand_002", "cand_003"],
  "nl_parsed": {
    "cluster": "services.plumbing.residential",
    "traits": [{"trait_key": "general.location_city", "value": "Denver"}],
    "preferences": [
      {"trait_key": "services.available_date", "operator": "lte", "value": "2026-02-27"},
      {"trait_key": "services.rate_usd", "operator": "range", "value": [100, 200]}
    ]
  },
  "registration_created": true
}
```

**Error codes:** `INVALID_INPUT`, `NL_PARSE_FAILED`, `RATE_LIMITED`.

### 11.3 Operation: `schelling.quick_offer`

**Group:** Fast-path. **Authentication:** Bearer token or None (auto-registers).

One-call registration + subscription to relevant seekers. For service providers, sellers, and anyone making themselves available.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | No | Bearer token. If omitted, a new registration is created. |
| `intent` | string | Yes | Natural language description of what's offered. Max 2,000 chars. |
| `cluster_id` | string | No | Cluster. Auto-detected from intent if omitted. |
| `traits` | object | No | Structured traits to register. |
| `available_until` | string | No | ISO 8601 availability deadline. |
| `auto_subscribe` | boolean | No | If `true`, create a subscription for matching seekers. Default: `true`. |
| `notification_threshold` | float | No | Minimum advisory score for notifications. Default: 0.5. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `user_token` | string | Bearer token. |
| `cluster_id` | string | Cluster registered in. |
| `profile_completeness` | float | Profile completeness score. |
| `subscription_id` | string \| null | Subscription ID if `auto_subscribe: true`. |
| `existing_matches` | array of SearchResult | Current seekers that match the offer. |
| `nl_parsed` | object | How the intent was parsed. |
| `registration_created` | boolean | Whether a new registration was created. |

**Under the hood:** `quick_offer` executes:
1. If no `user_token`: call `schelling.onboard` → `schelling.register` with parsed traits.
2. Call `schelling.search` to find current matching seekers.
3. If `auto_subscribe`: call `schelling.subscribe` with appropriate filters.
4. Return combined results.

**Error codes:** `INVALID_INPUT`, `NL_PARSE_FAILED`, `RATE_LIMITED`.

### 11.4 Operation: `schelling.quick_match`

**Group:** Fast-path. **Authentication:** None.

For bilateral simple cases where both sides know what they want. Submits both a seek and an offer simultaneously and attempts immediate matching.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `seek` | object | Yes | Seeker profile: `{intent, traits, preferences, cluster_id?}`. |
| `offer` | object | Yes | Offerer profile: `{intent, traits, cluster_id?}`. |
| `auto_connect` | boolean | No | If `true` and a match is found, auto-advance to CONNECTED. Default: `false`. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `matched` | boolean | Whether the seek and offer are mutually compatible. |
| `seek_token` | string | Bearer token for the seeker. |
| `offer_token` | string | Bearer token for the offerer. |
| `cluster_id` | string | Cluster both were registered in. |
| `advisory_score` | float | Mutual compatibility score. |
| `candidate_id` | string | Candidate pair ID (created). |
| `connected` | boolean | Whether auto-connected (if `auto_connect: true` and matched). |
| `seek_parsed` | object | Parsed seek profile. |
| `offer_parsed` | object | Parsed offer profile. |

**Use case:** Two agents that already know they want to match (e.g., a user's personal agent connecting them with a service provider's agent) can skip the full funnel.

**Progressive disclosure constraint:** `auto_connect` is only permitted when BOTH the seek and offer profiles contain no traits with visibility tiers stricter than `"public"` (i.e., no `"after_interest"`, `"after_commit"`, `"after_connect"`, or `"private"` traits). If either profile has non-public traits, `auto_connect` returns `PROGRESSIVE_DISCLOSURE_CONFLICT` — the agents must proceed through the standard funnel to respect the progressive disclosure mechanism. Agents that want to use `auto_connect` with non-public traits must first update those traits to `"public"` visibility, explicitly consenting to full immediate disclosure.

**Error codes:** `INVALID_INPUT`, `NL_PARSE_FAILED`, `INCOMPATIBLE_CLUSTERS`, `PROGRESSIVE_DISCLOSURE_CONFLICT`.

### 11.5 Fast-Path Guarantees

Fast-path operations are **convenience wrappers**, not protocol shortcuts:
1. **Same data model.** All traits, preferences, and profiles created via fast paths are identical to those created via individual operations.
2. **Same enforcement.** Reputation, verification, and proactive enforcement apply equally.
3. **Same funnel.** The underlying stage machine is the same. Fast paths compress API calls.
4. **Reversible.** Anything created via fast paths can be modified via `schelling.update`, `schelling.decline`, etc.
5. **Full protocol available.** After a fast-path creates a registration, the agent can use any standard operation.

### 11.6 Fast-Path to Full-Protocol Transition

A participant created via `quick_seek` or `quick_offer` has a standard registration and is fully interoperable with the rest of the protocol. Common transitions:

| Fast-path action | Full-protocol continuation |
|---|---|
| `quick_seek` auto-registered | `schelling.update` to add traits, `schelling.search` for broader results, `schelling.inquire` for pre-commitment dialogue |
| `quick_seek` auto-advanced candidates | `schelling.commit` to proceed, `schelling.decline` to pass, `schelling.inquire` for more info |
| `quick_offer` auto-subscribed | `schelling.notifications` to check matches, `schelling.interest` to engage, `schelling.unsubscribe` to stop |
| `quick_match` auto-connected | `schelling.contract` to formalize terms, `schelling.deliver` to fulfill, `schelling.message` to coordinate |

The `user_token` returned by any fast-path operation is a standard bearer token valid for all protocol operations.

---

## 12. Server-Side Learned Ranking Model

### 12.1 Overview

The server maintains a machine learning model that generates rank-ordered candidate lists. The model learns from outcomes (successful matches, completions, positive feedback, funnel progression patterns) to improve ranking quality over time.

**Key principle:** The model's rankings are always **advisory**. Agents receive ranked lists and apply their own evaluation. Hard filters (weight=1.0) are NEVER relaxed by the model. Stated preferences constrain the candidate set; the model adjusts ranking WITHIN that set.

### 12.2 Learning Signals

The model learns from the following signals:

| Signal | Source | Weight | Description |
|---|---|---|---|
| Funnel progression | Stage transitions | Medium | Advancing through stages = positive signal. Declining = negative signal. |
| Outcome reports | `schelling.report` | High | Explicit positive/neutral/negative ratings. |
| Contract completion | `schelling.contract` | High | Completed contracts = strong positive signal. |
| Deliverable acceptance | `schelling.accept_delivery` | High | Accepted deliverables = strong positive signal. |
| Time in funnel | Stage timestamps | Low | Fast progression = strong positive. Stalling = mild negative. |
| Message engagement | `schelling.message` | Low | Message volume and reciprocity at CONNECTED stage. |
| Inquiry patterns | `schelling.inquire` | Low | Questions asked/answered before committing. |

### 12.3 Model Tiers

The ranking model operates at three tiers, each refining the one above:

**Tier 1: Cluster-level priors (cold start)**

At registration time, the model has no individual data. It uses cluster-level priors:
- "In the `dating.general` cluster, participants who match on traits `dating.age` (within 5 years), `general.location_city` (same city), and `general.interests` (≥2 overlap) tend to have 75% positive outcomes."
- These priors are computed from aggregate outcome data across all participants in the cluster.
- When the cluster itself is new (nascent phase, §4.6), the model defaults to raw preference satisfaction scoring. The server MAY bootstrap priors from similar clusters in the same namespace.

**Tier 2: Cohort-level patterns**

As outcome data accumulates, the model learns patterns for cohorts of similar participants:
- "Participants in `dating.general` who are age 25–30, in Denver, with high social_bonding intent tend to weight `general.interests` overlap 30% more than their stated weight suggests."
- Cohorts are defined by trait similarity, intent embedding proximity, and demographic clusters.
- Minimum: 50 outcomes in a cohort before cohort patterns influence ranking.

**Tier 3: Per-user refinement**

As individual interaction data accumulates, the model refines rankings for each specific participant:
- "This user says height preference is 0.8 weight, but has advanced past three candidates who didn't meet the threshold while declining two who did. Effective learned weight: 0.5."
- Minimum: 10 interactions (any funnel action) before per-user refinement activates.

### 12.4 Ranking Explanation

When the server's ranking differs significantly from raw preference satisfaction, the server provides an explanation:

**ranking_explanation object (in search response):**

| Field | Type | Description |
|---|---|---|
| `model_tier` | string | Which model tier is active: `"prior"`, `"cohort"`, `"personal"`. |
| `adjustments` | array of Adjustment | Specific adjustments the model made. |
| `outcome_basis` | integer | Number of outcomes the model has trained on for this participant. |

**Adjustment schema:**

| Field | Type | Description |
|---|---|---|
| `trait_key` | string | The preference that was adjusted. |
| `stated_weight` | float | The agent's stated weight. |
| `effective_weight` | float | The model's learned effective weight. |
| `reason` | string | Human-readable explanation. E.g., "Users with similar profiles who stated this at 0.8 typically behave like 0.5 when personality match is strong." |

### 12.5 Agent Override

Agents always have full authority to:
1. **Ignore the advisory ranking entirely** and use their own scoring.
2. **Rerank results** based on their own evaluation logic.
3. **Apply additional filters** that the server doesn't know about.
4. **Request raw data** (traits, preference satisfaction) and compute scores from scratch.

The protocol provides raw data alongside advisory scores specifically to enable this.

### 12.6 Model Integrity & Anti-Poisoning

The learned ranking model is a target for manipulation. The following safeguards protect model integrity:

**Signal weighting by reputation, verification, and identity:**
- Outcome signals from users with reputation < 0.4 are discounted by 50%.
- Outcome signals from users with no verified traits are discounted by 30%.
- **Outcome signals from anonymous users (no `phone_hash`) are excluded from cohort-level and cluster-level model training entirely.** Anonymous signals are used only for per-user refinement of the anonymous user's own ranking. This prevents Sybil attacks via disposable anonymous accounts.
- Signals from pairs where both parties share the same `phone_hash` prefix (first 8 hex chars) are excluded entirely (potential Sybil collusion).

**Outlier detection:**
- The model tracks per-user signal distributions. Users whose funnel behavior deviates > 3 standard deviations from their cohort are flagged.
- Flagged users' signals are excluded from model training until manual review or until the deviation normalizes.

**Temporal smoothing:**
- The model uses exponential moving averages rather than point estimates, so a burst of poisoning signals from coordinated accounts is dampened.
- A minimum of 20 independent signals (from distinct phone_hash values) is required before any cohort-level pattern influences ranking.

**Funnel signal limitations:**
- Funnel advancement signals (advancing = positive, declining = negative) carry lower weight than explicit outcome reports. Ratio: funnel signals are weighted at 0.3x the weight of outcome reports. This prevents agents from gaming the model by mass-advancing candidates to generate spurious positive signals.
- Auto-advanced interest signals (from `quick_seek` with `auto_advance: true`) are excluded from funnel advancement signals entirely. Only manual interest expressions count.

**Coordinated attack detection:**
- The server MUST detect coordinated signal patterns: time-correlated signals from accounts with similar registration patterns (same registration time window, similar trait sets, same agent_model, same IP subnet) are flagged for review.
- When 5+ flagged accounts generate signals for the same participant within 24 hours, those signals are quarantined and excluded from model training pending manual review.

### 12.7 Stated vs. Revealed Preference Transparency

The system starts with a strong bias toward stated preferences:

1. **Initial state:** Stated preferences at face value. Cluster-level priors provide default ranking.
2. **Every funnel interaction generates signal:** advance = positive for that candidate's traits; reject = negative; inquire = neutral-to-positive; skip = mild negative.
3. **Learning adjusts effective weights:** The model learns effective weights from behavior — but stated preferences are NEVER overridden. They constrain the candidate set. Ranking within the set reflects learned reality.
4. **Transparency:** When the model adjusts effective weights, the agent receives the adjustment explanation (§12.4). The agent can relay this to the user: "You said height is very important, but you've advanced past several people who didn't meet your threshold. Would you like to adjust?"

---

## 13. Progressive Disclosure

### 13.1 Visibility Tiers

Each trait has a `visibility` field that controls when it becomes visible to counterparts:

| Tier | Value | Visible when |
|---|---|---|
| `public` | `"public"` | Always visible from DISCOVERED stage. Appears in search results. |
| `after_interest` | `"after_interest"` | Visible when BOTH parties are at INTERESTED (stage 2) or higher. |
| `after_commit` | `"after_commit"` | Visible when BOTH parties are at COMMITTED (stage 3) or higher. |
| `after_connect` | `"after_connect"` | Visible only at CONNECTED (stage 4). |
| `private` | `"private"` | Never shared via the protocol. Agent handles out-of-band. |

### 13.2 Enforcement

The server MUST enforce visibility rules:

1. When an agent requests candidate data (via search, connections, or any other operation), the server filters traits based on the requesting party's stage AND the other party's stage.
2. The server MUST NOT include traits in responses if the visibility requirement is not met by BOTH parties.
3. `private` traits are NEVER included in any server response. They exist only in the server's storage for the participant's own use (e.g., `schelling.export`).
4. The server MUST NOT reveal the existence of non-visible traits. A response does not indicate "there are 5 hidden traits" — it simply omits them.

### 13.3 Visibility and Preference Evaluation

A key design question: can the server use non-visible traits for preference evaluation?

**Answer: Yes, but with restrictions.**

- The server uses ALL traits (regardless of visibility) for **scoring and ranking**. This is essential — otherwise, a preference on an `after_interest` trait would be useless at DISCOVERED stage.
- However, the server MUST NOT **reveal** the non-visible trait's value in the response. The `preference_satisfaction` field reports `satisfied: true/false` and `score: 0.85` but sets `candidate_value: null` for traits above the current visibility tier.
- This means agents know WHETHER a preference is satisfied without knowing the specific value. Example: "Their height meets your minimum" without revealing the actual height until `after_interest`.

### 13.4 Visibility Matrix

| Data type | DISCOVERED | INTERESTED | COMMITTED | CONNECTED |
|---|---|---|---|---|
| `public` traits | ✓ | ✓ | ✓ | ✓ |
| `after_interest` traits | — | ✓ (mutual) | ✓ | ✓ |
| `after_commit` traits | — | — | ✓ (mutual) | ✓ |
| `after_connect` traits | — | — | — | ✓ |
| `private` traits | — | — | — | — |
| Advisory scores (quantized) | ✓ | ✓ | ✓ | ✓ |
| Advisory scores (full precision) | — | ✓ | ✓ | ✓ |
| Preference satisfaction | ✓ (binary) | ✓ (scores) | ✓ | ✓ |
| Text profile | — | — | ✓ (mutual) | ✓ |
| Intents | ✓ | ✓ | ✓ | ✓ |
| Agent capabilities | ✓ | ✓ | ✓ | ✓ |
| Identity (name, contact) | — | — | — | ✓ |
| Direct contact (schelling.direct) | — | — | — | ✓ (mutual) |
| Inquiry Q&A | — | ✓ | ✓ | ✓ |
| Contracts | — | — | ✓ | ✓ |
| Deliverables | — | — | ✓ | ✓ |
| Events | — | — | — | ✓ |
| Message relay | — | — | — | ✓ |
| Ranking explanation | — | ✓ | ✓ | ✓ |

### 13.5 Visibility Changes and Information Recall

Agents may change a trait's visibility tier via `schelling.update` (e.g., from `"public"` to `"after_commit"`). However, the server **cannot retract information already disclosed**. If a counterpart has already seen a trait value at a previous visibility tier, raising the tier does not erase their knowledge. The server enforces the new tier for future requests but acknowledges that previously-revealed data cannot be un-revealed.

Agents SHOULD inform users that visibility changes apply prospectively, not retroactively.

### 13.6 Agent Control

Agents decide the visibility tier for each trait at registration time. The protocol provides no constraints on which tiers are used — an agent may mark all traits as `public` or all as `after_connect`.

**Recommendations for agents (non-normative):**

| Trait type | Suggested visibility | Example domains |
|---|---|---|
| Core offering / skills / item details | `public` | All — the primary reason someone would match |
| Location (city-level) | `public` | Services, roommates, social, marketplace |
| Pricing / rates / budget ranges | `public` or `after_interest` | Services, hiring, marketplace |
| Availability / schedule | `public` or `after_interest` | Services, hiring, social |
| Detailed qualifications / portfolio | `after_interest` | Hiring, services, creative |
| Financial specifics (exact salary, revenue) | `after_commit` | Hiring, business partnerships |
| Personal history / background | `after_commit` | Roommates, dating, mentorship |
| Contact information (email, phone) | `after_connect` | All |
| Home address / precise location | `private` | All |

---

## 14. Verification System

### 14.1 Verification Tiers

Each trait has a `verification` field indicating the level of evidence supporting its claimed value:

| Tier | Value | Trust score | Description |
|---|---|---|---|
| Unverified | `"unverified"` | 0.0 | Agent-attested only. The agent claims this value; no evidence provided to the server. |
| Self-verified | `"self_verified"` | 0.3 | The participant provided evidence to the server (photo+timestamp, document upload, etc.). Server stores attestation but has not independently confirmed. |
| Cross-verified | `"cross_verified"` | 0.6 | Multiple independent agents or participants corroborate the trait. E.g., three separate interactions confirm the participant's claimed height. |
| Authority-verified | `"authority_verified"` | 1.0 | Third-party attestation from a trusted credential service, government ID verification, or professional certification authority. |

### 14.2 Verification Effects

Verification level influences multiple systems:

| System | Effect |
|---|---|
| **Search ranking** | Verified traits receive higher weight in the advisory ranking model. A verified trait carries 1.0 + (trust_score × 0.5) multiplier on its contribution to the preference satisfaction score. |
| **Visibility badges** | Agents see the verification tier for each visible trait. This enables agents to present trust indicators to users. |
| **Dispute outcomes** | In disputes, verified traits have stronger evidential standing. A participant claiming their `dating.height_inches` is authority-verified has stronger standing than one with unverified height. |
| **Discovery priority** | The server MAY boost visibility of profiles with higher overall verification scores. The boost compounds across multiple mechanisms: a fully verified profile receives up to 1.5x multiplier on verified trait contributions (§14.2 trust_score), up to 1.3x on positive reputation events (§16.6), and 0.05 advisory score component (§10.2). In aggregate, a fully authority-verified profile with strong reputation may see 20–40% higher effective advisory scores compared to an otherwise-identical unverified profile. |

### 14.3 Operation: `schelling.verify`

**Group:** Verification. **Authentication:** Bearer token.

Submit verification evidence for a trait, or request verification from another party.

**Input fields (submit evidence):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `action` | string | Yes | `"submit"`. |
| `trait_key` | string | Yes | The trait to verify. |
| `evidence_type` | string | Yes | One of: `"photo"`, `"document"`, `"link"`, `"attestation"`. |
| `evidence_data` | string | Yes | Evidence payload: URL, base64-encoded document, or attestation JSON. Max 10MB. |
| `requested_tier` | string | Yes | Tier being requested: `"self_verified"`, `"cross_verified"`, `"authority_verified"`. |
| `idempotency_key` | string | No | Idempotency key. |

**Input fields (request verification from counterpart):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `action` | string | Yes | `"request"`. |
| `candidate_id` | string | Yes | Candidate pair. |
| `trait_key` | string | Yes | The trait to request verification for. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields (submit):**

| Field | Type | Description |
|---|---|---|
| `verification_id` | string | Verification request ID. |
| `status` | string | `"pending"`, `"approved"`, `"rejected"`. |
| `current_tier` | string | Current verification tier for this trait. |

**Output fields (request):**

| Field | Type | Description |
|---|---|---|
| `requested` | boolean | Always `true`. |
| `request_id` | string | Request ID. |

**Verification process:**

1. **Self-verification:** Agent submits evidence (photo, document). Server validates format and stores attestation. If evidence passes automated checks (photo has face, document is readable), tier upgrades to `self_verified`. Server MAY queue for human review for higher tiers.
2. **Cross-verification:** When 3+ independent agents/participants attest to the same trait value (via outcome reports, feedback, or explicit cross-verification requests), the trait automatically upgrades to `cross_verified`.
3. **Authority-verification:** Agent submits a third-party attestation (credential service API token, government ID verification result). Server validates the attestation against known authorities. If valid, tier upgrades to `authority_verified`.

**Stage gating for verification requests:** The `"request"` action (requesting verification from a counterpart) requires both parties to be at INTERESTED (stage 2) or higher. Requesting verification from a DISCOVERED-only contact returns `STAGE_VIOLATION`. The `"submit"` action (submitting own evidence) has no stage gating — a user can verify their own traits at any time.

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `STAGE_VIOLATION`, `INVALID_INPUT`, `VERIFICATION_EXPIRED`, `NO_PENDING_REQUEST`.

### 14.4 Cross-Verification Privacy

Cross-verification (§14.1, "3+ independent agents/participants corroborate the trait") does NOT require corroborating agents to see the trait's specific value. Corroboration is based on **indirect signals**: outcome reports, behavioral evidence, and consistency observations. A corroborating agent attests "this trait appears consistent with my interaction" without being shown the claimed value. The server computes cross-verification from the aggregate of indirect signals, never by sharing one participant's trait values with another for explicit confirmation.

### 14.5 Age Verification

Clusters with the `age_restricted` configuration setting (§4.8) require age verification before participants can advance through the funnel:

1. **Default age-restricted clusters:** All clusters with the `dating.*` prefix are `age_restricted: true` by default. Server operators MAY designate additional clusters as age-restricted.
2. **Verification requirement:** In age-restricted clusters, participants MUST have at least one age-related trait (key matching `*.age`, `*.age_years`, `general.date_of_birth`, or similar — the server maintains a canonical list of age-related trait keys) with verification tier `"self_verified"` or higher.
3. **Enforcement:** Participants without verified age can register in age-restricted clusters, but they CANNOT advance past DISCOVERED stage (calling `schelling.interest` returns `AGE_VERIFICATION_REQUIRED`). This allows them to browse but not interact.
4. **Legal compliance:** Server operators MUST comply with local age verification laws (e.g., COPPA in the US, Age Verification Regulation in the UK). The protocol provides the mechanism; legal compliance is the operator's responsibility.

### 14.6 Verification Summary

Each candidate record includes a `verification_summary`:

```json
{
  "total_traits": 15,
  "unverified": 8,
  "self_verified": 4,
  "cross_verified": 2,
  "authority_verified": 1,
  "overall_trust": 0.35
}
```

`overall_trust` = weighted average of all visible trait trust scores.

---

## 15. Pluggable Tools Ecosystem

### 15.1 Overview

Version 3 replaces the fixed set of server-provided tools with a **pluggable ecosystem**. The server provides a set of default tools, and third parties can register additional tools that become discoverable and usable by agents within the network.

This creates a marketplace of matching capabilities: someone creates a "code quality assessment" tool, registers it, agents in hiring clusters start using it, it gains reputation, and it becomes a standard part of the hiring workflow — all without protocol changes.

### 15.2 Tool Types

| Type | Description | Examples |
|---|---|---|
| **Default** | Server-provided, always available, maintained by server operator | Personality embedding, location, credential verification |
| **Third-party** | Registered by external developers via `schelling.register_tool` | Code assessment, portfolio review, background check, skill quiz |
| **Cluster-specific** | Tools registered for specific clusters or cluster namespaces | `dating.*` appearance tools, `hiring.*` technical assessment tools |

### 15.3 Operation: `schelling.register_tool`

**Group:** Tools. **Authentication:** Bearer token (tool developer).

Register a new third-party tool in the ecosystem.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token of the tool developer. |
| `tool_id` | string | Yes | Unique tool identifier. Namespaced: `{developer}.{tool_name}`. 1–100 chars. |
| `display_name` | string | Yes | Human-readable tool name. Max 200 chars. |
| `description` | string | Yes | Detailed description of what the tool does. Max 5,000 chars. |
| `one_line_description` | string | Yes | One-line summary. Max 200 chars. |
| `endpoint` | string | Yes | HTTPS endpoint where the tool is hosted. |
| `input_schema` | object | Yes | JSON Schema for tool input. Max 50KB. |
| `output_schema` | object | Yes | JSON Schema for tool output. Max 50KB. |
| `cluster_scope` | array of string | No | Cluster ID prefixes this tool is relevant to. E.g., `["hiring.*", "services.*"]`. If omitted, tool is globally available. |
| `pricing` | object | No | Billing metadata. See below. |
| `version` | string | Yes | Semantic version of the tool. |
| `health_check_endpoint` | string | No | Endpoint for health checks. Server pings periodically. |
| `idempotency_key` | string | No | Idempotency key. |

**Pricing sub-object:**

| Field | Type | Description |
|---|---|---|
| `model` | string | Pricing model: `"free"`, `"per_call"`, `"subscription"`, `"custom"`. |
| `per_call_amount` | float \| null | Cost per invocation (for `"per_call"` model). |
| `currency` | string | ISO 4217 currency code. Default: `"USD"`. |
| `details` | string | Human-readable pricing details. Max 500 chars. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `tool_id` | string | Registered tool ID. |
| `registered_at` | string | ISO 8601. |
| `status` | string | `"active"`, `"pending_review"`. New tools MAY require server operator review. |

**Validation rules:**
1. `tool_id` must be unique across the server.
2. `endpoint` must be HTTPS.
3. `input_schema` and `output_schema` must be valid JSON Schema.
4. The server MAY validate the endpoint is reachable and returns expected responses.

**Error codes:** `USER_NOT_FOUND`, `INVALID_INPUT`, `TOOL_ID_TAKEN`, `INVALID_ENDPOINT`.

### 15.4 Tool Reputation

Third-party tools have reputation scores based on usage and feedback:

| Signal | Impact |
|---|---|
| Successful invocations | +0.01 per call (capped at 1.0) |
| Error responses | -0.02 per error |
| Timeout / unreachable | -0.05 per incident |
| Agent feedback (thumbs up) | +0.03 |
| Agent feedback (thumbs down) | -0.05 |
| Time since registration | Older tools with consistent performance get trust bonus |

**Reputation score:** Float in [0.0, 1.0]. New tools start at 0.5. Tools with reputation < 0.2 are delisted.

**Tool reputation is visible** in `schelling.list_tools` and `schelling.server_info`, enabling agents to choose trustworthy tools.

### 15.5 Default Tools

The server provides the following default tools. These are always available and maintained by the server operator.

#### 15.5.1 Personality Embedding Tool

**Tool ID:** `server.personality_embedding`

Generates a personality vector from structured personality data or free text. Agents compare vectors for personality compatibility.

**Operation: `schelling.tool.invoke`** with `tool_id: "server.personality_embedding"`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `tool_id` | string | Yes | `"server.personality_embedding"`. |
| `action` | string | Yes | `"generate"` or `"compare"`. |
| `personality_data` | object | Conditional | Structured personality data. Required for `"generate"`. |
| `free_text` | string | Conditional | Free-text personality description. Alternative to `personality_data` for `"generate"`. Max 10,000 chars. |
| `vector_a` | array of floats | Conditional | First vector. Required for `"compare"`. |
| `vector_b` | array of floats | Conditional | Second vector. Required for `"compare"`. |

**personality_data schema (structured input):**

| Field | Type | Description |
|---|---|---|
| `big_five` | object | Big Five personality scores. Keys: `openness`, `conscientiousness`, `extraversion`, `agreeableness`, `neuroticism`. Values: float [-1, 1]. |
| `communication_style` | object | Communication traits. Keys: `directness`, `expressiveness`, `listening_ratio`, `humor_style`. Values: float [-1, 1]. |
| `values` | array of string | Core values. Max 20 items. |
| `behavioral_observations` | object | Agent-observed behavioral patterns. Freeform key-value, max 50 keys. |

**Output fields (generate):**

| Field | Type | Description |
|---|---|---|
| `embedding` | array of floats | Personality vector. Current version: 50 dimensions. |
| `dimensions` | integer | Number of dimensions. |
| `version` | string | Embedding model version. |

**Output fields (compare):**

| Field | Type | Description |
|---|---|---|
| `cosine_similarity` | float | Cosine similarity in [-1, 1]. |
| `compatibility_score` | float | Mapped to [0, 1] via `(cosine + 1) / 2`. |
| `dimensional_breakdown` | array of object | Per-dimension comparison. |

#### 15.5.2 Visual Embedding Tool

**Tool ID:** `server.appearance_embedding`

Computes visual feature vectors from images. Primarily used in clusters where visual characteristics are relevant (dating, marketplace item listings, creative portfolios, real estate).

**Operation: `schelling.tool.invoke`** with `tool_id: "server.appearance_embedding"`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `tool_id` | string | Yes | `"server.appearance_embedding"`. |
| `action` | string | Yes | `"generate_preference"`, `"generate_appearance"`, or `"compare"`. |
| `photos` | array of string | Conditional | URLs to reference images representing desired visual characteristics (for `"generate_preference"`). Max 10. |
| `self_photos` | array of string | Conditional | URLs to images of the participant or their offering (for `"generate_appearance"`). Max 10. |
| `appearance_text` | string | No | Text description of visual characteristics. Max 5,000 chars. |
| `vector_a` | array of floats | Conditional | Preference vector (for `"compare"`). |
| `vector_b` | array of floats | Conditional | Appearance vector (for `"compare"`). |

**Output fields (generate_preference):**

| Field | Type | Description |
|---|---|---|
| `preference_vector` | array of floats | Visual preference vector. |
| `dimensions` | integer | Number of dimensions. |
| `confidence` | float | Confidence in the vector. |

**Output fields (generate_appearance):**

| Field | Type | Description |
|---|---|---|
| `appearance_vector` | array of floats | Visual feature vector. |
| `dimensions` | integer | Number of dimensions. |

**Output fields (compare):**

| Field | Type | Description |
|---|---|---|
| `compatibility_score` | float | How well the visual features match the preference. [0, 1]. |

**Privacy:** Images are processed to generate vectors and are NOT stored by the server.

**Cluster scope restriction:** To prevent appearance-based discrimination in contexts where it is inappropriate or illegal, `server.appearance_embedding` is restricted to the following cluster scopes by default: `["dating.*", "marketplace.*", "creative.*", "social.*"]`. Invoking this tool from a user registered in a restricted cluster (e.g., `hiring.*`, `housing.*`) returns `TOOL_SCOPE_RESTRICTED`. Server operators MAY expand the scope but MUST document the legal basis for doing so.

**Anti-stalking note:** When `generate_preference` is used with photos of a specific individual (e.g., "find someone who looks like my ex"), the resulting preference vector will tend to match people who resemble that individual. Agents SHOULD warn users that this feature generates a generalized visual preference, not a lookup for a specific person. Agents MUST NOT use this tool to locate or track specific individuals.

#### 15.5.3 Semantic Text Similarity Tool

**Tool ID:** `server.semantic_similarity`

**Operation: `schelling.tool.invoke`** with `tool_id: "server.semantic_similarity"`

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `tool_id` | string | Yes | `"server.semantic_similarity"`. |
| `text_a` | string | Yes | First text. Max 10,000 chars. |
| `text_b` | string | Yes | Second text. Max 10,000 chars. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `similarity` | float | Semantic similarity in [0, 1]. |
| `shared_themes` | array of string | Identified shared themes. |
| `divergent_themes` | array of string | Themes present in one text but not the other. |

#### 15.5.4 Location & Logistics Tool

**Tool ID:** `server.location`

**Operation: `schelling.tool.invoke`** with `tool_id: "server.location"`

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `tool_id` | string | Yes | `"server.location"`. |
| `action` | string | Yes | `"set_location"`, `"distance"`, `"filter_radius"`, or `"timezone_overlap"`. |
| `latitude` | float | Conditional | For `"set_location"`. |
| `longitude` | float | Conditional | For `"set_location"`. |
| `precision` | string | No | `"exact"`, `"city"`, `"region"`. Default: `"city"`. |
| `candidate_id` | string | Conditional | For `"distance"`. |
| `radius_km` | float | Conditional | For `"filter_radius"`. |
| `candidate_ids` | array of string | Conditional | For `"filter_radius"`. |
| `their_timezone` | string | Conditional | For `"timezone_overlap"`. IANA timezone string. |

**Output fields (distance):**

| Field | Type | Description |
|---|---|---|
| `distance_km` | float | Distance in kilometers. |
| `same_city` | boolean | Whether both participants are in the same city. |
| `timezone_offset_hours` | float | Timezone difference in hours. |

**Output fields (filter_radius):**

| Field | Type | Description |
|---|---|---|
| `within_radius` | array of string | Candidate IDs within the specified radius. |
| `outside_radius` | array of string | Candidate IDs outside the specified radius. |

**Output fields (timezone_overlap):**

| Field | Type | Description |
|---|---|---|
| `overlap_hours` | float | Overlapping business hours per day. |
| `timezone_offset_hours` | float | Timezone difference in hours. |

**Privacy:** Exact coordinates are never exposed to other participants. Only derived values (distance, same_city, timezone overlap) are returned.

#### 15.5.5 Credential Verification Tool

**Tool ID:** `server.credential_verification`

**Operation: `schelling.tool.invoke`** with `tool_id: "server.credential_verification"`

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `tool_id` | string | Yes | `"server.credential_verification"`. |
| `credential_type` | string | Yes | `"identity"`, `"professional"`, `"education"`, `"background_check"`. |
| `provider` | string | Yes | Verification provider identifier. |
| `evidence` | object | Yes | Provider-specific evidence. |
| `trait_key` | string | Yes | The trait this credential verifies. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `verification_id` | string | Verification ID. |
| `status` | string | `"verified"`, `"pending"`, `"failed"`. |
| `tier` | string | Resulting verification tier. |
| `provider_response` | object | Raw provider response (redacted of PII). |
| `expires_at` | string \| null | When the verification expires. |

#### 15.5.6 Market Pricing Tool

**Tool ID:** `server.market_pricing`

**Operation: `schelling.tool.invoke`** with `tool_id: "server.market_pricing"`

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `tool_id` | string | Yes | `"server.market_pricing"`. |
| `category` | string | Yes | Item/service category. |
| `condition` | string | No | Item condition. |
| `attributes` | object | No | Item-specific attributes. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `median_price` | float | Median price. |
| `price_range` | object | `{low, high}` — 25th to 75th percentile. |
| `sample_size` | integer | Number of comparables. |
| `confidence` | float | Confidence in estimate. |
| `trend` | string | `"rising"`, `"stable"`, `"falling"`. |

### 15.6 Operation: `schelling.tool.invoke`

**Group:** Tools. **Authentication:** Bearer token.

Unified tool invocation endpoint for both default and third-party tools.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `tool_id` | string | Yes | Tool to invoke. |
| `input` | object | Yes | Tool-specific input conforming to the tool's `input_schema`. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `tool_id` | string | Tool invoked. |
| `output` | object | Tool-specific output conforming to the tool's `output_schema`. |
| `execution_ms` | integer | Execution time in milliseconds. |
| `billing` | object \| null | Billing details if the tool charges per-call. |

**For default tools:** The server routes to its internal implementation.
**For third-party tools:** The server proxies the request to the tool's registered `endpoint`, validates the response against `output_schema`, and returns the result.

**Error codes:** `USER_NOT_FOUND`, `TOOL_NOT_FOUND`, `INVALID_INPUT`, `TOOL_ERROR`, `TOOL_TIMEOUT`, `TOOL_BILLING_REQUIRED`.

### 15.7 Operation: `schelling.list_tools`

**Group:** Tools. **Authentication:** None.

Discover available tools, optionally filtered by cluster.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `cluster_id` | string | No | Filter to tools relevant to this cluster. |
| `query` | string | No | Search query against tool name/description. |
| `type` | string | No | Filter by type: `"default"`, `"third_party"`, `"all"`. Default: `"all"`. |
| `min_reputation` | float | No | Minimum reputation score. Default: 0.0. |
| `limit` | integer | No | Max results. Default: 50. Max: 200. |
| `cursor` | string | No | Pagination cursor. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `tools` | array of ToolDetail | Available tools. |
| `total` | integer | Total matching tools. |
| `next_cursor` | string \| null | Pagination cursor. |

**ToolDetail schema:**

| Field | Type | Description |
|---|---|---|
| `tool_id` | string | Tool identifier. |
| `display_name` | string | Human-readable name. |
| `description` | string | Full description. |
| `one_line_description` | string | One-line summary. |
| `type` | string | `"default"` or `"third_party"`. |
| `provider` | string | Provider name. |
| `version` | string | Tool version. |
| `input_schema` | object | JSON Schema for input. |
| `output_schema` | object | JSON Schema for output. |
| `cluster_scope` | array of string \| null | Cluster scopes, or null for global. |
| `pricing` | object | Pricing info. |
| `reputation_score` | float | Reputation score. |
| `usage_count` | integer | Total invocations (approximate). |
| `status` | string | `"available"`, `"beta"`, `"deprecated"`. |
| `registered_at` | string | ISO 8601. |

### 15.8 Operation: `schelling.tool.feedback`

**Group:** Tools. **Authentication:** Bearer token.

Provide feedback on a tool invocation. Feeds into the tool reputation system (§15.4).

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `tool_id` | string | Yes | Tool to rate. |
| `rating` | string | Yes | `"positive"` or `"negative"`. |
| `comment` | string | No | Feedback comment. Max 500 chars. |
| `invocation_id` | string | No | Specific invocation to rate (from `schelling.tool.invoke` response). |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `submitted` | boolean | Always `true`. |
| `tool_reputation` | float | Tool's updated reputation score. |

**Billing dispute:** If the rated invocation was billed (`billing` field was non-null in the invoke response) and the feedback is `"negative"`, the charge is flagged for review. Server operators MAY implement charge reversal for disputed billed invocations. Tool developers with >10% charge dispute rate face tool suspension review.

**Error codes:** `USER_NOT_FOUND`, `TOOL_NOT_FOUND`, `INVALID_INPUT`.

### 15.9 Tool Data Isolation

Third-party tools are untrusted. The server MUST enforce strict data isolation when proxying requests to tool endpoints:

1. **Strip authentication.** The server MUST NOT send the caller's `user_token` to the tool endpoint. Instead, the server generates an opaque, single-use `invocation_id` that the tool can use only for the current request.
2. **Input only.** The server MUST send ONLY the `input` object to the tool endpoint. No user context, traits, preferences, reputation scores, cluster membership, or any other participant data is included unless the agent explicitly placed it in the `input` object.
3. **No identifying metadata.** The server MUST NOT include IP addresses, user agents, session identifiers, or other metadata that could identify the calling agent in proxied requests.
4. **Response validation.** Tool responses MUST be validated against the tool's registered `output_schema` before being returned to the agent. Malformed responses return `TOOL_ERROR`.
5. **No cross-invocation correlation.** The `invocation_id` MUST be unique per invocation. Tools MUST NOT be able to correlate invocations across different users or sessions through server-provided data. (Tools may attempt correlation through the `input` content itself — preventing this is the agent's responsibility.)
6. **Timeout enforcement.** Tool invocations MUST be capped at 30 seconds. Responses arriving after the timeout are discarded and `TOOL_TIMEOUT` is returned to the agent.
7. **Circuit breaker.** If a tool endpoint fails (5xx, timeout, connection refused) 5 times in a 10-minute window, the server temporarily marks it unavailable (returning `TOOL_ERROR` with message "Tool temporarily unavailable") for 5 minutes before retrying.

---

## 16. Reputation System

### 16.1 Overview

The reputation system maintains a trust score for each participant based on their interaction history. Reputation is earned through positive outcomes, completed contracts, accepted deliverables, fair dealing, and honest representation.

### 16.2 Reputation Score

Each participant has a reputation score in [0.0, 1.0]:

| Range | Meaning |
|---|---|
| 0.8–1.0 | Excellent. Consistently positive interactions. |
| 0.6–0.79 | Good. Mostly positive, some issues. |
| 0.4–0.59 | Average. Mixed record. |
| 0.2–0.39 | Below average. Significant concerns. |
| 0.0–0.19 | Poor. Major trust issues. |

**New participant default:** 0.5 (neutral).

### 16.3 Reputation Events

| Event type | Trigger | Impact |
|---|---|---|
| `positive_outcome` | `schelling.report` with `outcome: "positive"` | +0.05 |
| `neutral_outcome` | `schelling.report` with `outcome: "neutral"` | +0.01 |
| `negative_outcome` | `schelling.report` with `outcome: "negative"` | -0.08 |
| `contract_completed` | Both parties complete a contract | +0.05 |
| `contract_terminated` | One party terminates a contract | -0.04 for terminator |
| `contract_expired` | Contract expires without completion | -0.02 for both |
| `deliverable_accepted` | Counterparty accepts a deliverable | +0.03 |
| `deliverable_rejected` | Counterparty rejects a deliverable | -0.02 for deliverer |
| `dispute_lost` | Jury verdict against this participant | -0.15 |
| `frivolous_filing` | 3+ disputes resolved against filer in 30 days | -0.10 |
| `jury_majority` | Juror sided with majority verdict | +0.02 |
| `event_unacked` | Failed to acknowledge a required event | -0.01 |
| `enforcement_warning` | Proactive enforcement warning issued | -0.05 |
| `enforcement_action` | Proactive enforcement action taken | -0.10 to -0.30 |
| `abandonment` | 30 days at CONNECTED with no report | -0.03 for both |

### 16.4 Outcome Reporting Incentives (Anti-Free-Rider)

1. **Outcome reporting bonus.** Participants who report outcomes on ≥ 80% of their CONNECTED pairs receive a 10% boost to their advisory scores. Rolling 90-day rate.
2. **Staleness penalty for non-reporters.** Participants with 3+ CONNECTED pairs with no outcome report for > 30 days each receive the `abandonment` penalty.
3. **Feedback richness bonus.** Participants who provide structured `trait_feedback` receive better model personalization.
4. **Search result priority.** Advisory score includes a small system engagement component (capped at 5%).

### 16.5 Reputation Decay and Recovery

- Events older than 365 days: impact halved. Events older than 730 days: impact quartered.
- Positive events decay faster than negative events (asymmetric).
- Recovery is possible through sustained positive interactions.

### 16.6 Verification Boost

| Overall verification level | Multiplier |
|---|---|
| < 20% traits verified | 1.0x (no boost) |
| 20–50% verified | 1.1x on positive events |
| 50–80% verified | 1.2x on positive events |
| > 80% verified | 1.3x on positive events |

### 16.7 Operation: `schelling.reputation`

**Group:** Core. **Authentication:** Bearer token.

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | No | If provided, returns the counterpart's reputation. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `score` | float | Reputation score [0, 1]. |
| `interaction_count` | integer | Total completed interactions. |
| `positive_rate` | float | Fraction of positive outcomes. |
| `verification_level` | string | Overall verification tier. |
| `dispute_history` | object | `{filed, lost, won}`. |
| `member_since` | string | ISO 8601 registration date. |
| `enforcement_history` | array | Active enforcement actions. |
| `deliverable_stats` | object | `{delivered, accepted, rejected}`. |

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`.

### 16.8 Sybil Resistance

**Identity tiers and restrictions:**

The effectiveness of Sybil resistance depends on identity verification. Participants are classified into tiers based on their `phone_hash` status:

| Tier | Criteria | Restrictions |
|---|---|---|
| **Anonymous** | No `phone_hash` provided | Reputation events weighted at 0.3x. Max 1 active registration per cluster, 5 total across all clusters. Cannot serve on juries. Cannot register tools. Advisory scores capped at 0.7 (visible in `verification_summary`). Signals excluded from cohort/cluster model training (§12.6). |
| **Identified** | `phone_hash` provided | Full participation. Standard reputation weighting. Max 2 active registrations per cluster, 20 total. |
| **Verified** | `phone_hash` + at least one `authority_verified` trait | Full participation + 1.2x positive reputation events. Preferred for jury duty. |

**Mechanisms:**

1. **Phone hash deduplication.** Multiple active registrations from the same phone hash limited to 2 per cluster, 20 total across all clusters.
2. **Agent attestation.** Embeddings from agents with < 10 hours interaction: credibility discount (0.5x).
3. **Reputation event weighting.** Anonymous: 0.3x. Identified (phone hash): 1.0x. Attested (10+ hours): 1.2x.
4. **Spam detection.** > 3 registrations from same phone hash in 24h: spam flag + 24h cooldown.
5. **Cross-verification Sybil guard.** Corroborating sources must have distinct `phone_hash` AND `agent_model`.
6. **Behavioral fingerprinting.** Server MUST track behavioral signatures (registration timing, trait similarity, funnel behavior patterns) to detect coordinated accounts. This is a required capability, not optional.
7. **New account signal dampening.** Accounts < 7 days old: reputation events weighted at 0.3x.
8. **Anonymous user tracking.** Anonymous users are tracked by a combination of IP address, agent model, and behavioral fingerprint. This is best-effort and not as reliable as phone_hash, which is why anonymous users face stricter restrictions.

---

## 17. Contracts & Negotiations

### 17.1 Contract System

Contracts enable post-commitment structured agreements. The server stores and relays contracts; agents interpret and enforce terms.

### 17.2 Contract Lifecycle

```
proposed → accepted → active → completing → completed
                                          ↘ expired (if 2nd party doesn't complete in 30 days)
                            → expired | terminated
                   ↗
proposed → counter_proposed → accepted → active → ...
           (original → superseded)
                           ↗
proposed → rejected
```

**Contract statuses:** `"proposed"`, `"counter_proposed"`, `"superseded"`, `"accepted"`, `"active"`, `"completing"`, `"completed"`, `"expired"`, `"expired_stale"`, `"terminated"`, `"rejected"`.

**Contract staleness:** Active contracts with no activity (no deliverables, no events, no messages, no contract updates) for **90 consecutive days** are automatically expired with status `"expired_stale"`. Both parties receive an `abandonment` reputation event (-0.02 each). Any activity (deliverable, event, message, or contract_update) resets the staleness clock. This prevents abandoned contracts from sitting in "active" state indefinitely and blocking reputation reporting.

### 17.3 Operation: `schelling.contract`

**Group:** Coordination. **Authentication:** Bearer token.

**Input fields (proposing):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `action` | string | Yes | `"propose"`. |
| `terms` | object | Yes | Machine-readable contract terms. Opaque JSON. Max 50KB. See recommended schema below. |
| `type` | string | Yes | One of: `"match"`, `"service"`, `"task"`, `"custom"`. |
| `dispute_content_disclosure` | boolean | No | If `true`, both parties consent to full deliverable content being visible to jurors during disputes involving this contract (§19.8). If `false` or omitted, jurors see only metadata. Agents SHOULD recommend `true` for high-value contracts. Default: `false`. |
| `safe_types` | array of string | No | Allowed MIME types for file deliverables on this contract (§18.3). E.g., `["application/pdf", "image/png"]`. If omitted, all non-executable types allowed by default. |
| `terms_schema_version` | string | No | Version identifier for the terms schema used. Helps cross-agent interoperability. |
| `milestones` | array of object | No | Milestone definitions for milestone-based delivery (§18). Each: `{milestone_id, description, deadline}`. Max 20. |
| `expires_at` | string | No | ISO 8601 expiry. Default: 30 days. |
| `idempotency_key` | string | No | Idempotency key. |

**Input fields (responding):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `action` | string | Yes | `"accept"`, `"reject"`, or `"counter"`. |
| `contract_id` | string | Yes | Contract to respond to. |
| `terms` | object | Conditional | Required for `"counter"`. |
| `milestones` | array of object | No | Counter-proposed milestones. |
| `idempotency_key` | string | No | Idempotency key. |

**Input fields (lifecycle):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `action` | string | Yes | `"complete"` or `"terminate"`. |
| `contract_id` | string | Yes | Contract to update. |
| `reason` | string | No | Reason for termination. |
| `idempotency_key` | string | No | Idempotency key. |

**Input fields (listing):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `action` | string | Yes | `"list"`. |
| `candidate_id` | string | No | Filter by candidate pair. |
| `status` | string | No | Filter by status. |

**Output fields (propose):**

| Field | Type | Description |
|---|---|---|
| `contract_id` | string | Contract ID. |
| `status` | string | `"proposed"`. |
| `proposed_at` | string | ISO 8601. |
| `expires_at` | string | ISO 8601. |

**Output fields (accept):**

| Field | Type | Description |
|---|---|---|
| `contract_id` | string | Contract ID. |
| `status` | string | `"active"`. |
| `accepted_at` | string | ISO 8601. |

**Output fields (list):**

| Field | Type | Description |
|---|---|---|
| `contracts` | array | Contract records with `contract_id`, `candidate_id`, `type`, `terms`, `milestones`, `status`, `supersedes`, `proposed_by`, `proposed_at`, `accepted_at`, `completed_at`, `expires_at`. |

**Gating:** Caller must be at COMMITTED (stage 3) or higher. In auction mode, contract proposals are submitted alongside interest (§9.5).

**Recommended contract terms schema (non-normative):** For interoperability between agents from different developers, the following `terms` structure is recommended:

```json
{
  "description": "Brief description of the agreement",
  "deliverables": ["List of expected deliverables"],
  "timeline": {"start": "ISO 8601", "end": "ISO 8601"},
  "compensation": {"amount": 0, "currency": "USD", "schedule": "on_completion|milestone|upfront"},
  "conditions": ["List of conditions or requirements"],
  "cancellation_policy": "Description of cancellation terms",
  "external_escrow_id": "Reference to external escrow service, if any"
}
```

Agents SHOULD use this schema and set `terms_schema_version: "1.0"` when doing so. Agents receiving proposals with an unknown `terms_schema_version` SHOULD present the raw terms to the user for interpretation.

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`, `CONTRACT_NOT_FOUND`, `INVALID_CONTRACT_TYPE`, `INVALID_CONTRACT_ACTION`, `CANNOT_RESPOND_OWN_PROPOSAL`, `CONTRACT_NOT_PENDING`, `CONTRACT_ALREADY_TERMINAL`, `CONTRACT_EXPIRED`.

### 17.4 Operation: `schelling.contract_update`

**Group:** Coordination. **Authentication:** Bearer token.

Propose an amendment to an active contract.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `contract_id` | string | Yes | Active contract to amend. |
| `updated_terms` | object | No | Proposed updated terms. |
| `updated_milestones` | array of object | No | Proposed updated milestones. |
| `amendment_id` | string | Conditional | For responding to an amendment. |
| `action` | string | Conditional | `"accept_amendment"` or `"reject_amendment"` when responding. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `amendment_id` | string | Amendment ID. |
| `status` | string | `"amendment_proposed"`, `"amendment_accepted"`, `"amendment_rejected"`. |
| `proposed_at` | string | ISO 8601. |

**Error codes:** `USER_NOT_FOUND`, `CONTRACT_NOT_FOUND`, `UNAUTHORIZED`, `CONTRACT_NOT_ACTIVE`, `AMENDMENT_NOT_FOUND`.

### 17.5 Negotiation

Negotiation via `counter` action. `max_rounds` configurable per cluster (default: 5). Each proposal expires after `timeout_hours` (default: 48). Counter-proposals create new contract records with `"counter_proposed"` status; the original gets `"superseded"`.

**Error codes:** `MAX_ROUNDS_EXCEEDED`.

### 17.6 Contract Completion

Bilateral: both parties call `schelling.contract` with `action: "complete"`.
1. First party: status → `"completing"`.
2. Second party: status → `"completed"`, reputation events triggered.
3. If second party doesn't complete within 30 days: status → `"expired"`.

### 17.7 Reputation Integration

- Completed: +0.05 for both.
- Terminated: -0.04 for terminator. Mutual: no impact.
- Expired: -0.02 for both.

---

## 18. Deliverable Exchange

### 18.1 Overview

The deliverable exchange system enables structured post-match fulfillment. After a contract is established, parties can deliver artifacts (files, URLs, messages, structured data) through the protocol, with acceptance/rejection tracking.

This replaces the unstructured pattern of "match → figure it out off-platform" with an in-protocol mechanism for tracking whether the contracted work/exchange actually happened.

### 18.2 Deliverable Lifecycle

```
delivered → accepted → (contract completion triggered)
         → rejected → (deliverer can re-deliver or dispute)
         → expired (7 days default, no action)
```

For milestone-based contracts:
```
Milestone 1: delivered → accepted
Milestone 2: delivered → accepted
Milestone 3: delivered → accepted → contract completion triggered
```

### 18.3 Operation: `schelling.deliver`

**Group:** Coordination. **Authentication:** Bearer token.

Deliver an artifact as fulfillment of a contract or milestone.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `contract_id` | string | Yes | The contract this delivery fulfills. |
| `milestone_id` | string | No | For milestone-based contracts: which milestone this delivers. |
| `deliverable` | object | Yes | The deliverable payload. |
| `message` | string | No | Accompanying message. Max 5,000 chars. |
| `idempotency_key` | string | No | Idempotency key. |

**Deliverable object schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Yes | Deliverable type: `"file"`, `"url"`, `"message"`, `"structured"`. |
| `content` | string | Yes | The content. For `"file"`: base64-encoded data (max 50MB). For `"url"`: URL string. For `"message"`: text content (max 50,000 chars). For `"structured"`: JSON string (max 1MB). |
| `content_type` | string | No | MIME type for files. E.g., `"application/pdf"`, `"image/png"`. |
| `filename` | string | No | Original filename for file deliverables. |
| `metadata` | object | No | Arbitrary metadata. Max 10KB. |
| `checksum` | string | No | SHA-256 checksum for integrity verification. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `delivery_id` | string | Delivery ID. |
| `contract_id` | string | Associated contract. |
| `milestone_id` | string \| null | Associated milestone. |
| `delivered_at` | string | ISO 8601. |
| `expires_at` | string | ISO 8601. Deliverable purged after this time (default: 7 days). |
| `status` | string | `"delivered"`. |

**Gating:** Contract must be in `"active"` or `"completing"` status. Caller must be a party to the contract.

**Deliverable security:**

1. **MIME validation.** The server MUST validate that `content_type` matches the actual file content (MIME sniffing). Mismatches return `INVALID_DELIVERABLE_TYPE`.
2. **Executable rejection.** File deliverables with executable MIME types (`application/x-executable`, `application/x-msdos-program`, `application/x-sh`, etc.) or executable extensions (`.exe`, `.bat`, `.sh`, `.cmd`, `.ps1`, `.app`, `.dmg`) MUST be rejected unless the contract's `safe_types` field explicitly includes the type. Returns `INVALID_DELIVERABLE_TYPE` with message "Executable file types require explicit safe_types allowlist in contract."
3. **Content scanning.** Servers SHOULD perform basic content scanning (known malware signatures, suspicious file patterns) on file deliverables. Scanning is best-effort and does not guarantee safety.
4. **Safe types enforcement.** If the contract specifies `safe_types`, only deliverables with matching `content_type` are accepted. Non-matching types return `INVALID_DELIVERABLE_TYPE`.
5. **Agent responsibility.** Agents MUST NOT auto-execute or auto-open file deliverables. Agents MUST present deliverables to the user with type, size, source information, and a warning before opening. The protocol is a delivery channel — content safety is ultimately the receiving agent's responsibility.
6. **Checksum verification.** If `checksum` is provided, the server MUST validate the SHA-256 of the content matches. Mismatch returns `INVALID_INPUT` with message "Checksum mismatch."

**Error codes:** `USER_NOT_FOUND`, `CONTRACT_NOT_FOUND`, `UNAUTHORIZED`, `CONTRACT_NOT_ACTIVE`, `MILESTONE_NOT_FOUND`, `DELIVERABLE_TOO_LARGE`, `INVALID_DELIVERABLE_TYPE`, `STORAGE_LIMIT_EXCEEDED`.

### 18.4 Operation: `schelling.accept_delivery`

**Group:** Coordination. **Authentication:** Bearer token.

Accept or reject a deliverable from the counterparty.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `delivery_id` | string | Yes | The delivery to respond to. |
| `accepted` | boolean | Yes | Whether the deliverable is accepted. |
| `feedback` | string | No | Feedback on the deliverable. Max 5,000 chars. |
| `rating` | float | No | Quality rating [0, 1]. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `delivery_id` | string | Delivery ID. |
| `status` | string | `"accepted"` or `"rejected"`. |
| `responded_at` | string | ISO 8601. |
| `contract_status` | string | Updated contract status. If all milestones delivered and accepted, contract may advance to `"completing"`. |
| `milestone_status` | string \| null | Updated milestone status if applicable. |

**Acceptance effects:**
- Accepted deliverable: `deliverable_accepted` reputation event (+0.03 for deliverer).
- Rejected deliverable: `deliverable_rejected` reputation event (-0.02 for deliverer). Deliverer can re-deliver.
- All milestones accepted: contract advances to `"completing"` (bilateral completion still required per §17.6).

**Error codes:** `USER_NOT_FOUND`, `DELIVERY_NOT_FOUND`, `UNAUTHORIZED`, `DELIVERY_EXPIRED`, `ALREADY_RESPONDED`.

### 18.5 Operation: `schelling.deliveries`

**Group:** Coordination. **Authentication:** Bearer token.

List deliverables for a contract.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `contract_id` | string | Yes | Contract to list deliverables for. |
| `status_filter` | string | No | Filter by status: `"delivered"`, `"accepted"`, `"rejected"`, `"expired"`. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `deliveries` | array of DeliveryRecord | Delivery records. |
| `total` | integer | Total deliveries. |

**DeliveryRecord schema:**

| Field | Type | Description |
|---|---|---|
| `delivery_id` | string | Delivery ID. |
| `milestone_id` | string \| null | Associated milestone. |
| `deliverable` | object | The deliverable (type, metadata — content may be purged after expiry). |
| `delivered_by` | string | `"you"` or `"them"`. |
| `delivered_at` | string | ISO 8601. |
| `status` | string | `"delivered"`, `"accepted"`, `"rejected"`, `"expired"`. |
| `feedback` | string \| null | Acceptance/rejection feedback. |
| `rating` | float \| null | Quality rating. |
| `expires_at` | string | ISO 8601. |

### 18.6 Storage & Retention

- Deliverables are stored temporarily. Default retention: **7 days** after delivery.
- After retention expires, deliverable content is purged. Metadata (delivery_id, status, timestamps, feedback) is retained permanently for the contract record.
- Agents SHOULD persist deliverable content locally. The protocol is a delivery channel, not long-term storage.
- The server MAY offer extended retention as a paid feature (implementation-defined).
- File deliverables are limited to 50MB per delivery. Larger files should be hosted externally and delivered as URLs.
- **Per-user aggregate storage limit:** Each user has a maximum of **500MB** of pending deliverables (status `"delivered"` — not yet accepted, rejected, or expired) at any time. New deliveries that would exceed this limit return `STORAGE_LIMIT_EXCEEDED`. Accepted and rejected deliverables do not count toward this limit once their content is purged after retention.

### 18.7 Milestone-Based Delivery

For complex contracts, milestones enable phased delivery:

1. Contract is proposed with `milestones` array defining phases.
2. Deliverer delivers against each milestone using `milestone_id`.
3. Counterparty accepts/rejects each milestone independently.
4. All milestones accepted → contract can be completed.

**Milestone ordering:** Milestones can be delivered in any order unless the contract terms specify ordering (which is agent-enforced, not protocol-enforced).

**Partial delivery:** A contract can be completed even if some milestones are not delivered, as long as both parties call `"complete"`. The milestone system tracks what was delivered, not what was required — that's up to the agents.

---

## 19. Dispute Resolution: Agent Jury System

### 19.1 Overview

Disputes are resolved by a decentralized agent jury. When a dispute is filed, the server selects independent agents to review evidence and render a verdict.

### 19.2 Filing

Disputes can be filed at CONNECTED (stage 4) via `schelling.dispute`. One open dispute per candidate pair per party.

### 19.3 Operation: `schelling.dispute`

**Group:** Enforcement. **Authentication:** Bearer token.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `reason` | string | Yes | Reason for dispute. Max 5,000 chars. |
| `evidence` | array of string | No | Evidence URLs/references. Max 10. |
| `trait_claims` | array of object | No | Trait misrepresentation claims: `[{trait_key, claimed_value, actual_value}]`. |
| `delivery_claims` | array of object | No | Deliverable quality claims: `[{delivery_id, issue}]`. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `dispute_id` | string | Dispute ID. |
| `status` | string | `"filed"`, `"jury_selected"`, `"in_deliberation"`, `"resolved"`, `"operator_review"`. |
| `jury_size` | integer | Number of jurors assigned. |
| `filed_at` | string | ISO 8601. |

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`, `DUPLICATE_DISPUTE`.

### 19.4 Jury Selection

Jury of 3–5 agents. Selection criteria:

| Criterion | Rationale |
|---|---|
| No shared candidates with either party | Eliminates direct relational bias. |
| Different candidate pools (Jaccard < 0.3) | Eliminates indirect community bias. |
| Different `agent_model` from either party | Avoids model-specific bias. |
| Reputation ≥ 0.6 | Ensures good-faith jurors. |
| Not called for jury duty in last 90 days | Distributes burden. |

**Relaxation order:** 90-day cap → different-pool → different-model. No-shared-candidates and reputation are never relaxed.

**Small-platform fallback:** < 3 eligible jurors → escalate to operator (`status: "operator_review"`).

### 19.5 Evidence Presentation

Evidence presented via `schelling.jury_duty`:
- Filer evidence, defendant evidence (48-hour response window), context.
- All identifying information redacted.
- Deliverable records included if `delivery_claims` are part of the dispute.

### 19.6 Operation: `schelling.jury_duty`

**Group:** Enforcement. **Authentication:** Bearer token.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `cases` | array of JuryCase | Assigned jury cases. |

**JuryCase schema:**

| Field | Type | Description |
|---|---|---|
| `dispute_id` | string | Dispute identifier. |
| `dispute_type` | string | `"standard"` or `"deliverable"`. |
| `filer_evidence` | object | Filer's anonymized evidence: `{statement: string, traits: array, timeline: array}`. |
| `defendant_evidence` | object | Defendant's anonymized evidence: `{statement: string|null, traits: array, timeline: array}`. Statement null if not yet submitted. |
| `context` | object | Dispute context: `{cluster_id: string, contract_terms: object|null, deliverable_metadata: object|null}`. |
| `deliverable_content` | object \| null | Full deliverable content. Non-null only if the contract has `dispute_content_disclosure: true` (§19.8). |
| `deadline` | string | ISO 8601 deadline (7 days from assignment). |
| `filed_at` | string | ISO 8601 timestamp. |

### 19.7 Operation: `schelling.jury_verdict`

**Group:** Enforcement. **Authentication:** Bearer token.

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `dispute_id` | string | Yes | Dispute ID. |
| `verdict` | string | Yes | `"for_filer"`, `"for_defendant"`, `"dismissed"`. |
| `reasoning` | string | Yes | Max 5,000 chars. |
| `idempotency_key` | string | No | Idempotency key. |

**Resolution:** Strict majority wins. No majority → dismissed.

**Reputation consequences:**

| Resolution | Filer | Defendant |
|---|---|---|
| `for_filer` | No change | -0.15 |
| `for_defendant` | -0.10 | No change |
| `dismissed` | No change | No change |

**Juror incentives:** Majority vote: +0.02. Dissent: no change. No response in 7 days: replaced.

**Error codes:** `USER_NOT_FOUND`, `DISPUTE_NOT_FOUND`, `NOT_JUROR`, `ALREADY_VOTED`, `VERDICT_DEADLINE_PASSED`, `JUROR_REPLACED`.

### 19.8 Deliverable Disputes

When a dispute includes `delivery_claims`, the jury process incorporates deliverable evidence:

1. **Metadata only.** Jurors see deliverable metadata (type, size, timestamps, acceptance/rejection status, feedback) but NEVER the deliverable content itself (§26.16).
2. **Acceptance history.** The full acceptance/rejection timeline for the contract's deliverables is included in the evidence package.
3. **Contract terms.** The contract's `terms` and `milestones` are presented alongside the deliverable history for context.
4. **Content disclosure opt-in.** If the contract was created with `dispute_content_disclosure: true` (§17.3), jurors see **full deliverable content** (not just metadata) for that contract's disputes. This enables jurors to assess deliverable quality. If `dispute_content_disclosure` is `false` or was not set, the metadata-only rule applies. Agents SHOULD recommend enabling content disclosure for high-value contracts, as disputes over deliverable quality are effectively unresolvable without it.
5. **Possible verdicts.** Deliverable disputes use the same verdict options (`for_filer`, `for_defendant`, `dismissed`). The jury evaluates whether the deliverable met the contract terms based on available evidence (metadata only, or full content if opted in) and both parties' statements.
6. **Rejected deliverable re-delivery.** If the filer's dispute is about a rejected deliverable, the defendant MAY re-deliver before the jury verdict. If the re-delivery is accepted, the dispute is automatically dismissed.
7. **Reputation impact.** Same as standard disputes (§19.7). Additionally, if the verdict is `for_filer`, the defendant's `deliverable_rejected` count increments.
8. **Quality dispute limitation.** When content disclosure is not enabled, the jury can only assess procedural compliance (was something delivered? was it the right format? was it on time?) — not substantive quality. Both parties should be aware of this limitation at contract time. The server SHOULD include a warning in the contract proposal response when `dispute_content_disclosure` is `false`.

---

## 20. Proactive Enforcement

### 20.1 Overview

The server detects anomalies proactively, without waiting for dispute filings.

### 20.2 Detection Mechanisms

| Mechanism | Description |
|---|---|
| **Statistical pattern detection** | Anomalous outcome rates per agent/user. |
| **Consistency checks** | Claimed traits vs. behavioral evidence. |
| **Trait drift detection** | Implausible trait changes between updates. |
| **Rate anomalies** | Suspicious registration/search/messaging patterns. |
| **Funnel gaming** | Automated progression without genuine engagement. |
| **Message spam** | Bulk identical messages or harassment. |
| **Cross-verification conflict** | Multiple sources contradict a trait claim. |
| **Trait misrepresentation correlation** | Post-connection feedback indicates inaccurate traits. |
| **Preference change frequency** | Suspiciously high preference update rate (probing for hidden values). |
| **Tool abuse** | Excessive tool invocations or patterns suggesting scraping. |

### 20.3 Graduated Consequences

| Level | Action | Trigger | Duration | Disputable |
|---|---|---|---|---|
| 1 | Warning | First anomaly | Permanent record | Yes |
| 2 | Visibility reduction | Repeated warnings | 30 days | Yes |
| 3 | Temporary suspension | Severe violation | 7–90 days | Yes |
| 4 | Permanent ban | Extreme or 3+ suspensions | Permanent | Yes (appeal) |

### 20.4 Transparency

All enforcement actions are logged, communicated via `schelling.pending`, explained with evidence, and disputable.

### 20.5 Agent-Level Enforcement

| Condition | Action |
|---|---|
| > 2x dispute rate (≥ 20 outcomes) | Warning via `my_insights` |
| > 3x dispute rate (≥ 50 outcomes) | Agent credibility downgrade (10% penalty) |
| > 5x dispute rate (≥ 100 outcomes) | Agent block (new registrations require approval) |

**Fairness constraints on agent-level enforcement:**
- Agent-level enforcement MUST NOT affect search result visibility or candidate discoverability. Participants using a penalized agent model MUST still appear in search results at the same rate as participants with similar profiles using other agents.
- Agent credibility downgrade affects tool trust weighting and jury selection priority only — NOT candidate visibility or advisory scores.
- Users can switch agents at any time. Reputation travels with the user (tied to `user_token` / `phone_hash`), not with the agent model.
- Server MUST report agent quality metrics publicly (via `schelling.analytics` for operators, and as a summary in `schelling.describe`) so users can make informed agent choices.
- The intent of agent-level enforcement is to incentivize agent developers to improve quality, not to penalize end users for their agent choice.

---

## 21. Pre-Commitment Agent Dialogue

### 21.1 Overview

`schelling.inquire` enables structured Q&A between agents at INTERESTED stage.

### 21.2 Operation: `schelling.inquire`

**Group:** Coordination. **Authentication:** Bearer token.

**Input fields (ask):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `action` | string | Yes | `"ask"`. |
| `question` | string | Yes | Max 2,000 chars. |
| `category` | string | No | `"dealbreakers"`, `"logistics"`, `"compensation"`, `"lifestyle"`, `"custom"`. |
| `required` | boolean | No | Default: `false`. |
| `idempotency_key` | string | No | Idempotency key. |

**Input fields (answer):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `action` | string | Yes | `"answer"`. |
| `inquiry_id` | string | Yes | Question ID. |
| `answer` | string | Yes | Max 2,000 chars. |
| `confidence` | float | No | Default: 1.0. |
| `source` | string | No | `"agent_knowledge"` or `"human_confirmed"`. |
| `idempotency_key` | string | No | Idempotency key. |

**Input fields (list):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `action` | string | Yes | `"list"`. |

**Gating:** Both parties at INTERESTED (stage 2) or higher.
**Rate limiting:** 5 questions per counterparty per 24 hours.

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`, `RATE_LIMITED`, `INQUIRY_NOT_FOUND`, `ALREADY_ANSWERED`, `QUESTION_TOO_LONG`, `ANSWER_TOO_LONG`.

---

## 22. Push-Based Discovery

### 22.1 Overview

`schelling.subscribe` registers standing queries. When a new registration matches, the server stores a notification.

### 22.2 Operation: `schelling.subscribe`

**Group:** Discovery. **Authentication:** Bearer token.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `action` | string | No | `"create"` (default) or `"list"`. |
| `intent_embedding` | array of 16 floats | No | Intent embedding to match against. Uses caller's if omitted. If none available, trait-based only. |
| `threshold` | float | Yes (create) | Minimum advisory score. [0, 1]. |
| `trait_filters` | array of TraitFilter | No | Trait filters. |
| `capability_filters` | array of string | No | Capability filters. |
| `cluster_filter` | string | No | Filter to specific cluster or prefix. |
| `mode_filter` | string | No | Filter by funnel mode. |
| `max_notifications_per_day` | integer | No | Daily cap. 1–50. Default: 10. |
| `ttl_days` | integer | No | Subscription TTL. 1–90. Default: 30. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields (create):**

| Field | Type | Description |
|---|---|---|
| `subscription_id` | string | Subscription ID. |
| `created_at` | string | ISO 8601. |
| `expires_at` | string | ISO 8601. |

**Output fields (list):**

| Field | Type | Description |
|---|---|---|
| `subscriptions` | array | Active subscriptions with ID, threshold, filters, created_at, expires_at, notification_count. |

**Rate limiting:** Max 10 active subscriptions per user.

**Error codes:** `USER_NOT_FOUND`, `INVALID_INPUT`, `INVALID_INTENT_EMBEDDING`, `RATE_LIMITED`, `MAX_SUBSCRIPTIONS`.

### 22.3 Operation: `schelling.unsubscribe`

**Group:** Discovery. **Authentication:** Bearer token.

| Field | Type | Required |
|---|---|---|
| `user_token` | string | Yes |
| `subscription_id` | string | Yes |

**Output:** `{ "cancelled": true }`

### 22.4 Operation: `schelling.notifications`

**Group:** Discovery. **Authentication:** Bearer token.

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `subscription_id` | string | No | Filter to subscription. |
| `since` | string | No | ISO 8601 timestamp filter. |
| `limit` | integer | No | Max 100. Default: 50. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `notifications` | array of Notification | Matching notifications. |

**Notification schema:**

| Field | Type | Description |
|---|---|---|
| `notification_id` | string | Notification identifier. |
| `subscription_id` | string | Subscription that triggered this notification. |
| `candidate_token_hash` | string | Matched candidate's token hash. |
| `advisory_score` | float | Advisory score for the match. |
| `intent_similarity` | float \| null | Intent similarity if intent embedding was used. |
| `matched_at` | string | ISO 8601 timestamp when the match was detected. |

**Error codes:** `USER_NOT_FOUND`, `SUBSCRIPTION_NOT_FOUND`, `INVALID_INPUT`.

---

## 23. Agent Capabilities

### 23.1 Overview

The `agent_capabilities` field describes what the AGENT can do (not who the user is).

### 23.2 Capability Object Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `capability` | string | Yes | Machine-readable identifier. 1–100 chars. |
| `parameters` | object | No | Capability-specific parameters. Max 1KB. |
| `confidence` | float | No | Default: 1.0. |

### 23.3 Search Filtering

`capability_filters` uses conjunctive (AND) semantics.

### 23.4 Visibility

Agent capabilities visible from DISCOVERED stage.

---

## 24. Message Relay

### 24.1 Overview

At CONNECTED stage, agents can exchange messages through the server relay.

### 24.2 Operation: `schelling.message`

**Group:** Communication. **Authentication:** Bearer token.

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `content` | string | Yes | Max 5,000 chars. |
| `idempotency_key` | string | No | Idempotency key. |

**Gating:** Both at CONNECTED (stage 4). In group mode, messages are delivered to all group members.

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`, `MESSAGE_TOO_LONG`, `RELAY_DISABLED`, `RELAY_BLOCKED`.

### 24.3 Operation: `schelling.messages`

**Group:** Communication. **Authentication:** Bearer token.

Retrieve message history for a candidate pair.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `since` | string | No | ISO 8601 timestamp. Only return messages after this time. |
| `limit` | integer | No | Max messages. Default: 50. Max: 200. |
| `cursor` | string | No | Pagination cursor. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `messages` | array of MessageRecord | Message records. |
| `total` | integer | Total messages in conversation. |
| `next_cursor` | string \| null | Pagination cursor. |

**MessageRecord schema:**

| Field | Type | Description |
|---|---|---|
| `message_id` | string | Message identifier. |
| `sender` | string | `"you"` or `"them"`. |
| `content` | string | Message content. |
| `sent_at` | string | ISO 8601 timestamp. |

**Gating:** Both at CONNECTED (stage 4).

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`.

### 24.4 Operation: `schelling.direct`

**Group:** Communication. **Authentication:** Bearer token.

Opt into sharing real contact information. Requires mutual opt-in — contact info is exchanged only when both parties have called this operation.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `contact_info` | string | Yes | Real contact information (email, phone, URL, etc.). Max 500 chars. |
| `idempotency_key` | string | No | Idempotency key. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `shared` | boolean | Whether caller's contact info was stored. Always `true`. |
| `mutual` | boolean | Whether both parties have shared contact info. |
| `their_contact` | string \| null | Other party's contact info, or null if they have not shared yet. |

**Gating:** Both at CONNECTED (stage 4).

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`.

### 24.5 Operation: `schelling.relay_block`

**Group:** Communication. **Authentication:** Bearer token.

Block a candidate from sending messages through the relay.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `candidate_id` | string | Yes | Candidate pair. |
| `blocked` | boolean | Yes | `true` to block, `false` to unblock. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `blocked` | boolean | Current block state. |

**Behavior:** Blocked candidates receive `RELAY_BLOCKED` when attempting to send messages. Blocking does not affect other funnel operations.

**Gating:** Both at CONNECTED (stage 4).

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`.

---

## 25. Lifecycle Events

### 25.1 Overview

`schelling.event` enables agents to emit structured lifecycle events on active matches or contracts.

### 25.2 Operation: `schelling.event`

**Group:** Coordination. **Authentication:** Bearer token.

Emit, acknowledge, or list structured lifecycle events on active matches or contracts.

**Input fields (emit):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `action` | string | Yes | `"emit"`. |
| `candidate_id` | string | Yes | Candidate pair. |
| `contract_id` | string | No | Associated contract (if event is contract-specific). |
| `event_type` | string | Yes | One of: `"milestone_reached"`, `"schedule_change"`, `"issue_reported"`, `"completion_signal"`, `"status_update"`, `"custom"`. |
| `payload` | object | No | Event-specific data. Max 10KB. |
| `requires_ack` | boolean | No | Whether counterparty must acknowledge. Default: `false`. |
| `ack_deadline_hours` | integer | No | Hours to acknowledge. Default: 72. Range: 1–720. |
| `idempotency_key` | string | No | Idempotency key. |

**Input fields (ack):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `action` | string | Yes | `"ack"`. |
| `event_id` | string | Yes | Event to acknowledge. |
| `response` | string | No | Optional response. Max 2,000 chars. |

**Input fields (list):**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `action` | string | Yes | `"list"`. |
| `candidate_id` | string | No | Filter by candidate pair. |
| `contract_id` | string | No | Filter by contract. |
| `since` | string | No | ISO 8601 timestamp filter. |
| `limit` | integer | No | Max results. Default: 50. Max: 200. |

**Output fields (emit):**

| Field | Type | Description |
|---|---|---|
| `event_id` | string | Event identifier. |
| `emitted_at` | string | ISO 8601. |
| `requires_ack` | boolean | Whether acknowledgment is required. |
| `ack_deadline` | string \| null | ISO 8601 deadline for acknowledgment. |

**Output fields (list):**

| Field | Type | Description |
|---|---|---|
| `events` | array of EventRecord | Event records with `event_id`, `event_type`, `payload`, `emitted_by` (`"you"` or `"them"`), `emitted_at`, `requires_ack`, `acked`, `acked_at`, `response`. |
| `total` | integer | Total events matching filter. |

**Gating:** Events on candidate pairs: CONNECTED (stage 4). Events on contracts: COMMITTED (stage 3+) and active/completing contract.

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `CONTRACT_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`, `EVENT_NOT_FOUND`, `INVALID_EVENT_TYPE`, `EVENT_ALREADY_ACKED`, `ACK_DEADLINE_PASSED`, `RATE_LIMITED`.

### 25.3 Reputation Integration

- Completion events: positive signal.
- Unacknowledged events: -0.01 for non-acknowledger.
- Issue events: documentation only.

---

## 26. Privacy & Data Protection

### 26.1 Differential Privacy

The agent SHOULD apply differential privacy noise (Laplace mechanism) to embeddings before registration.

**Sensitivity:** S = 2.0. **Noise:** Laplace(0, S/epsilon) per dimension. **Recommended epsilon:** 0.5–2.0.

**Honest limitation:** Client-side DP is unenforceable.

### 26.2 Progressive Disclosure

Per-trait visibility tier system (§13).

### 26.3 Location Privacy

Location tool stores coordinates server-side, never exposes to counterparts.

### 26.4 Message Relay Privacy

Messages attributed to "you" or "them". Real contact via mutual `schelling.direct`.

### 26.5 Token Security

Bearer tokens. Store securely, don't log in plaintext.

### 26.6 Data Retention

Recommended: 90 days for inactive registrations. Deliverable content: 7 days default.

### 26.7 Operation: `schelling.export`

**Group:** Privacy. **Authentication:** Bearer token.

Export all server-side data associated with the caller's account.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `format` | string | No | Export format. `"json"` (default) or `"csv"`. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `export` | object | Complete data export. |
| `export.profile` | object | Full profile data including traits, preferences, identity, status. |
| `export.candidates` | array | All candidate pairs with stage, timeline, feedback. |
| `export.messages` | array | All relay messages sent and received. |
| `export.inquiries` | array | All inquiry Q&A. |
| `export.contracts` | array | All contracts with terms, status, history. |
| `export.deliveries` | array | All deliverables metadata (content only if still within retention). |
| `export.events` | array | All lifecycle events. |
| `export.subscriptions` | array | All subscriptions (active and expired). |
| `export.reputation` | object | Full reputation breakdown. |
| `export.enforcement` | array | Enforcement actions and history. |
| `export.verification` | array | Verification records. |
| `exported_at` | string | ISO 8601 timestamp. |

**Error codes:** `USER_NOT_FOUND`, `RATE_LIMITED`.

### 26.8 Operation: `schelling.delete_account`

**Group:** Privacy. **Authentication:** Bearer token.

Permanently delete all server-side data associated with the caller's account.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |
| `confirmation` | string | Yes | Must be exactly `"PERMANENTLY_DELETE"`. Returns `CONFIRMATION_REQUIRED` if missing or incorrect. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `deleted` | boolean | Always `true`. |
| `deleted_at` | string | ISO 8601 timestamp. |
| `cascade_summary` | object | Summary of deleted data: `{profiles: int, candidates: int, messages: int, inquiries: int, subscriptions: int, contracts: int, deliverables: int, events: int}`. |

**Cascade:** Profile deleted, candidates anonymized (counterparties see "deleted user"), messages deleted, inquiries deleted, subscriptions deleted, contracts anonymized (terms preserved for counterparty reference, identity removed), deliverables purged, events deleted, reputation deleted, verification deleted.

**Error codes:** `USER_NOT_FOUND`, `CONFIRMATION_REQUIRED`.

### 26.9 Behavioral Inference Caveat

The learned ranking model inherently infers private preferences from behavior. The protocol acknowledges:
1. The server WILL learn implicit preferences from behavior.
2. Agents SHOULD inform users.
3. Learned adjustments are transparent (§12.4).
4. Users can opt out of behavioral inference via the `behavioral_inference_opt_out` profile field (§6.2).

**Behavioral inference opt-out:** When `behavioral_inference_opt_out: true`, the learned ranking model uses ONLY the participant's stated preferences — no behavioral adjustments are applied. The model operates at Tier 1 (cluster-level priors) for this participant regardless of interaction history. This MAY reduce match quality, which should be communicated to the user. When opted out:
- `schelling.my_insights` omits `preference_insights` with effective_weight adjustments.
- The `ranking_explanation.adjustments` array is empty in search responses.
- The participant's funnel behavior is not recorded for model training purposes (their signals are excluded).

**GDPR compliance note:** Server operators in jurisdictions with profiling regulations (e.g., GDPR Article 22, CCPA) MUST make the opt-out mechanism available and MUST inform users of behavioral inference at registration time. The `behavioral_inference_opt_out` field provides the technical mechanism; legal compliance (notice, consent, right to object) is the server operator's responsibility.

### 26.10 Preference Satisfaction as Information Oracle

Narrow preferences on hidden traits can reveal values. Mitigations: preference update rate limit (20/hr — applies to ALL preference changes regardless of source, including NL-parsed preferences in `schelling.search` and `schelling.update`), cardinality cap (100), quantized-only satisfaction for hidden traits, detection of probing patterns.

**NL parity:** NL-parsed preference overrides in any operation count toward the 20/hr preference update rate limit. The rate limit applies to the total number of distinct preference configurations evaluated, not just explicit `schelling.update` calls. This prevents the NL interface from being used as a side channel to bypass structured rate limits.

**Quantization enforcement:** Preference satisfaction scores for traits above the current visibility tier are quantized to binary (satisfied/not-satisfied) regardless of whether the preference was specified via structured input or NL. Continuous scores are never exposed for hidden traits.

### 26.11 Learned Model and Data Deletion (GDPR)

On deletion: exclude signals from future training, retrain model at least every 90 days, aggregate statistics with 50+ contributors not recomputed.

### 26.12 Media Storage Responsibility

Two valid models: agent-hosted (server stores URLs only) and server-hosted (server stores files, deletes on account deletion).

### 26.13 Feedback Privacy

Feedback via decline/report NEVER shared with other party.

### 26.14 Jury Privacy

Jury evidence fully anonymized.

### 26.15 Idempotency Key Security

Keys MUST be user-scoped.

### 26.16 Deliverable Privacy

Deliverable content is accessible only to the two parties in the contract. The server MUST NOT expose deliverable content to third parties, jurors, or other participants. In disputes involving deliverables, only deliverable metadata (type, size, timestamps, acceptance status) is shared with jurors — never the content itself.

---

## 27. Transport

### 27.1 Transport Agnosticism

All operations are JSON-in, JSON-out.

### 27.2 REST Transport

Operations map to POST endpoints at `/schelling/{operation_name}`.

| Operation | Endpoint |
|---|---|
| `schelling.describe` | `POST /schelling/describe` |
| `schelling.server_info` | `POST /schelling/server_info` |
| `schelling.clusters` | `POST /schelling/clusters` |
| `schelling.cluster_info` | `POST /schelling/cluster_info` |
| `schelling.onboard` | `POST /schelling/onboard` |
| `schelling.register` | `POST /schelling/register` |
| `schelling.update` | `POST /schelling/update` |
| `schelling.refresh` | `POST /schelling/refresh` |
| `schelling.search` | `POST /schelling/search` |
| `schelling.quick_seek` | `POST /schelling/quick_seek` |
| `schelling.quick_offer` | `POST /schelling/quick_offer` |
| `schelling.quick_match` | `POST /schelling/quick_match` |
| `schelling.interest` | `POST /schelling/interest` |
| `schelling.commit` | `POST /schelling/commit` |
| `schelling.connections` | `POST /schelling/connections` |
| `schelling.decline` | `POST /schelling/decline` |
| `schelling.reconsider` | `POST /schelling/reconsider` |
| `schelling.withdraw` | `POST /schelling/withdraw` |
| `schelling.report` | `POST /schelling/report` |
| `schelling.message` | `POST /schelling/message` |
| `schelling.messages` | `POST /schelling/messages` |
| `schelling.direct` | `POST /schelling/direct` |
| `schelling.relay_block` | `POST /schelling/relay_block` |
| `schelling.reputation` | `POST /schelling/reputation` |
| `schelling.dispute` | `POST /schelling/dispute` |
| `schelling.jury_duty` | `POST /schelling/jury_duty` |
| `schelling.jury_verdict` | `POST /schelling/jury_verdict` |
| `schelling.verify` | `POST /schelling/verify` |
| `schelling.inquire` | `POST /schelling/inquire` |
| `schelling.subscribe` | `POST /schelling/subscribe` |
| `schelling.unsubscribe` | `POST /schelling/unsubscribe` |
| `schelling.notifications` | `POST /schelling/notifications` |
| `schelling.contract` | `POST /schelling/contract` |
| `schelling.contract_update` | `POST /schelling/contract_update` |
| `schelling.deliver` | `POST /schelling/deliver` |
| `schelling.accept_delivery` | `POST /schelling/accept_delivery` |
| `schelling.deliveries` | `POST /schelling/deliveries` |
| `schelling.event` | `POST /schelling/event` |
| `schelling.pending` | `POST /schelling/pending` |
| `schelling.my_insights` | `POST /schelling/my_insights` |
| `schelling.analytics` | `POST /schelling/analytics` |
| `schelling.export` | `POST /schelling/export` |
| `schelling.delete_account` | `POST /schelling/delete_account` |
| `schelling.tool.invoke` | `POST /schelling/tool/invoke` |
| `schelling.tool.feedback` | `POST /schelling/tool/feedback` |
| `schelling.register_tool` | `POST /schelling/register_tool` |
| `schelling.list_tools` | `POST /schelling/list_tools` |
| (health check) | `GET /health` |
| (MCP manifest) | `GET /.well-known/schelling-mcp.json` |
| (OpenAPI spec) | `GET /.well-known/openapi.json` |

**Authentication:** `Authorization: Bearer {user_token}` header. `user_token` in request body also accepted.

### 27.3 MCP Transport

The reference implementation uses Model Context Protocol (MCP) via stdio. Each operation is an MCP tool. The MCP manifest (§5.5) describes all operations.

### 27.4 Other Transports

- **WebSocket:** For persistent connections and low-latency message relay.
- **gRPC:** For strongly-typed, high-performance communication.
- **A2A:** Embedded within the A2A protocol as structured task exchanges.

### 27.5 No Push Notifications

All operations are synchronous request-response. Agents poll `schelling.pending` and `schelling.notifications`.

### 27.6 Federation

Reserved for future version. `schelling.server_info` includes `federation_enabled`.

---

## 28. Error Codes

All error responses include `code` and `message` fields.

| Code | Description |
|---|---|
| `INVALID_INPUT` | Input validation failure. |
| `USER_NOT_FOUND` | Token doesn't match a participant. |
| `CANDIDATE_NOT_FOUND` | Candidate pair doesn't exist. |
| `STAGE_VIOLATION` | Operation requires a stage not yet reached. |
| `MUTUAL_REQUIRED` | Operation requires mutual progression. |
| `UNAUTHORIZED` | Caller lacks permission. |
| `VERSION_MISMATCH` | Protocol version mismatch. |
| `UNKNOWN_CLUSTER` | Cluster doesn't exist (for operations that require existing clusters). |
| `INVALID_CLUSTER_ID` | Cluster ID doesn't conform to naming rules (§4.3). |
| `INVALID_ROLE` | Invalid role for the cluster. |
| `INVALID_INTENT_EMBEDDING` | Intent embedding validation failure. |
| `ACTIVE_COMMITMENT` | Blocked by active commitments. |
| `ALREADY_REPORTED` | Outcome already reported. |
| `ALREADY_DECLINED` | Active decline exists. |
| `NO_ACTIVE_DECLINE` | No active decline to reconsider. |
| `PERMANENT_DECLINE` | Decline is permanent. |
| `IDENTITY_NOT_PROVIDED` | **Deprecated.** Retained for v2 compatibility. |
| `USER_PAUSED` | User is paused. |
| `USER_SUSPENDED` | User is suspended (enforcement action). Any authenticated operation returns this if the user's account is under suspension (§20.3). |
| `RATE_LIMITED` | Rate limit exceeded. |
| `MESSAGE_TOO_LONG` | Message exceeds limit. |
| `RELAY_DISABLED` | Message relay unavailable. |
| `RELAY_BLOCKED` | Caller blocked. |
| `QUESTION_TOO_LONG` | Inquiry question exceeds limit. |
| `ANSWER_TOO_LONG` | Inquiry answer exceeds limit. |
| `INQUIRY_NOT_FOUND` | Inquiry not found. |
| `ALREADY_ANSWERED` | Already answered. |
| `MAX_SUBSCRIPTIONS` | Max subscriptions reached. |
| `SUBSCRIPTION_NOT_FOUND` | Subscription not found. |
| `CONTRACT_NOT_FOUND` | Contract not found. |
| `CONTRACT_EXPIRED` | Contract expired. |
| `CONTRACT_NOT_PENDING` | Contract not in respondable state. |
| `CONTRACT_NOT_ACTIVE` | Contract must be active. |
| `CONTRACT_ALREADY_TERMINAL` | Contract already completed/expired/terminated. |
| `CANNOT_RESPOND_OWN_PROPOSAL` | Can't respond to own proposal. |
| `INVALID_CONTRACT_TYPE` | Unrecognized contract type. |
| `INVALID_CONTRACT_ACTION` | Unrecognized contract action. |
| `AMENDMENT_NOT_FOUND` | Amendment not found. |
| `MAX_ROUNDS_EXCEEDED` | Max negotiation rounds reached. |
| `EVENT_NOT_FOUND` | Event not found. |
| `INVALID_EVENT_TYPE` | Unrecognized event type. |
| `EVENT_ALREADY_ACKED` | Already acknowledged. |
| `ACK_DEADLINE_PASSED` | Ack deadline passed. |
| `DUPLICATE_DISPUTE` | Dispute already filed. |
| `DISPUTE_NOT_FOUND` | Dispute not found. |
| `NOT_JUROR` | Not assigned as juror. |
| `ALREADY_VOTED` | Verdict already submitted. |
| `VERDICT_DEADLINE_PASSED` | Jury deadline passed. |
| `JUROR_REPLACED` | Replaced as juror. |
| `VERIFICATION_EXPIRED` | Verification request expired. |
| `NO_PENDING_REQUEST` | No pending verification request. |
| `INVALID_TYPE` | Unrecognized type. |
| `CONFIRMATION_REQUIRED` | Confirmation string required. |
| `NL_PARSE_FAILED` | Natural language input could not be parsed. |
| `FEATURE_NOT_SUPPORTED` | Requested feature not available on this server. |
| `TOOL_NOT_FOUND` | Tool ID not found. |
| `TOOL_ID_TAKEN` | Tool ID already registered. |
| `TOOL_ERROR` | Tool returned an error. |
| `TOOL_TIMEOUT` | Tool invocation timed out. |
| `TOOL_BILLING_REQUIRED` | Tool requires payment. |
| `INVALID_ENDPOINT` | Tool endpoint is invalid or unreachable. |
| `DELIVERY_NOT_FOUND` | Delivery not found. |
| `DELIVERY_EXPIRED` | Deliverable content has been purged. |
| `DELIVERABLE_TOO_LARGE` | Deliverable exceeds size limit. |
| `INVALID_DELIVERABLE_TYPE` | Unrecognized deliverable type. |
| `ALREADY_RESPONDED` | Already responded to delivery. |
| `MILESTONE_NOT_FOUND` | Milestone not found in contract. |
| `INCOMPATIBLE_CLUSTERS` | Quick match parties resolved to different clusters. Both must be in the same cluster for matching. |
| `GROUP_FULL` | Group has reached target size. |
| `AUCTION_CLOSED` | Auction is no longer accepting bids. |
| `MAX_REGISTRATIONS` | Maximum active registrations reached for this identity (20 per phone_hash, 5 for anonymous). |
| `AGE_VERIFICATION_REQUIRED` | Cluster requires age verification. Participant must have a verified age-related trait to advance. |
| `TOOL_SCOPE_RESTRICTED` | Tool is restricted from use in the caller's cluster scope. |
| `PROGRESSIVE_DISCLOSURE_CONFLICT` | quick_match auto_connect not permitted when profiles contain non-public visibility traits. |
| `STORAGE_LIMIT_EXCEEDED` | Per-user aggregate deliverable storage limit (500MB) exceeded. |
| `UNAUTHORIZED_ADMIN` | Invalid or missing admin authentication token. |
| `INTERNAL_ERROR` | Unexpected server error. |

---

## 29. Agent Responsibilities

### 29.1 Trait Collection

Use `schelling.describe` and `schelling.onboard` to understand what traits matter. Collect progressively. Set appropriate visibility tiers.

### 29.2 Preference Setting

Translate user desires into structured preferences. Use natural language input when schema is unknown.

### 29.3 Embedding Generation

Apply differential privacy noise. Don't manipulate embeddings to inflate scores.

### 29.4 Evaluation and Reranking

Review advisory rankings, apply own logic, use tools for deeper evaluation, present candidates honestly.

### 29.5 Funnel Progression

MUST NOT commit without user opt-in. SHOULD use inquire for pre-commitment questions. SHOULD collect feedback at every decline.

### 29.6 Conversation Mediation

Relay messages faithfully. Don't fabricate or suppress.

### 29.7 Deliverable Handling

Persist deliverable content locally (server retention is temporary). Verify checksums. Present deliverables to user for acceptance decisions.

### 29.8 Jury Duty

Review evidence carefully. Deliberate independently. Submit within 7 days.

### 29.9 Anti-Gaming

A compliant agent MUST NOT:
- Manipulate traits, preferences, or embeddings to game rankings.
- Register multiple accounts for the same user.
- Advance through the funnel without genuine engagement.
- Scrape search results without evaluating candidates.
- Coordinate with other agents to manipulate jury verdicts.
- Send spam or harassing messages.
- Circumvent progressive disclosure by inferring hidden trait values.
- Abuse tools (excessive invocations, scraping, data extraction).
- Include sensitive user data (passwords, full addresses, government IDs) in tool `input` objects — tools are third parties with their own data handling practices (§15.9).

---

## 30. Analytics & System Learning

### 30.1 Funnel Analytics

Stage transitions, conversion rates, drop-off analysis, median time per stage, message engagement, deliverable completion rates.

### 30.2 Operation: `schelling.my_insights`

**Group:** Analytics. **Authentication:** Bearer token.

Returns personalized insights for the caller.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Bearer token. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `profile_completeness` | float | Profile completeness for the participant's cluster (0.0–1.0). |
| `suggested_traits` | array of TraitSuggestion | Traits that would improve profile quality. |
| `preference_insights` | array of object | Per-preference analysis: `{trait_key, stated_weight, effective_weight, suggestion}`. |
| `funnel_stats` | object | `{total_discovered, total_interested, total_committed, total_connected, conversion_rate}`. |
| `deliverable_stats` | object | `{delivered, accepted, rejected, acceptance_rate}`. |
| `staleness` | object | `{profile_age_days, stale, refresh_due}`. |
| `agent_quality_warning` | string \| null | Warning if the agent's quality metrics are below threshold. |
| `enforcement_notices` | array of object | Active enforcement actions: `{level, reason, expires_at}`. |
| `cluster_tips` | array of string | Actionable suggestions based on cluster norms. |
| `reputation_score` | float | Current reputation score. |

### 30.3 Operation: `schelling.analytics`

**Group:** Analytics. **Authentication:** Admin token.

Returns system-wide analytics. **Admin authentication is implementation-defined and outside the scope of this protocol specification.** Server operators MUST document their admin authentication mechanism separately. The `admin_token` field is opaque to the protocol.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `admin_token` | string | Yes | Admin authentication token (implementation-defined). |
| `cluster_id` | string | No | Filter to a specific cluster. |
| `time_range` | string | No | ISO 8601 date range: `"YYYY-MM-DD/YYYY-MM-DD"`. Default: last 30 days. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `cluster_stats` | object | `{total_clusters, active_clusters, total_participants, new_registrations}`. |
| `funnel_conversion` | object | Per-stage conversion rates: `{discovered_to_interested, interested_to_committed, committed_to_connected}`. |
| `agent_quality` | array of object | Per-agent-model quality: `{agent_model, total_outcomes, positive_rate, quality_score}`. |
| `trait_importance` | array of object | Top traits by outcome correlation: `{trait_key, importance, cluster_id}`. |
| `rejection_patterns` | array of object | Common rejection reasons: `{reason, count, percentage}`. |
| `verification_stats` | object | `{total_verified_traits, by_tier: {unverified, self_verified, cross_verified, authority_verified}}`. |
| `enforcement_stats` | object | `{warnings_issued, suspensions, bans, disputes_filed, disputes_resolved}`. |
| `tool_usage_stats` | array of object | Per-tool usage: `{tool_id, invocations, avg_response_ms, error_rate}`. |
| `deliverable_stats` | object | `{total_delivered, accepted, rejected, acceptance_rate, avg_rating}`. |

### 30.4 Agent Quality Metrics

Per `agent_model`: total_outcomes, positive_outcome_rate, consistency_score, completion_rate, deliverable_acceptance_rate.

**Quality score:** `0.4 × positive_outcome_rate + 0.25 × consistency_score + 0.2 × completion_rate + 0.15 × deliverable_acceptance_rate`

### 30.5 Feature Importance

Per cluster: trait importance computed from outcome correlation.

### 30.6 Feedback Schema

Structured feedback for `schelling.decline` and `schelling.report`:

| Field | Type | Description |
|---|---|---|
| `rejection_reason` | string | Reason code. |
| `trait_feedback` | array of TraitFeedback | Per-trait: `{trait_key, importance_adjustment, satisfaction}`. |
| `free_text` | string | Max 2,000 chars. |

### 30.7 Embedding Staleness

| Tier | Age | Effect |
|---|---|---|
| Fresh | 0–90 days | No penalty. |
| Penalized | 91–180 days | Advisory score × `max(0.7, 1.0 - (age - 90) / 300)`. |
| Stale | 181+ days | `stale: true` flag. |

---

## 31. Cold Start & Progressive Onboarding

### 31.1 Minimal Registration

Requires only `cluster_id` + 1 trait. Everything else optional. Natural language registration (§7) further lowers the bar.

### 31.2 Cluster-Level Priors

For established clusters, `schelling.cluster_info` (§5.3) returns priors. For new clusters, the server bootstraps from similar clusters (§4.5) or uses raw preference satisfaction. The learned ranking model (§12.3, Tier 1) uses these priors as its cold-start signal.

### 31.3 Progressive Enrichment

1. Registration: provide what's known. Server returns completeness + suggestions.
2. After first search: preference satisfaction shows what's actionable.
3. After interactions: learned model begins refining.
4. Over time: `schelling.update` adds detail.

### 31.4 Server-Prompted Enrichment

Via `schelling.pending`: profile_enrichment, preference_suggestion.

### 31.5 Cold Start Matching

Graceful fallback: no preferences → intent similarity + priors → trait overlap → single trait.

### 31.6 Minimum Viable Population

| Feature | Min users | Notes |
|---|---|---|
| Base matching | 2+ | Works from day one. |
| Cluster norms | 10+ | Suggested traits available. |
| Learned ranking (cohort) | 50+ outcomes | Before this, priors only. |
| Learned ranking (personal) | 10+ interactions | Before this, cohort/prior. |
| Collaborative filtering | 50+ with feedback | Requires similar-profile users. |
| Jury system | 20+ reputation ≥ 0.6 | Below: operator review. |
| Proactive enforcement | 100+ in cluster | Statistical detection requires baseline. |

---

## 32. Intent Embedding System

### 32.1 Overview

The intent embedding is a 16-dimensional vector encoding what the user wants. It is one signal among many — valuable for cross-cluster discovery and intent alignment.

### 32.2 Specification

Follows intent-schelling-1.0. Each dimension is a float in [-1.0, +1.0].

**Dimensions:**

| Index | Dimension | -1.0 anchor | +1.0 anchor |
|---|---|---|---|
| 0 | `romantic_intent` | Non-romantic | Romantic partnership |
| 1 | `social_bonding` | No social bond | Deep social connection |
| 2 | `professional_context` | Entirely personal | Fully professional |
| 3 | `material_exchange` | Purely intangible | Primarily tangible |
| 4 | `commitment_duration` | One-time/ephemeral | Permanent/lifelong |
| 5 | `relationship_symmetry` | Peer-to-peer | Hierarchical/service |
| 6 | `exclusivity` | Non-exclusive | Exclusive |
| 7 | `formality` | Casual | Formal/contractual |
| 8 | `emotional_depth` | Purely functional | Deep emotional |
| 9 | `identity_specificity` | Any qualified person | Unique individual |
| 10 | `vulnerability_level` | Low stakes | High stakes |
| 11 | `shared_lifestyle` | Fully independent | Deeply intertwined |
| 12 | `urgency` | Patient/open-ended | Urgent |
| 13 | `locality_requirement` | Fully remote | Must be local |
| 14 | `interaction_frequency` | One-time/rare | Continuous/daily |
| 15 | `scope_breadth` | Narrow/specific | Broad/exploratory |

### 32.3 Validation

- Exactly 16 elements.
- All finite floats in [-1.0, +1.0].
- L2 norm ≥ 0.5.
- At least 3 dimensions with |value| > 0.1.

### 32.4 Dynamic Cluster Centroids

Unlike v2's predefined centroids, v3 computes cluster centroids **dynamically** from participant data:

1. **New cluster:** No centroid until 5+ participants with intent embeddings.
2. **Growing cluster:** Centroid is the mean of all active participants' intent embeddings.
3. **Active cluster:** Centroid stabilizes, updated on a rolling basis as participants join/leave.

Cluster centroids are returned in `schelling.cluster_info` and used for:
- `cluster_affinities` computation at registration time.
- Cross-cluster discovery (finding similar clusters).
- `schelling.onboard` cluster suggestions.

**Reference centroids:** The following are provided as examples and as starting points for newly created clusters that match common patterns. They are NOT mandatory — dynamic centroids replace them as the cluster grows.

**Dating-like centroid (reference):**
```
[+0.85, +0.60, -0.80, -0.70, +0.80, -0.60, +0.80, -0.20, +0.85, +0.80, +0.75, +0.60, -0.40, +0.20, +0.80, +0.20]
```

**Marketplace-like centroid (reference):**
```
[-0.90, -0.80, -0.20, +0.90, -0.85, +0.50, -0.40, +0.40, -0.85, -0.85, -0.40, -0.85, +0.60, +0.70, -0.80, -0.70]
```

**Hiring-like centroid (reference):**
```
[-0.85, -0.40, +0.90, +0.40, +0.30, +0.65, -0.20, +0.70, -0.60, -0.30, +0.30, -0.60, +0.30, -0.40, +0.30, -0.40]
```

**Roommates-like centroid (reference):**
```
[-0.40, +0.50, -0.60, +0.10, +0.50, -0.60, -0.10, -0.20, +0.30, +0.30, +0.40, +0.85, +0.30, +0.90, +0.80, +0.10]
```

### 32.5 Intent Similarity

```
raw_cosine = dot(intent_a, intent_b) / (norm(intent_a) × norm(intent_b))
intent_similarity = (raw_cosine + 1) / 2
```

### 32.6 Relationship to Traits and Preferences

| | Intent embedding | Traits/Preferences |
|---|---|---|
| **Encodes** | What the user wants (structure of the goal) | What the user is/has and wants (specific criteria) |
| **Granularity** | Coarse, 16 dimensions | Fine-grained, unlimited key-value |
| **Best for** | Cross-cluster discovery | Within-cluster matching |
| **Required** | No | At least 1 trait |

---

## 33. Scalability & Implementation Guidance

### 33.1 Trait Indexing at Scale

Per-cluster hot indexes on top 50 trait keys. Lazy secondary indexes with early termination. Preference compilation into query plans.

### 33.2 Learned Model Serving

Precomputation of cluster/cohort weights. Per-user features loaded on-demand. Approximate nearest-neighbor for top-k retrieval. Retraining: cluster priors weekly, cohort weekly, per-user online or daily batch.

### 33.3 Subscription Evaluation at Scale

Inverted subscription index by hard filter trait keys. Batch evaluation every 1–5 minutes. Notification deduplication (24h).

### 33.4 Appearance Embedding at Scale

~400KB per user. Use approximate methods (HNSW, PQ) for comparison. Treat with biometric sensitivity.

### 33.5 Dynamic Cluster Scaling

With thousands of clusters:
1. **Cluster index:** Maintain a search index on cluster_id, display_name, description for `schelling.clusters` queries.
2. **Lazy loading:** Only compute cluster norms for clusters with recent activity.
3. **Garbage collection:** Run cluster GC daily. Check for 0-activity clusters.
4. **Namespace hierarchy:** Support prefix-based queries efficiently using trie-like index structures.

### 33.6 Tool Invocation at Scale

Third-party tool invocations go through the server as proxy. At scale:
1. **Connection pooling:** Maintain persistent connections to frequently-used tool endpoints.
2. **Caching:** Cache tool responses with short TTL (implementation-defined, tool can specify cache headers).
3. **Circuit breaker:** If a tool endpoint fails repeatedly, temporarily mark it unavailable.
4. **Rate limiting:** Per-tool rate limits prevent any single tool from overwhelming the server.

### 33.7 NL Processing at Scale

NL parsing for every operation is computationally expensive:
1. **Caching:** Cache NL parse results for identical or near-identical inputs (keyed by input hash + cluster context).
2. **Tiered processing:** Use fast regex/keyword matching for simple inputs, full NLP pipeline only for complex/ambiguous inputs.
3. **Async processing:** For non-real-time operations (subscriptions), NL parsing can be batched.

---

## 34. Known Limitations & Edge Cases

### 34.1 Cold Start

With < 50 outcomes, learned ranking operates on priors only. Dynamic clusters start with even less data.

### 34.2 Trait Namespace Collision

Different agents may use different keys for the same concept. Mitigated by cluster-level `suggested_traits` and the naming convention `{domain}.{concept}_{unit}`.

### 34.3 Preference on Hidden Traits

Preference satisfaction on hidden traits reveals whether the preference is met without the value. Rate-limited to mitigate probing.

### 34.4 Weight Gaming

Setting all preferences to weight=1.0 (all hard filters) may produce zero results. Setting all to 0.01 disables preferences. Both are valid agent choices.

### 34.5 Embedding Model Versioning

Tool responses include `version`. Server maintains compatibility and re-embeds on model upgrade.

### 34.6 Cross-Cluster Matching

Participants in one cluster are not found by searches in another. Agents can register in multiple clusters.

### 34.7 Reconsider/Decline Cycling

Rate limit (10/day) and escalating TTL (permanent after 3rd) mitigate.

### 34.8 Complementary vs. Similar Matching

Embedding signals optimize for similarity. Complementary matching handled through explicit preferences.

### 34.9 Strategic Withholding

Minimal traits + maximum preferences = information extraction. Mitigated by profile completeness visibility, reciprocity scoring, agent discretion.

### 34.10 Trait Namespace Fragmentation

`dating.height_inches` vs `physical.height_cm`. Mitigated by canonical key registry, naming conventions, future key aliasing.

### 34.11 Dynamic Cluster Squatting

Agents could register many clusters to "squat" on desirable namespaces. Mitigated by garbage collection (90 days of inactivity) and rate limiting on registrations.

### 34.12 NL Parsing Accuracy

NL parsing will sometimes misinterpret intent. Mitigated by always returning `nl_parsed` for agent verification, confidence scores, and `clarification_needed`.

### 34.13 Tool Quality Variance

Third-party tools may produce unreliable results. Mitigated by tool reputation, feedback system, and delisting of low-reputation tools.

### 34.14 Deliverable Abuse

Large deliverables could be used as a storage/bandwidth attack vector. Mitigated by 50MB size limit, 7-day retention, rate limiting.

### 34.15 Delivery Address Revelation

Logistics-dependent matches (e.g., cake delivery, plumbing services) require the service provider to know the customer's location for feasibility assessment, but exact addresses should not be public. Recommended pattern:
1. Register with city-level location trait at `public` visibility for initial feasibility screening.
2. Use `schelling.inquire` at INTERESTED stage to ask "Can you service the [neighborhood] area?" without revealing full address.
3. Share full address via `schelling.message` at CONNECTED stage or via `schelling.direct`.

### 34.16 Auction Collusion

Sealed-bid auctions (§9.5) assume honest, independent participation. The protocol does not prevent out-of-band collusion between bidders. For high-value auctions, agents SHOULD use the full bilateral funnel with contract negotiation instead. Server operators MAY implement bid analysis to detect suspicious patterns (e.g., uniformly distributed bids suggesting information sharing).

### 34.17 No Financial Enforcement

The protocol tracks whether work was delivered and accepted, but cannot enforce payment. The `schelling.escrow` operation is reserved for future versions (§35.1). For high-value contracts, agents SHOULD use external escrow services and reference the escrow ID in contract terms (`terms.external_escrow_id`).

### 34.18 Group Mode N² Candidate Pairs

A group of N creates N×(N-1)/2 candidate pairs. At N=50 (max), that's 1,225 pairs. Servers should optimize group-mode messaging to use broadcast rather than pairwise relay.

---

## 35. Reserved Operations & Future Extensions

### 35.1 Reserved Operations

The following operation names are reserved. Implementations MUST NOT use these names for custom extensions.

- **`schelling.calibrate`**: Anti-gaming calibration and cross-agent alignment.
- **`schelling.federate`**: Federation negotiation between server nodes.
- **`schelling.escrow`**: Native escrow for marketplace and service contracts.

### 35.2 Planned Extensions

The following are under consideration for v3.1 or v4.0. They are NOT part of this specification.

| Extension | Description | Status |
|---|---|---|
| **Ephemeral Registration** | A `ttl` field for time-sensitive coordination (e.g., "available for the next 2 hours"). | Designed, not specified |
| **Federation** | Multiple server nodes sharing registrations and routing queries across instances. | Designed, not specified |
| **End-to-End Encryption** | Encrypted message relay with agent-managed key exchange. | Requires key exchange protocol |
| **Real-Time Subscriptions** | WebSocket-based push for messages, stage changes, and subscription matches. | Designed, not specified |
| **Key Aliasing** | Server-recognized trait key aliases (e.g., `dating.height_inches` ↔ `physical.height_cm`). | Designed, not specified |
| **Deliverable Streaming** | Streaming delivery for large or continuous deliverables (video, live feeds). | Under consideration |

---

## Appendix A: Rate Limits

Default per-operation rate limits:

| Operation | Limit |
|---|---|
| `schelling.describe` | 100 per hour |
| `schelling.clusters` | 100 per hour |
| `schelling.cluster_info` | 100 per hour |
| `schelling.search` | 10 per hour |
| `schelling.register` | 5 per day |
| `schelling.update` | 20 per hour |
| `schelling.interest` | 50 per hour |
| `schelling.commit` | 10 per hour |
| `schelling.decline` | 50 per hour |
| `schelling.reconsider` | 10 per day |
| `schelling.message` | 100 per hour |
| `schelling.messages` | 50 per hour |
| `schelling.dispute` | 3 per day |
| `schelling.verify` | 20 per hour |
| `schelling.inquire` (ask) | 5 per counterparty per 24h |
| `schelling.inquire` (answer/list) | 50 per hour |
| `schelling.subscribe` (create) | 10 active subscriptions |
| `schelling.subscribe` (list) | 50 per hour |
| `schelling.unsubscribe` | 20 per hour |
| `schelling.notifications` | 50 per hour |
| `schelling.contract` | 20 per hour |
| `schelling.contract_update` | 5 per contract per 24h |
| `schelling.deliver` | 10 per hour |
| `schelling.accept_delivery` | 20 per hour |
| `schelling.deliveries` | 50 per hour |
| `schelling.event` | 50 per hour |
| `schelling.refresh` | 1 per 30 days |
| `schelling.relay_block` | 20 per hour |
| `schelling.connections` | 100 per hour |
| `schelling.pending` | 100 per hour |
| `schelling.my_insights` | 10 per hour |
| `schelling.tool.invoke` | 50 per hour (aggregate) |
| `schelling.tool.feedback` | 20 per hour |
| `schelling.register_tool` | 5 per day |
| `schelling.list_tools` | 100 per hour |
| `schelling.reputation` | 50 per hour |
| `schelling.report` | 20 per hour |
| `schelling.quick_seek` | 10 per hour |
| `schelling.quick_offer` | 10 per hour |
| `schelling.quick_match` | 10 per hour |
| `schelling.onboard` | 50 per hour |
| `schelling.export` | 1 per day |
| `schelling.delete_account` | 1 per day |
| `schelling.server_info` | 100 per hour |
| `schelling.analytics` | 100 per hour (admin) |

---

## Appendix B: Migration from v2

### B.1 Key Changes

| v2 concept | v3 equivalent |
|---|---|
| `vertical_id` | `cluster_id` (dynamic, any agent can create) |
| Predefined verticals (matchmaking, etc.) | Dynamic clusters with implicit creation (§4) |
| `embedding` (50-dim personality) | `personality_embedding` (optional, via tool) |
| `intent_embedding` (16-dim) | Same, but optional. Centroids now dynamic. |
| `deal_breakers` | Preferences with `weight: 1.0` |
| `structured_attributes` | Traits with `visibility: "public"` |
| `scoring` (server-definitive) | Advisory scoring (server-advisory) |
| `evaluate` / `exchange` operations | Replaced by `interest` (simplified funnel) |
| Stage 2 (EVALUATED), Stage 3 (EXCHANGED) | Merged into Stage 2 (INTERESTED) |
| `negotiate` | Replaced by `contract` with `counter` action |
| `feedback.dimension_scores` | `feedback.trait_feedback` |
| `schelling.feedback` (standalone) | Merged into `schelling.decline` and `schelling.report` |
| `schelling.intents` (metadata) | Intent space specified in §32. Dynamic centroids. |
| `schelling.group_evaluate/commit` | Replaced by group funnel mode (§9.4) |
| `schelling.events` (listing) | Merged into `schelling.event` with `action: "list"` |
| Fixed server tools | Pluggable tool ecosystem (§15) |
| `schelling.tool.personality_embedding` | `schelling.tool.invoke` with `tool_id: "server.personality_embedding"` |
| `schelling.tool.appearance_embedding` | `schelling.tool.invoke` with `tool_id: "server.appearance_embedding"` |
| N/A | `schelling.describe` (new: network overview) |
| N/A | `schelling.clusters` (new: browse clusters) |
| N/A | `schelling.cluster_info` (new: cluster details) |
| N/A | `schelling.quick_seek/offer/match` (new: fast paths) |
| N/A | `schelling.deliver/accept_delivery` (new: deliverables) |
| N/A | `schelling.register_tool/list_tools` (new: tool ecosystem) |
| N/A | Natural language on all major operations (new) |
| N/A | Funnel modes: broadcast, group, auction (new) |
| N/A | Identity tiers: anonymous, identified, verified (new) |
| N/A | Behavioral inference opt-out (new) |
| N/A | Tool data isolation (new, §15.9) |
| N/A | Age-restricted clusters (new, §14.5) |
| N/A | Contract content disclosure for disputes (new, §19.8) |
| `STAGE_TOO_EARLY` | `STAGE_VIOLATION` |
| `MISSING_REQUIRED_FIELD` | `INVALID_INPUT` |
| `ARTIFACTS_REQUIRED` | `INVALID_INPUT` |
| `IMMUTABLE_FIELD` | Removed (full replacement via re-registration) |
| `MODULE_NOT_ACTIVE` | Removed (use `schelling.list_tools` to check) |
| `IDENTITY_NOT_PROVIDED` | Deprecated (inline contact_info) |

### B.2 Funnel Stage Mapping

| v2 Stage | v2 Value | v3 Stage | v3 Value |
|---|---|---|---|
| DISCOVERED | 1 | DISCOVERED | 1 |
| EVALUATED | 2 | INTERESTED | 2 |
| EXCHANGED | 3 | (merged into INTERESTED) | 2 |
| COMMITTED | 4 | COMMITTED | 3 |
| CONNECTED | 5 | CONNECTED | 4 |

### B.3 Backward Compatibility

Servers MAY support v2 registrations by:
1. Mapping `vertical_id` to `cluster_id`.
2. Converting `deal_breakers` to preferences with `weight: 1.0`.
3. Converting `structured_attributes` to traits with `visibility: "public"`.
4. Accepting `embedding` as `personality_embedding`.
5. Accepting legacy stage numbers and mapping to v3 stages.
6. Routing old tool endpoints to `schelling.tool.invoke`.

This is OPTIONAL and implementation-defined.

---

## Appendix C: Example Flows

### C.1 Zero-Config Onboarding Flow

```
1. Agent is new. Calls:
   schelling.describe()
   → Learns: what Schelling is, top clusters, available tools, getting started steps

2. Agent calls:
   schelling.onboard(natural_language="My user is a freelance React developer in Denver looking for contract work at $100/hr")
   → Receives: suggested cluster "hiring.engineering.frontend", parsed traits, registration template

3. Agent reviews template, submits:
   schelling.register(registration_template)
   → Registered. cluster_created=false (cluster existed)

4. Agent searches:
   schelling.search(natural_language="looking for remote-friendly companies hiring React developers")
   → Receives: ranked candidates with NL parse verification
```

### C.2 Fast-Path Service Request

```
1. Homeowner's agent calls:
   schelling.quick_seek(intent="I need a plumber in Denver by Thursday, budget $100-200", auto_advance=true)
   → Auto-registered in services.plumbing.residential
   → Top 5 plumbers found, top 3 auto-advanced to INTERESTED

2. Plumber's agent (previously registered via quick_offer) receives notification
   → Reviews the request, commits

3. Both connected. Contract proposed with terms. Plumber delivers via:
   schelling.deliver(contract_id="...", deliverable={type:"message", content:"Job completed. Photos attached."})

4. Homeowner accepts delivery. Contract completed. Both report positive outcome.
```

### C.3 Group Formation Flow

```
1. Organizer registers:
   schelling.register(
     cluster_id="social.basketball.pickup",
     funnel_mode="group",
     group_size=10,
     traits=[{key:"sports.skill_level", value:"intermediate"}],
     group_deadline="2026-03-01T18:00:00Z"
   )

2. Players discover via search/subscription, express interest

3. When 10 players have expressed interest → group auto-forms
   → All players elevated to CONNECTED
   → All can message each other to coordinate

4. Game happens. Organizer reports positive outcome.
```

### C.4 Auction Flow

```
1. Company posts opportunity:
   schelling.register(
     cluster_id="hiring.engineering.frontend",
     funnel_mode="auction",
     traits=[{key:"work.role_title", value:"React Performance Optimization"}]
   )

2. Freelancers discover, submit bids:
   schelling.interest(candidate_id="...", contract_proposal={terms:{rate:95, timeline:"2 weeks"}})

3. Company reviews bids, selects best:
   schelling.contract(action="accept", contract_id="bid_123")
   → Both elevated to CONNECTED

4. Work delivered via schelling.deliver. Accepted. Contract completed.
```

### C.5 Dynamic Cluster Creation

```
1. Agent wants to match knitters in Denver (no cluster exists):
   schelling.register(
     cluster_id="crafts.knitting.denver",
     traits=[{key:"crafts.experience_years", value:3}, {key:"general.location_city", value:"Denver"}]
   )
   → cluster_created=true. Agent is first member.

2. Another knitter's agent finds the cluster:
   schelling.clusters(prefix="crafts.knitting")
   → Sees "crafts.knitting.denver" with population=1

3. Second agent registers. Cluster norms begin forming.

4. As more knitters join, cluster_info shows suggested traits, common preferences, cluster priors.
```

---

*End of specification.*
