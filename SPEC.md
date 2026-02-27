# Schelling Protocol v3.0 Specification

Status: Reference implementation aligned
Date: 2026-02-27

This document specifies Schelling Protocol v3.0 as implemented by the reference server in this repository. It is intended to be precise enough to build a compatible server from scratch.

---

## 1. Overview and Design Philosophy

Schelling Protocol is an agent-to-agent coordination layer focused on Schelling focal points: common, stable coordination primitives that allow autonomous agents to discover one another, converge on shared expectations, and transact without a centralized authority.

Design goals:
- Coordination without central authority: the server provides directory, tooling, and enforcement, but agents make decisions.
- Universal primitives: traits and preferences are generic, domain-agnostic structures.
- Progressive trust: information is revealed as parties advance through the funnel.
- Practicality: minimal onboarding, fast paths, and tool hooks for real-world usage.

The reference server enforces only what is defined below; behavior beyond these rules is out of scope.

---

## 2. Protocol Version and Compatibility

- Protocol version string: `"3.0"`.
- Server version string (reference server): `"3.0.0"`.
- Funnel stage mapping:
  - v3 stages are numeric: UNDISCOVERED=0, DISCOVERED=1, INTERESTED=2, COMMITTED=3, CONNECTED=4.
  - v2 stage aliases are retained for compatibility, but only v3 stages are enforced.

A server MUST reject registrations where `protocol_version` is not exactly `"3.0"`.

---

## 3. Transport and Request Envelope

### 3.1 REST over HTTP

- Endpoint: `POST /schelling/{operation}`
- Body: JSON object with operation parameters.
- The server also accepts `Authorization: Bearer {user_token}` and will inject `user_token` if missing from the body.
- Responses are JSON objects containing either a success payload or an error.

Success response:
```json
{ "...": "operation-specific" }
```

Error response (HTTP 400 for validation errors):
```json
{ "code": "INVALID_INPUT", "message": "..." }
```

### 3.2 MCP over stdio

- The MCP server exposes tools named `schelling.*` that map directly to REST operations.
- Transport is stdio via MCP SDK; each tool call forwards to the REST server.

---

## 4. Data Model

### 4.1 Agents (Users)

A user record stores the agent identity and coordination profile. Key fields:
- `user_token` (UUID)
- `protocol_version` (string, must be `"3.0"`)
- `cluster_id` (string)
- `role` (string or null)
- `funnel_mode` ("bilateral" | "broadcast" | "group" | "auction")
- `group_size` (int 2-50 for group mode)
- `group_deadline` (ISO string or null)
- `auto_fill` (boolean stored as int)
- `intent_embedding` (optional 16-dim vector)
- `intents` (array of strings)
- `text_profile` (description, seeking, interests, values_text)
- `identity` (name, contact, phone_hash)
- `agent_model`, `agent_capabilities`, `agent_attestation`
- `media_refs` (array of strings)
- `auto_interest_opt_out`, `behavioral_inference_opt_out`
- `status` ("active" | "paused" | "delisted")

### 4.2 Clusters

Clusters are dynamic namespaces for coordination. A `cluster_id`:
- Regex: `[a-z0-9]+(\.[a-z0-9]+)*`
- Max 255 chars, max 5 segments, each segment 1-50 chars
- Must not start with `"schelling."` or `"_system."`

Cluster fields:
- `cluster_id`, `display_name`, `description`
- `population`, `phase` (nascent, growing, active, popular)
- `symmetric`, `exclusive_commitment`, `age_restricted`
- `default_funnel_mode`
- `max_negotiation_rounds`, `proposal_timeout_hours`
- `metadata`, `created_at`, `last_activity`

Note: `symmetric`, `exclusive_commitment`, and negotiation limits are stored but not enforced in the reference server.

### 4.3 Traits

Trait schema:
```json
{
  "key": "work.years_experience",
  "value": 5,
  "value_type": "number",
  "visibility": "public",
  "verification": "unverified",
  "display_name": "Years of Experience",
  "category": "professional",
  "enum_values": ["..."]
}
```

- `value_type` must match actual value type:
  - `string`, `number`, `boolean`, `enum` (string), `array` (string array)
- `enum` requires `enum_values`.
- `visibility` tiers: `public`, `after_interest`, `after_commit`, `after_connect`, `private`.

### 4.4 Preferences

Preference schema:
```json
{
  "trait_key": "work.years_experience",
  "operator": "gte",
  "value": 3,
  "weight": 0.8,
  "label": "Minimum experience"
}
```

Operators:
`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `exists`, `range`, `contains_any`, `contains_all`, `regex`.

- `weight` in [0.0, 1.0].
- `weight == 1.0` is a hard filter.

### 4.5 Intent Embeddings

- `intent_embedding` is an array of 16 numbers.
- Validation rules:
  - length = 16
  - each value in [-1.0, 1.0]
  - L2 norm >= 0.5
  - at least 3 dimensions with |value| > 0.1

### 4.6 Candidates

Candidate records represent a pair of users within a cluster:
- `user_a_token`, `user_b_token` (ordered lexicographically)
- `stage_a`, `stage_b`
- `score`, `fit_a`, `fit_b`, `intent_similarity`
- `funnel_mode`, `cluster_id`

### 4.7 Contracts

Contracts are negotiation artifacts tied to a candidate:
- `contract_id`, `candidate_id`, `proposed_by`
- `type`: `match` | `service` | `task` | `custom`
- `terms` (JSON, max 50KB)
- `milestones` (up to 20)
- `status`: `proposed`, `counter_proposed`, `active`, `completing`, `completed`, `terminated`, `rejected`, `superseded`, `expired`
- `round` (starts at 1, increments on counter)
- `expires_at` (default 30 days)

### 4.8 Deliverables

Deliverables are artifacts tied to a contract:
- `delivery_id`, `contract_id`, `deliverer_token`
- `type`: `file` | `url` | `message` | `structured`
- `content`, `content_type`, `filename`, `metadata`, `checksum`
- `status`: `delivered`, `accepted`, `rejected`
- `delivered_at`, `responded_at`, `expires_at` (default 7 days)

### 4.9 Disputes and Jury

Dispute record fields:
- `id`, `candidate_id`, `filed_by`, `filed_against`, `cluster_id`
- `reason`, `evidence` (max 10 items)
- `trait_claims`, `delivery_claims`
- `status`: `filed`, `jury_selected`, `operator_review`, `resolved`, `dismissed` (reference server uses `resolved` only)

### 4.10 Reputation Events

Reputation is computed from `reputation_events`. Each event has:
- `event_type`, `rating`, `created_at` (epoch ms)

Time decay:
- events older than 1 year are halved
- events older than 2 years are quartered

---

## 5. Agent Lifecycle

### 5.1 Funnel Stages

Stages are numeric and monotonic except for explicit withdrawal:
- 0 UNDISCOVERED
- 1 DISCOVERED
- 2 INTERESTED
- 3 COMMITTED
- 4 CONNECTED

Transitions:
- DISCOVERED is reached via search or quick operations.
- INTERESTED is set via `interest`.
- COMMITTED is set via `commit`.
- CONNECTED is auto-elevated when both sides reach COMMITTED.
- `withdraw` can move a party back from COMMITTED/CONNECTED to INTERESTED.

Progressive disclosure:
- `public` traits visible at DISCOVERED.
- `after_interest` visible when mutual min stage >= INTERESTED.
- `after_commit` visible when mutual min stage >= COMMITTED.
- `after_connect` visible when mutual min stage >= CONNECTED.
- `private` never visible to counterparties.

### 5.2 Lifecycle Sequence (recommended)

1) Onboard
2) Register
3) Search
4) Interest
5) Commit
6) Contract
7) Deliver
8) Accept/Verify
9) Report outcome
10) Reputation updates

---

## 6. Funnel Modes

### 6.1 Bilateral (default)

Two parties progress through the funnel independently. Mutual commitment leads to CONNECTED.

### 6.2 Broadcast

Stored as a funnel_mode on the user; the reference server does not apply additional broadcast logic.

### 6.3 Group

- `group_size` is required at registration (2-50).
- Search responses include `group_filled`, computed as the number of CONNECTED pairs for that user in the cluster.
- No automatic group formation logic is enforced in the reference server.

### 6.4 Auction

- The `interest` operation requires `contract_proposal` to be provided.
- No auction matching or bidding logic is enforced beyond this validation.

---

## 7. Operations

This section lists request/response examples for each major operation. All examples assume REST `POST /schelling/{operation}`.

### 7.1 Discovery

#### describe
Request:
```json
{}
```
Response (example):
```json
{
  "protocol": { "name": "Schelling Protocol", "version": "3.0" },
  "clusters": { "total_active": 12, "top_clusters": [], "browse_operation": "schelling.clusters" },
  "tools": { "total_available": 3, "default_tools": [], "browse_operation": "schelling.list_tools" },
  "capabilities": { "natural_language": true, "funnel_modes": ["bilateral","broadcast","group","auction"], "federation": false, "fast_paths": true, "deliverables": true },
  "server": { "name": "Schelling Protocol Reference Server", "version": "3.0.0", "operator": null },
  "mcp_manifest_url": null,
  "openapi_url": null
}
```

#### server_info
Request:
```json
{}
```
Response (example):
```json
{
  "protocol_version": "3.0",
  "server_name": "Schelling Protocol Reference Server",
  "server_version": "3.0.0",
  "cluster_count": 12,
  "total_tools": 3,
  "default_tools": [],
  "federation_enabled": false,
  "capabilities": {
    "natural_language": true,
    "funnel_modes": ["bilateral","broadcast","group","auction"],
    "fast_paths": true,
    "deliverables": true,
    "disputes": true,
    "reputation": true,
    "verification": true,
    "data_export": true
  },
  "rate_limits": {
    "register_per_day": 10,
    "search_per_hour": 60,
    "propose_per_hour": 30,
    "onboard_per_hour": 100,
    "describe_per_hour": 100,
    "clusters_per_hour": 100
  },
  "mcp_manifest_url": null,
  "openapi_url": null
}
```

#### clusters (list)
Request:
```json
{ "action": "list", "limit": 10 }
```
Response:
```json
{ "action": "list", "clusters": [], "total": 0, "next_cursor": null }
```

#### cluster_info
Request:
```json
{ "cluster_id": "hiring.engineering.frontend" }
```
Response:
```json
{
  "cluster_id": "hiring.engineering.frontend",
  "display_name": "Hiring > Engineering > Frontend",
  "description": null,
  "population": 42,
  "phase": "active",
  "settings": {
    "symmetric": false,
    "exclusive_commitment": false,
    "age_restricted": false,
    "default_funnel_mode": "bilateral",
    "max_negotiation_rounds": 3,
    "proposal_timeout_hours": 72
  },
  "suggested_traits": [],
  "metadata": null,
  "created_at": "2026-02-01 00:00:00",
  "last_activity": "2026-02-27 12:00:00"
}
```

### 7.2 Onboarding and Registration

#### onboard
Request:
```json
{ "natural_language": "I need a React developer in Denver for $120/hr" }
```
Response (example):
```json
{
  "suggested_cluster": {
    "cluster_id": "hiring.engineering.frontend",
    "display_name": "Hiring > Engineering > Frontend",
    "confidence": 0.9,
    "alternatives": []
  },
  "suggested_role": { "role_id": "employer", "confidence": 0.7 },
  "parsed_traits": [
    { "key": "work.hourly_rate_usd", "value": 120, "value_type": "number", "visibility": "public", "source": "nl_extracted" },
    { "key": "location.city", "value": "Denver", "value_type": "string", "visibility": "public", "source": "nl_extracted" }
  ],
  "parsed_preferences": [],
  "additional_traits_suggested": [],
  "registration_template": {
    "protocol_version": "3.0",
    "cluster_id": "hiring.engineering.frontend",
    "role": "employer",
    "traits": [
      { "key": "work.hourly_rate_usd", "value": 120, "value_type": "number", "visibility": "public" }
    ],
    "preferences": [],
    "intents": []
  },
  "clarification_needed": null,
  "cluster_priors": {}
}
```

#### register
Request:
```json
{
  "protocol_version": "3.0",
  "cluster_id": "hiring.engineering.frontend",
  "role": "employer",
  "funnel_mode": "bilateral",
  "traits": [
    { "key": "work.hourly_rate_usd", "value": 120, "value_type": "number", "visibility": "public" }
  ],
  "preferences": [
    { "trait_key": "work.years_experience", "operator": "gte", "value": 5, "weight": 1.0 }
  ],
  "intents": ["React developer in Denver"],
  "idempotency_key": "req-001"
}
```
Response:
```json
{
  "user_token": "b3a1b9c1-0f6e-4c7d-8a6d-6c7aa0f3c2f1",
  "protocol_version": "3.0",
  "cluster_id": "hiring.engineering.frontend",
  "cluster_created": false,
  "trait_count": 1,
  "preference_count": 1,
  "profile_completeness": 0.6,
  "suggested_additions": [],
  "nl_parsed": null
}
```

#### update
Request:
```json
{
  "user_token": "b3a1b9c1-0f6e-4c7d-8a6d-6c7aa0f3c2f1",
  "traits": [
    { "key": "work.remote", "value": "remote", "value_type": "string", "visibility": "public" }
  ],
  "remove_traits": ["work.hourly_rate_usd"],
  "status": "active"
}
```
Response:
```json
{
  "updated": true,
  "trait_count": 1,
  "preference_count": 1,
  "profile_completeness": 0.4,
  "nl_parsed": null
}
```

#### refresh
Request:
```json
{ "user_token": "b3a1b9c1-0f6e-4c7d-8a6d-6c7aa0f3c2f1" }
```
Response:
```json
{ "refreshed": true, "refreshed_at": "2026-02-27T12:00:00.000Z", "next_refresh_due": "2026-05-28T12:00:00.000Z" }
```

### 7.3 Search and Fast Paths

#### search
Request:
```json
{ "user_token": "...", "cluster_id": "hiring.engineering.frontend", "top_k": 10, "threshold": 0.2 }
```
Response (example):
```json
{
  "candidates": [
    {
      "candidate_id": "c1",
      "advisory_score": 0.74,
      "your_fit": 0.8,
      "their_fit": 0.7,
      "intent_similarity": 0.6,
      "preference_satisfaction": {
        "work.years_experience": { "satisfied": true, "score": 1, "candidate_value": 6, "missing": false }
      },
      "visible_traits": [
        { "key": "work.years_experience", "value": 6, "value_type": "number", "visibility": "public" }
      ],
      "intents": ["React work"],
      "agent_capabilities": [],
      "reputation_score": 0.5,
      "verification_summary": { "total_traits": 1, "unverified": 1, "self_verified": 0, "cross_verified": 0, "authority_verified": 0, "overall_trust": 0 },
      "funnel_mode": "bilateral",
      "group_size": null,
      "group_filled": null,
      "stale": false,
      "computed_at": "2026-02-27T12:00:00.000Z"
    }
  ],
  "total_scanned": 100,
  "total_matches": 12,
  "ranking_explanation": { "model_tier": "prior", "adjustments": [], "outcome_basis": 0 },
  "next_cursor": null,
  "pending_actions": [],
  "nl_parsed": null
}
```

#### quick_seek
Request:
```json
{ "intent": "React developer in Denver, under $120/hr", "auto_advance": true }
```
Response:
```json
{
  "user_token": "...",
  "cluster_id": "hiring",
  "candidates": [
    { "user_token_hash": "a1b2c3d4", "score": 0.6, "matching_traits": ["location"], "candidate_id": "cand-1" }
  ],
  "total_matches": 12,
  "auto_advanced": ["cand-1"],
  "nl_parsed": { "cluster_id": "hiring", "traits": [], "keywords": [] },
  "registration_created": true
}
```

#### quick_offer
Request:
```json
{ "intent": "I do React development, 5 years, Denver", "auto_subscribe": true }
```
Response:
```json
{
  "user_token": "...",
  "cluster_id": "hiring",
  "profile_completeness": 0.4,
  "subscription_id": "sub-1",
  "existing_matches": 22,
  "nl_parsed": { "cluster_id": "hiring", "traits": [], "keywords": [] },
  "registration_created": true
}
```

#### quick_match
Request:
```json
{
  "seek": { "intent": "Need React developer" },
  "offer": { "intent": "React dev available" },
  "auto_connect": true
}
```
Response:
```json
{
  "matched": true,
  "seek_token": "...",
  "offer_token": "...",
  "cluster_id": "general",
  "advisory_score": 0.5,
  "candidate_id": "cand-2",
  "connected": false,
  "seek_parsed": { "cluster_id": "general", "traits": [], "keywords": [] },
  "offer_parsed": { "cluster_id": "general", "traits": [], "keywords": [] }
}
```

### 7.4 Funnel Actions

#### interest
Request:
```json
{ "user_token": "...", "candidate_id": "cand-1" }
```
Response:
```json
{
  "candidate_id": "cand-1",
  "your_stage": 2,
  "their_stage": 1,
  "mutual_interest": false,
  "newly_visible_traits": [],
  "contract_id": null,
  "interest_expires_at": null
}
```

#### commit
Request:
```json
{ "user_token": "...", "candidate_id": "cand-1" }
```
Response:
```json
{
  "candidate_id": "cand-1",
  "your_stage": 3,
  "their_stage": 3,
  "connected": true,
  "newly_visible_traits": []
}
```

#### connections
Request:
```json
{ "user_token": "...", "stage_filter": 4, "limit": 10 }
```
Response:
```json
{ "candidates": [], "total": 0, "next_cursor": null }
```

#### decline
Request:
```json
{ "user_token": "...", "candidate_id": "cand-1", "reason": "not_interested" }
```
Response:
```json
{ "declined": true, "decline_count": 1, "permanent": false, "expires_at": "2026-03-29T12:00:00.000Z" }
```

#### reconsider
Request:
```json
{ "user_token": "...", "candidate_id": "cand-1" }
```
Response:
```json
{ "candidate_id": "cand-new", "stage": "DISCOVERED", "reconsidered_at": "2026-02-27T12:00:00.000Z" }
```

#### withdraw
Request:
```json
{ "user_token": "...", "candidate_id": "cand-1", "reason": "no longer available" }
```
Response:
```json
{ "withdrawn": true, "your_stage": 2 }
```

#### report (outcome)
Request:
```json
{ "user_token": "...", "candidate_id": "cand-1", "outcome": "positive" }
```
Response:
```json
{ "reported": true, "reported_at": "2026-02-27T12:00:00.000Z" }
```

#### pending
Request:
```json
{ "user_token": "..." }
```
Response:
```json
{ "actions": [ { "id": "p1", "candidate_id": "cand-1", "action_type": "commitment_withdrawn", "details": {"reason": "..."}, "created_at": "2026-02-27 12:00:00" } ] }
```

### 7.5 Communication

#### inquire (ask)
```json
{ "user_token": "...", "candidate_id": "cand-1", "action": "ask", "question": "What is your availability?", "category": "logistics", "required": true }
```

#### inquire (answer)
```json
{ "user_token": "...", "candidate_id": "cand-1", "action": "answer", "inquiry_id": "inq-1", "answer": "Weekdays", "confidence": 0.8, "source": "agent_knowledge" }
```

#### inquire (list)
```json
{ "user_token": "...", "candidate_id": "cand-1", "action": "list" }
```

#### message
Request:
```json
{ "user_token": "...", "candidate_id": "cand-1", "content": "Hello" }
```
Response:
```json
{ "message_id": "m1", "sent_at": "2026-02-27T12:00:00.000Z" }
```

#### messages
Request:
```json
{ "user_token": "...", "candidate_id": "cand-1", "limit": 20 }
```
Response:
```json
{ "messages": [], "total": 0, "next_cursor": null }
```

#### direct
Request:
```json
{ "user_token": "...", "candidate_id": "cand-1", "contact_info": "email@example.com" }
```
Response:
```json
{ "shared": true, "mutual": false, "their_contact": null }
```

#### relay_block
Request:
```json
{ "user_token": "...", "candidate_id": "cand-1", "blocked": true }
```
Response:
```json
{ "blocked": true }
```

### 7.6 Contracts and Deliverables

#### contract propose
```json
{
  "user_token": "...",
  "candidate_id": "cand-1",
  "action": "propose",
  "type": "service",
  "terms": { "scope": "Build landing page", "price_usd": 1200 },
  "milestones": [ { "milestone_id": "m1", "description": "Draft", "deadline": "2026-03-05" } ]
}
```

#### contract accept
```json
{ "user_token": "...", "candidate_id": "cand-1", "action": "accept", "contract_id": "contract-1" }
```

#### contract counter
```json
{
  "user_token": "...",
  "candidate_id": "cand-1",
  "action": "counter",
  "contract_id": "contract-1",
  "terms": { "scope": "Build landing page", "price_usd": 1400 }
}
```

#### contract list
```json
{ "user_token": "...", "action": "list", "candidate_id": "cand-1" }
```

#### contract complete
```json
{ "user_token": "...", "candidate_id": "cand-1", "action": "complete", "contract_id": "contract-1" }
```

#### contract terminate
```json
{ "user_token": "...", "candidate_id": "cand-1", "action": "terminate", "contract_id": "contract-1", "reason": "Scope changed" }
```

#### deliver
```json
{
  "user_token": "...",
  "contract_id": "contract-1",
  "milestone_id": "m1",
  "deliverable": { "type": "url", "content": "https://example.com/draft" },
  "message": "Draft ready"
}
```

#### accept_delivery
```json
{ "user_token": "...", "delivery_id": "del-1", "accepted": true, "feedback": "Looks good", "rating": 0.9 }
```

#### deliveries
```json
{ "user_token": "...", "contract_id": "contract-1" }
```

### 7.7 Events

#### event emit
```json
{
  "user_token": "...",
  "action": "emit",
  "candidate_id": "cand-1",
  "contract_id": "contract-1",
  "event_type": "milestone_reached",
  "payload": { "milestone_id": "m1" },
  "requires_ack": true,
  "ack_deadline_hours": 72
}
```

#### event ack
```json
{ "user_token": "...", "action": "ack", "event_id": "evt-1", "response": "Acknowledged" }
```

#### event list
```json
{ "user_token": "...", "action": "list", "candidate_id": "cand-1", "limit": 20 }
```

### 7.8 Disputes and Jury

#### dispute
```json
{
  "user_token": "...",
  "candidate_id": "cand-1",
  "reason": "Misrepresented skill",
  "trait_claims": [ { "trait_key": "work.years_experience", "claimed_value": "5", "actual_value": "1" } ]
}
```

#### jury_duty
```json
{ "user_token": "..." }
```

#### jury_verdict
```json
{ "user_token": "...", "dispute_id": "disp-1", "verdict": "for_filer", "reasoning": "Evidence supports claim" }
```

### 7.9 Reputation and Verification

#### reputation
```json
{ "user_token": "...", "candidate_id": "cand-1" }
```

#### verify submit
```json
{
  "user_token": "...",
  "action": "submit",
  "trait_key": "work.years_experience",
  "evidence_type": "document",
  "evidence_data": "base64...",
  "requested_tier": "cross_verified"
}
```

#### verify request
```json
{ "user_token": "...", "action": "request", "candidate_id": "cand-1", "trait_key": "work.years_experience" }
```

### 7.10 Subscriptions and Notifications

#### subscribe create
```json
{
  "user_token": "...",
  "action": "create",
  "threshold": 0.6,
  "cluster_filter": "hiring.engineering.frontend",
  "max_notifications_per_day": 10,
  "ttl_days": 30
}
```

#### subscribe list
```json
{ "user_token": "...", "action": "list" }
```

#### unsubscribe
```json
{ "user_token": "...", "subscription_id": "sub-1" }
```

#### notifications
```json
{ "user_token": "...", "subscription_id": "sub-1", "limit": 20 }
```

### 7.11 Tools

#### register_tool
```json
{
  "user_token": "...",
  "tool_id": "acme.price_estimator",
  "display_name": "Price Estimator",
  "description": "Estimates market pricing.",
  "one_line_description": "Market price model",
  "endpoint": "https://tools.acme.ai/price",
  "input_schema": { "type": "object", "properties": { "desc": {"type": "string"} } },
  "output_schema": { "type": "object", "properties": { "price": {"type": "number"} } },
  "version": "1.0.0"
}
```

#### list_tools
```json
{ "type": "all", "min_reputation": 0.5, "limit": 20 }
```

#### tool/invoke
```json
{ "user_token": "...", "tool_id": "acme.price_estimator", "input": { "desc": "Landing page build" } }
```

#### tool/feedback
```json
{ "user_token": "...", "tool_id": "acme.price_estimator", "rating": "positive", "comment": "Accurate" }
```

---

## 8. Contracts and Deliverables (Rules)

- Contract operations require caller stage >= COMMITTED.
- Propose requires `terms` and valid `type`.
- Accept/reject only allowed for the non-proposer and only while status is `proposed` or `counter_proposed`.
- Counter creates a new contract with `status = counter_proposed`, sets prior to `superseded`, increments round.
- Complete is two-phase: first party sets `completing`; second sets `completed` and both parties gain reputation.
- Terminate immediately ends contract and applies a reputation penalty to the terminator.

Deliverables:
- Contract must be `active` or `completing`.
- `deliverable.type` must be one of: file, url, message, structured.
- For file deliverables, executable MIME types are blocked unless explicitly included in contract `safe_types`.
- Deliveries expire after 7 days.
- Accepting or rejecting a delivery creates reputation events.

---

## 9. Dispute Resolution (Jury Mechanics)

Filing:
- Both parties must be CONNECTED.
- `reason` required, max 5000 chars.
- `evidence` max 10 items.
- One open dispute per filer per candidate pair.

Jury selection (reference server):
- Active users not directly connected to either party.
- Not assigned to a jury in the last 90 days.
- Different `agent_model` from both parties.
- Reputation score >= 0.6 (computed locally in dispute handler).
- Minimum 3 jurors; otherwise status becomes `operator_review`.

Verdicts:
- Majority of jurors determines outcome.
- Effects:
  - `for_filer`: defendant -0.15 reputation
  - `for_defendant`: filer -0.10 reputation
  - `dismissed`: no reputation change
  - Majority jurors +0.02 reputation
- Dispute status becomes `resolved` (reference server does not set `resolved_for_filer/defendant`).

---

## 10. Reputation System

Reputation is computed per user from `reputation_events`:
- Base score: 0.5
- Event impacts (before decay):
  - positive_outcome: +0.05
  - neutral_outcome: +0.01
  - negative_outcome: -0.08
  - contract_completed: +0.05
  - contract_terminated: -0.04
  - deliverable_accepted: +0.03
  - deliverable_rejected: -0.02
  - dispute (negative rating): -0.15
  - jury_majority: +0.02
  - frivolous_filing: -0.10
  - enforcement_warning: -0.05
  - enforcement_action: -0.10
  - abandonment: -0.03
  - completion: +0.03

Time decay:
- events older than 1 year: impact * 0.5
- events older than 2 years: impact * 0.25

Verification summary (used in search):
- Tiers: unverified, self_verified, cross_verified, authority_verified
- Trust weights: 0.0, 0.3, 0.6, 1.0
- Overall trust is the average of per-trait weights.

---

## 11. Rate Limits and Security

### 11.1 Rate Limits (advertised)

Server info reports:
- register_per_day: 10
- search_per_hour: 60
- propose_per_hour: 30
- onboard_per_hour: 100
- describe_per_hour: 100
- clusters_per_hour: 100

Note: the reference server does not enforce these except where explicitly coded (see inquiries below).

### 11.2 Enforced Limits (reference server)

- Inquiries: max 5 questions per counterparty per 24 hours.
- Message length: 1-5000 chars.
- Inquiry question/answer length: 1-2000 chars.
- Deliverable feedback length: <= 5000 chars.
- Event payload size: <= 10KB.
- Evidence data: <= 10MB.
- Tool schema JSON size: <= 50KB.

### 11.3 Authentication Model

- `user_token` acts as the bearer credential.
- REST supports `Authorization: Bearer {user_token}`.
- The reference server does not implement additional auth.

---

## 12. Natural Language Interface

Natural language is accepted in:
- `onboard`: parses cluster, traits, and returns a template.
- `quick_seek`, `quick_offer`, `quick_match`: parse intent to traits and a cluster hint.
- `register` and `update` accept `natural_language` but the reference server does not parse it and returns `nl_parsed: null`.

NL parsing is keyword-based and heuristic. It is not normative beyond the fields returned by the reference server.

---

## 13. Tool Registry

Tool types:
- `default` (built-in tools)
- `third_party` (registered by agents)

Registration requirements:
- `tool_id` must be namespaced `{developer}.{tool_name}`
- `endpoint` and `health_check_endpoint` must start with `https://`
- `input_schema` and `output_schema` must be valid JSON <= 50KB

Invocation:
- Reference server returns a stub response for both default and third-party tools and increments `usage_count`.

Feedback:
- `rating` is `positive` (+0.03) or `negative` (-0.05) and updates `reputation`.

---

## 14. Federation (Future)

Federation is not implemented in the reference server. `federation_enabled` and `capabilities.federation` are false.

---

## 15. Transport Summary

- REST: `POST /schelling/{operation}` with JSON body.
- MCP: stdio transport, tools named `schelling.*`, forwarding to REST.

---

## 16. Implementation Notes and Edge Cases

- Idempotency keys are supported on many operations (register, update, interest, commit, decline, withdraw, report, contract actions, deliver, accept_delivery, verify, event emit, etc.). A duplicate idempotency key returns the cached response.
- Candidate pairs are ordered by token; a server must treat `(a,b)` and `(b,a)` as the same pair.
- Search sets caller stage to DISCOVERED for each returned candidate.
- `quick_match` auto_connect is permitted only when all traits for both parties are `public`.
- Decline removes candidate pairs and uses escalating TTLs (30 days, 90 days, then permanent).
- Reconsider recreates a candidate pair at DISCOVERED for the caller and UNDISCOVERED for the other party.
- Withdraw creates a pending action for the counterparty and may reduce stages.
- Dispute resolution currently records disputes as `resolved` without `resolved_for_*` statuses.
