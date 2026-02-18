# Schelling Protocol Specification

**Version:** schelling-1.0
**Status:** Draft
**Date:** 2026-02-14

---

## 1. Overview

The Schelling Protocol enables privacy-preserving matchmaking between personal AI assistants. Modern dating apps optimize for engagement rather than compatibility, and self-reported profiles are inherently performative -- users present idealized versions of themselves rather than accurate ones. AI assistants, by contrast, observe their users over extended periods and develop a deep, behavioral understanding of personality, values, and communication style. Schelling exploits this asymmetry: it defines a standardized embedding format and a tiered matching funnel so that any two agents can compare their users' compatibility without exposing raw personal data. Agents encode their knowledge of users into fixed-dimensional personality embeddings, apply differential privacy noise client-side, and then navigate a multi-stage funnel that progressively reveals more information only as mutual interest is established.

---

## 2. Terminology

**Agent.** An AI assistant acting on behalf of a user. The agent generates the user's personality embedding, manages funnel progression, and presents match recommendations to the user.

**User.** A human participant represented by an agent. Each user is identified by a unique, opaque bearer token issued at registration.

**Embedding.** A fixed-length vector of floating-point values that encodes a user's personality, values, aesthetic preferences, intellectual style, social behavior, and communication patterns. The embedding is the primary input to compatibility scoring.

**Candidate.** A potential match discovered via search. A candidate record links two users and tracks their independent funnel progression.

**Candidate pair.** The ordered tuple (user_a, user_b) where user_a's token is lexicographically less than user_b's token. This canonical ordering ensures each pair has exactly one record.

**Stage.** A numbered step in the matching funnel (0 through 5). Each side of a candidate pair has an independent stage value. Stages never decrease.

**Funnel.** The sequence of stages that a candidate pair progresses through, from initial search through mutual introduction. Each stage gates access to progressively more detailed information.

**Introduction.** The final output of a successful match: the exchange of identity information (name and contact details) between two users whose agents have both opted in.

**Decline.** A permanent, irreversible exit from a candidate pair at any stage. A declined user is excluded from future search results for the declining party.

**Protocol version.** A string identifying the embedding schema, dimension count, ordering, and anchor definitions. Search only compares users registered under the same protocol version.

---

## 3. Protocol Version

The version string for this specification is `schelling-1.0`.

The protocol version identifies the complete embedding schema: the number of dimensions, their ordering, and the semantic anchors that define each dimension's poles. Two users registered under different protocol versions are incomparable -- the server MUST NOT return cross-version results from `match.search`.

Future versions MAY define migration transforms that allow cross-version comparison by projecting embeddings into a common space. Until such transforms are defined, each protocol version constitutes an isolated matching pool.

The version format is `schelling-{major}.{minor}`. A change to the major version indicates a breaking change to the embedding schema (different dimensions, reordering, or incompatible anchor redefinitions). A change to the minor version indicates a backward-compatible extension (additional optional fields, new operations, clarifications).

---

## 4. Operations

The protocol defines eight operations. Each operation is a synchronous request-response exchange. The caller provides a JSON object as input and receives a JSON object as output. On failure, the output contains a `code` field (one of the error codes defined in Section 9) and a human-readable `message` field.

### 4.1 match.register

Register a new user or re-register an existing user with updated data.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `protocol_version` | string | Yes | Must match `schelling-1.0`. |
| `agent_model` | string | No | Identifier for the agent model that generated the embedding. |
| `embedding_method` | string | No | Description of the method used to derive the embedding. |
| `embedding` | array of 50 floats | Yes | Personality embedding. Each value in [-1, 1]. See Section 5. |
| `city` | string | Yes | User's city for geographic filtering. |
| `age_range` | enum | Yes | One of: `"18-24"`, `"25-34"`, `"35-44"`, `"45-54"`, `"55-64"`, `"65+"`. |
| `intent` | array of strings | Yes | One or more of: `"friends"`, `"romance"`, `"collaborators"`. |
| `interests` | array of strings | No | Free-text interest labels (e.g., `"climbing"`, `"jazz"`). |
| `values_text` | string | No | Free-text description of the user's core values. |
| `description` | string | No | Free-text description of the user, written by the agent. |
| `seeking` | string | No | Free-text description of what the user is looking for. |
| `identity` | object | No | `{name: string, contact: string}`. Required for introductions. |
| `user_token` | string | No | If provided, performs re-registration (atomic DELETE + INSERT). |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `user_token` | string | Opaque bearer token identifying the user. Newly generated if not re-registering. |
| `protocol_version` | string | Echoes the protocol version. |
| `dimensions` | number | Number of embedding dimensions (50). |

**Error codes:** `INVALID_INPUT`, `VERSION_MISMATCH`.

**Re-registration semantics.** When `user_token` is provided, the server performs an atomic DELETE of the existing user record followed by an INSERT of the new record. The DELETE cascades to all related records: candidates, declines, and outcomes. This is the mechanism for both updating profile data and deleting all server-side data (by re-registering with minimal data).

---

### 4.2 match.search

**Funnel tier:** 1 (coarse search).

Perform a fast compatibility scan against all eligible users. Returns ranked candidates above a similarity threshold.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Caller's bearer token. |
| `top_k` | integer | No | Maximum number of candidates to return. Range: 1-100. Default: 50. |
| `threshold` | float | No | Minimum compatibility score. Range: 0-1. Default: 0.5. |
| `intent_filter` | string | No | Filter candidates to those with this intent value. |
| `city_filter` | string | No | Filter candidates to those in this city. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `candidates` | array | Ranked list of candidates. |
| `candidates[].candidate_id` | string | Opaque identifier for the candidate pair record. |
| `candidates[].compatibility_score` | float | Overall compatibility score in [0, 1]. |
| `candidates[].shared_categories` | array of strings | Dimensions where both users show strong agreement. |
| `candidates[].intent` | array of strings | The candidate's declared intents. |
| `candidates[].city` | string | The candidate's city. |
| `candidates[].age_range` | string | The candidate's age range. |
| `total_scanned` | integer | Total number of eligible users evaluated. |

**Error codes:** `USER_NOT_FOUND`.

**Gating rules:** None. Any registered user may search.

**Behavior notes:**
- Users who have been declined by the caller are excluded from results.
- For each returned candidate, a candidate pair record is created (or updated if one already exists).
- The caller's stage for each returned candidate is advanced to `max(current_stage, SEARCHED)`.

---

### 4.3 match.compare

**Funnel tier:** 2 (detailed comparison).

Compute a per-group breakdown for one or more candidates. Returns compatibility scores for each of the six dimension groups, shared interests, and complementary traits.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Caller's bearer token. |
| `candidate_ids` | array of strings | Yes | One to twenty candidate pair IDs to compare. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `comparisons` | array | One entry per requested candidate. |
| `comparisons[].candidate_id` | string | The candidate pair ID. |
| `comparisons[].compatibility_score` | float | Overall compatibility score in [0, 1]. |
| `comparisons[].breakdown` | object | Compatibility scores per dimension group. Keys: `personality`, `values`, `aesthetic`, `intellectual`, `social`, `communication`. Each value is a float in [0, 1]. |
| `comparisons[].shared_interests` | array of strings | Interest labels that appear in both users' interest lists (case-insensitive match). |
| `comparisons[].complementary_traits` | array of objects | Dimensions where the two users diverge. Each entry: `{dimension, you, them, label}`. |
| `comparisons[].strongest_alignments` | array of strings | Top 3 dimension names where the users show the strongest shared signal. |

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `ALREADY_DECLINED`.

**Gating rules:** None. The caller must be part of each candidate pair (`UNAUTHORIZED` otherwise).

**Stage advancement:** The caller's stage for each compared candidate is advanced to `max(current_stage, COMPARED)`.

---

### 4.4 match.request_profile

**Funnel tier:** 3 (full profile exchange).

Request the other user's full text profile (description, seeking, interests, values). Gated on mutual tier-2 interest.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Caller's bearer token. |
| `candidate_id` | string | Yes | The candidate pair ID. |

**Output fields (status = "available"):**

| Field | Type | Description |
|---|---|---|
| `status` | string | `"available"`. |
| `candidate_id` | string | The candidate pair ID. |
| `profile.description` | string or null | The other user's description. |
| `profile.seeking` | string or null | What the other user is looking for. |
| `profile.interests` | array of strings or null | The other user's interest labels. |
| `profile.values_text` | string or null | The other user's values description. |
| `profile.compatibility_score` | float | Overall compatibility score. |
| `profile.breakdown` | object | Per-group compatibility scores. |
| `profile.shared_interests` | array of strings | Shared interest labels. |
| `profile.complementary_traits` | array of objects | Divergent dimensions with labels. |

**Output fields (status = "pending_mutual"):**

| Field | Type | Description |
|---|---|---|
| `status` | string | `"pending_mutual"`. |
| `candidate_id` | string | The candidate pair ID. |
| `your_stage` | integer | Caller's current stage. |
| `their_stage` | integer | Other user's current stage. |
| `message` | string | Explanation that the other party has not yet reached tier-2. |

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `ALREADY_DECLINED`.

**Gating rules:** The other side of the candidate pair must be at stage COMPARED (2) or higher. If this gate is not met, the operation succeeds with status `"pending_mutual"` rather than failing.

**Stage advancement:** When the profile is available, the caller's stage is advanced to `max(current_stage, PROFILED)`.

---

### 4.5 match.propose

Indicate that the user wants to proceed to introduction. This operation is called after the agent has presented the tier-3 profile to the user and the user has opted in.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Caller's bearer token. |
| `candidate_id` | string | Yes | The candidate pair ID. |

**Output fields (status = "mutual"):**

When both sides have proposed, the candidate pair automatically advances to INTRODUCED (stage 5). The response includes the other user's identity information.

| Field | Type | Description |
|---|---|---|
| `status` | string | `"mutual"`. |
| `candidate_id` | string | The candidate pair ID. |
| `introduction.name` | string | The other user's name. |
| `introduction.contact` | string | The other user's contact information. |
| `introduction.shared_interests` | array of strings | Shared interest labels. |
| `introduction.compatibility_score` | float | Overall compatibility score. |
| `introduction.suggested_opener` | string | A conversation starter generated from shared interests and alignments. |

**Output fields (status = "pending"):**

When the caller has proposed but the other side has not yet proposed.

| Field | Type | Description |
|---|---|---|
| `status` | string | `"pending"`. |
| `candidate_id` | string | The candidate pair ID. |
| `message` | string | Confirmation that interest has been recorded. |

**Output fields (status = "mutual_no_identity"):**

When both sides have proposed but the other user did not register with identity information.

| Field | Type | Description |
|---|---|---|
| `status` | string | `"mutual_no_identity"`. |
| `candidate_id` | string | The candidate pair ID. |
| `message` | string | Explanation that the other party must re-register with identity data. |

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`, `ALREADY_DECLINED`.

**Gating rules:** The caller must be at stage PROFILED (3) or higher. If not, the operation fails with `STAGE_VIOLATION`.

**Stage advancement:** The caller's stage is advanced to `max(current_stage, PROPOSED)`. If both sides are now at PROPOSED or higher, both stages are atomically advanced to INTRODUCED.

---

### 4.6 match.decline

Permanently exit a candidate pair at any stage. The declined user is excluded from future search results for the declining party.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Caller's bearer token. |
| `candidate_id` | string | Yes | The candidate pair ID. |
| `reason` | string | No | Optional reason for declining (stored for analytics, not shared). |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `declined` | boolean | Always `true`. |

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `ALREADY_DECLINED`.

**Gating rules:** None. Decline is permitted at any stage.

**Behavior notes:**
- Decline is permanent and irreversible.
- The candidate pair record is deleted.
- A decline record is created, storing the stage at which the decline occurred.
- The declined user is excluded from the decliner's future search results.

---

### 4.7 match.get_introductions

Poll for mutual matches that have reached the INTRODUCED stage.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Caller's bearer token. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `introductions` | array | Mutual matches with identity information. |
| `introductions[].candidate_id` | string | The candidate pair ID. |
| `introductions[].name` | string | The other user's name. |
| `introductions[].contact` | string | The other user's contact information. |
| `introductions[].compatibility_score` | float | Overall compatibility score. |
| `introductions[].shared_interests` | array of strings | Shared interest labels. |
| `introductions[].suggested_opener` | string | A generated conversation starter. |
| `pending_proposals` | integer | Number of candidate pairs where the caller has proposed but the other side has not. |

**Error codes:** `USER_NOT_FOUND`.

**Gating rules:** None.

**Behavior notes:** Only introductions where the other user has provided identity information are included. Agents should poll this operation periodically to detect newly formed mutual matches.

---

### 4.8 match.report_outcome

Report the outcome of a match after introduction. This feeds back into the system for future scoring improvements.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_token` | string | Yes | Caller's bearer token. |
| `candidate_id` | string | Yes | The candidate pair ID. |
| `outcome` | enum | Yes | One of: `"positive"`, `"neutral"`, `"negative"`. |
| `met_in_person` | boolean | No | Whether the users met in person. Default: false. |
| `notes` | string | No | Free-text notes about the experience. |

**Output fields:**

| Field | Type | Description |
|---|---|---|
| `recorded` | boolean | Always `true`. |

**Error codes:** `USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `UNAUTHORIZED`, `STAGE_VIOLATION`, `ALREADY_REPORTED`.

**Gating rules:** Both sides of the candidate pair must be at stage INTRODUCED (5). Each user may report an outcome only once per candidate pair.

---

## 5. Embedding Format

The personality embedding is a vector of 50 floating-point values. Each value lies in the range [-1, 1], where -1 and +1 represent the 5th and 95th percentile anchors for that dimension, respectively.

The 50 dimensions are organized into six groups:

| Group | Indices | Dimension count |
|---|---|---|
| Personality | 0--9 | 10 |
| Values | 10--19 | 10 |
| Aesthetic | 20--27 | 8 |
| Intellectual | 28--35 | 8 |
| Social | 36--43 | 8 |
| Communication | 44--49 | 6 |

The dimensions within each group are, in order:

**Personality (0--9):** openness, intellectual_curiosity, aesthetic_sensitivity, conscientiousness, self_discipline, extraversion, social_energy, assertiveness, agreeableness, emotional_stability.

**Values (10--19):** autonomy, tradition, achievement, benevolence, universalism, security, stimulation, hedonism, power, conformity.

**Aesthetic (20--27):** minimalism, nature_affinity, urban_preference, visual, auditory, tactile, symmetry, novelty_seeking.

**Intellectual (28--35):** systematic, abstract, verbal, depth_focused, theoretical, analytical, creative, critical.

**Social (36--43):** introversion, depth_preference, leadership, empathy, humor, conflict_tolerance, formality, spontaneity.

**Communication (44--49):** directness, verbosity, emotional_expression, listener_vs_talker, written_preference, debate_enjoyment.

Each dimension has two pole labels describing the semantic meaning of -1 and +1. Full anchor descriptions, including calibration guidance for agents, are defined in the companion document `embedding-spec.md`.

**Validation rules.** The server MUST reject embeddings that fail any of the following checks:

1. Length is exactly 50.
2. All values are finite (no NaN, no Infinity).
3. All values are in the range [-1, 1].
4. The L2 norm is non-zero (an all-zero embedding carries no signal).

---

## 6. Funnel Stages

The matching funnel is a state machine with six stages, numbered 0 through 5. Each side of a candidate pair has an independent stage value. Stages are monotonically non-decreasing: once a stage is reached, it cannot be reverted.

| Stage | Name | Value | Transition via | Gate |
|---|---|---|---|---|
| NONE | Not yet discovered | 0 | (initial state) | -- |
| SEARCHED | Appeared in search results | 1 | `match.search` | None |
| COMPARED | Detailed comparison performed | 2 | `match.compare` | None |
| PROFILED | Full profile exchanged | 3 | `match.request_profile` | Other side must be >= COMPARED |
| PROPOSED | User has opted in | 4 | `match.propose` | Caller must be >= PROFILED |
| INTRODUCED | Mutual match, identity exchanged | 5 | Automatic | Both sides must be >= PROPOSED |

**Stage tracking.** The candidate pair record stores `stage_a` and `stage_b` independently. The `_a` side corresponds to the user whose token is lexicographically first; the `_b` side corresponds to the other user.

**Idempotency.** All stage updates use `max(current_stage, target_stage)`. Calling an operation that would set a stage to a value less than or equal to the current stage has no effect. This makes all stage-advancing operations idempotent.

**Automatic introduction.** When `match.propose` detects that both `stage_a >= PROPOSED` and `stage_b >= PROPOSED`, both stages are atomically set to INTRODUCED. This is the only transition that modifies both sides in a single operation.

**Decline.** Decline exits the funnel at any stage. It is permanent. The candidate pair record is deleted, and a decline record is created that captures the stage at which the decline occurred. This records a negative signal: the declined user is excluded from the decliner's future search results.

---

## 7. Privacy

The Schelling Protocol uses differential privacy via the Laplace mechanism to protect user personality data. The noise is applied **client-side** by the agent before registration. The server stores only the noisy embedding and never has access to the raw personality vector.

**Sensitivity.** Each embedding dimension has a range of [-1, 1], giving a maximum change of 2.0 per dimension. The sensitivity parameter is therefore `S = 2.0`.

**Noise generation.** For a chosen privacy parameter epsilon, the agent samples noise from a Laplace distribution with scale `S / epsilon` for each dimension and adds it to the raw embedding value. The result is clamped to [-1, 1].

**Epsilon selection.** The protocol recommends epsilon values between 0.5 (strong privacy, significant noise) and 2.0 (light privacy, minimal noise). Lower epsilon values provide stronger privacy guarantees but reduce matching accuracy.

**Client responsibility.** Differential privacy noise application is the responsibility of the client agent. The server cannot verify whether noise was applied or what epsilon was used. A compliant agent MUST apply noise before calling `match.register`. The server's role is limited to storing the embedding it receives and computing compatibility scores from the stored (presumably noisy) embeddings.

---

## 8. Transport

The Schelling Protocol is transport-agnostic. All operations are defined as JSON-in, JSON-out request-response pairs. The protocol does not prescribe a specific transport layer.

The reference implementation uses the Model Context Protocol (MCP) via stdio transport: each operation is exposed as an MCP tool, and agents invoke tools through the standard MCP client-server interface.

Other valid transports include:

- **REST/HTTP.** Each operation maps to a POST endpoint (e.g., `POST /match/search`). The request body is the operation's input JSON; the response body is the operation's output JSON.
- **Agent-to-Agent (A2A).** The protocol can be embedded within the A2A protocol as structured task exchanges.
- **WebSocket.** For persistent connections with lower per-message overhead.
- **gRPC.** For strongly-typed, high-performance inter-service communication.

**No push notifications.** All operations are synchronous request-response. The protocol does not define any server-initiated messages, push notifications, or subscription mechanisms. Agents should poll `match.get_introductions` periodically to detect newly formed mutual matches.

---

## 9. Error Codes

All error responses include a `code` field (one of the values below) and a human-readable `message` field.

| Code | Description |
|---|---|
| `INVALID_INPUT` | The input fails validation: malformed embedding, missing required field, or invalid enum value. |
| `USER_NOT_FOUND` | The provided `user_token` does not correspond to a registered user. |
| `CANDIDATE_NOT_FOUND` | The provided `candidate_id` does not correspond to an existing candidate pair record. |
| `STAGE_VIOLATION` | The operation requires a higher funnel stage than the caller's current stage. |
| `MUTUAL_REQUIRED` | The operation requires mutual progression that has not yet been achieved. |
| `UNAUTHORIZED` | The caller is not part of the referenced candidate pair. |
| `VERSION_MISMATCH` | The provided `protocol_version` does not match the server's supported version. |
| `ALREADY_REPORTED` | An outcome has already been reported by this user for this candidate pair. |
| `ALREADY_DECLINED` | The caller has already declined this candidate. The operation cannot proceed. |
| `IDENTITY_NOT_PROVIDED` | The operation requires identity information that was not included at registration. |

---

## 10. Agent Responsibilities

The agent is the active party in the Schelling Protocol. The server is a passive matchmaking service; the agent drives all decisions.

**Embedding generation.** The agent generates the 50-dimensional personality embedding from its accumulated knowledge of the user. This knowledge comes from observed behavior, conversation history, stated preferences, and inferred traits -- not from a questionnaire or self-report form. The embedding should reflect the user as the agent understands them, not as the user presents themselves.

**Text field generation.** The agent generates the text fields (`interests`, `description`, `seeking`, `values_text`) from observed behavior and stated preferences. These fields are used in tier-2 and tier-3 comparisons and should be accurate, specific, and non-performative.

**User review.** The user MAY review and approve the embedding and text fields before the agent submits them via `match.register`. This is recommended but not required by the protocol. The agent should present the data in a human-readable format and explain what each field represents.

**Privacy noise.** The agent MUST apply differential privacy noise (Laplace mechanism, Section 7) to the embedding before calling `match.register`. The choice of epsilon is the agent's decision, informed by the user's privacy preferences.

**Funnel progression.** The agent decides when to advance through the funnel stages. At each stage, the agent should evaluate the available information and decide whether to continue, compare more candidates, or decline. The agent should not advance to `match.propose` without first presenting the tier-3 profile data to the user and obtaining explicit opt-in.

**Pitch crafting.** When tier-3 profile data is available, the agent crafts a personalized pitch to present to the user. This pitch should highlight compatibility strengths, shared interests, and complementary traits. The user decides whether to proceed based on this pitch.

---

## 11. Reserved Operations

The following operation names are reserved for future use. Implementations MUST NOT use these names for custom extensions.

**`match.server_info`.** Intended for federation discovery: allows an agent to query a server for its supported protocol versions, capabilities, and federation peers.

**`match.calibrate`.** Intended for anti-gaming calibration checks: allows a server to verify that an agent's embedding generation is consistent and not manipulated to produce artificially high compatibility scores.

---

## 12. Security Considerations

**Bearer tokens.** User tokens are bearer tokens. Any party in possession of a user token can act as that user. Agents MUST treat user tokens as secrets: store them securely, do not log them in plaintext, and do not transmit them over unencrypted channels.

**Rate limiting.** The protocol does not define rate limiting, but server implementations SHOULD enforce rate limits on all operations to prevent abuse, particularly on `match.search` (which is computationally expensive) and `match.register` (which can be used to create many accounts).

**No push notifications.** The protocol deliberately avoids server-initiated messages. This eliminates an entire class of security concerns: callback injection, SSRF via webhook URLs, and notification spoofing. Agents poll `match.get_introductions` at their own cadence.

**Data retention and deletion.** Servers SHOULD allow users to delete all their data. The protocol's re-registration mechanism (calling `match.register` with an existing `user_token`) performs a cascading delete of all related records before inserting the new data. An agent can effectively delete all server-side data by re-registering with minimal fields and then discarding the token.

**Embedding inversion.** Noisy embeddings resist reconstruction of raw personality data. The Laplace noise added client-side makes it computationally difficult to recover the original embedding values from the stored noisy version. However, the degree of protection depends on the epsilon chosen by the agent: very high epsilon values (light noise) offer less protection. Agents should choose epsilon values appropriate to their users' privacy requirements.

---

## 13. Compatibility Score

The compatibility score is computed server-side. The algorithm is an implementation detail and MAY be upgraded without changing the protocol version. Clients MUST NOT depend on a specific scoring algorithm, a specific score distribution, or specific score thresholds beyond using the score as a relative ranking signal.

The protocol guarantees only that:

1. Compatibility scores are floats in the range [0, 1].
2. Higher scores indicate greater estimated compatibility.
3. Scores are computed from the stored (noisy) embeddings and, where applicable, shared interests.
4. The per-group breakdown in `match.compare` covers the six dimension groups defined in Section 5.

---

*End of specification.*