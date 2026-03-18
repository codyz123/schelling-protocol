# Schelling Protocol v4 — Submission-Based Open Intent Architecture

Status: DRAFT
Date: 2026-03-17
Author: Schelling Bot (from Cody's direction)

---

## 1. Philosophy

Schelling Protocol is neutral coordination infrastructure — TCP/IP for human coordination. Every human will have an agent. All human↔human coordination flows through agents. Schelling is where those agents coordinate.

The server does NOT think. It stores vectors, does math, keeps records, provides transparency, and enforces rules. Agents do all intelligence — embedding computation, intent parsing, relevance decisions, negotiation strategy.

The architecture must handle ANY coordination intent: hiring, dating, roommates, commerce, collaboration, co-founding, caregiving, bartering — all on the same substrate, with no category-specific code paths.

---

## 2. Data Model

### 2.1 Agents (principals)

An agent represents a human or organization. It is persistent and can have many submissions.

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,                     -- UUID
  api_key_hash TEXT NOT NULL,              -- bcrypt hash of bearer token
  protocol_version TEXT NOT NULL,          -- "4.0"
  display_name TEXT,                       -- optional
  created_at TEXT DEFAULT (datetime('now')),
  last_active_at TEXT,
  status TEXT DEFAULT 'active',            -- active | paused | suspended
  reputation_score REAL DEFAULT 0.5,       -- 0.0–1.0
  metadata TEXT                            -- JSON, agent-controlled
);
```

Agent-level traits are NOT stored server-side. Agents maintain their own trait profiles locally and selectively bake relevant traits into each submission's embeddings and structured data. The server never needs to reason about user-level traits.

### 2.2 Submissions (the atomic coordination unit)

A submission is an intent with supporting data. It has an independent lifecycle.

```sql
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,                     -- UUID
  agent_id TEXT NOT NULL REFERENCES agents(id),
  
  -- Intent (required)
  intent_text TEXT NOT NULL,               -- free text, human-readable
  intent_summary TEXT,                     -- optional short version
  
  -- Embeddings (required, agent-computed using canonical model)
  ask_embedding BLOB NOT NULL,             -- float32[], canonical dim (256 or 512)
  offer_embedding BLOB,                    -- float32[], nullable (some intents are ask-only)
  
  -- Structured data (optional, keyed by tool ID)
  structured_data TEXT,                    -- JSON: { "tool_id": { ...filled schema... }, ... }
  
  -- Tool requirements (optional)
  required_tools TEXT,                     -- JSON: ["tool_id_1", "tool_id_2"]
  preferred_tools TEXT,                    -- JSON: tools that help but aren't required
  
  -- Matching configuration (agent's choice)
  match_config TEXT,                       -- JSON: { min_score, max_candidates, custom_weights }
  
  -- Lifecycle
  status TEXT DEFAULT 'active',            -- active | paused | fulfilled | expired | withdrawn
  ttl_hours INTEGER DEFAULT 720,           -- 30 days default
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  expires_at TEXT NOT NULL,
  
  -- Tags (optional, for discoverability — NOT matching boundaries)
  tags TEXT                                -- JSON: ["hiring", "software", "remote"]
);

CREATE INDEX idx_submissions_agent ON submissions(agent_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_expires ON submissions(expires_at);
```

### 2.3 Candidates (submission pairs)

A candidate represents a potential match between two submissions.

```sql
CREATE TABLE candidates (
  id TEXT PRIMARY KEY,
  submission_a_id TEXT NOT NULL REFERENCES submissions(id),
  submission_b_id TEXT NOT NULL REFERENCES submissions(id),
  
  -- Scores
  score REAL NOT NULL,                     -- composite match score
  ask_offer_sim_ab REAL,                   -- cosine(A.ask, B.offer)
  ask_offer_sim_ba REAL,                   -- cosine(B.ask, A.offer)
  tool_satisfaction REAL,                  -- how well structured data aligns
  
  -- Funnel stages (per-side)
  stage_a INTEGER DEFAULT 0,               -- 0=undiscovered, 1=discovered, 2=interested, 3=committed, 4=connected
  stage_b INTEGER DEFAULT 0,
  
  -- Lifecycle
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  
  UNIQUE(submission_a_id, submission_b_id)
);

CREATE INDEX idx_candidates_submissions ON candidates(submission_a_id, submission_b_id);
CREATE INDEX idx_candidates_score ON candidates(score DESC);
```

### 2.4 Tools (coordination tools — shared schemas)

```sql
CREATE TABLE tools (
  id TEXT PRIMARY KEY,                     -- namespaced: "hiring/software-engineer-v3"
  publisher_agent_id TEXT REFERENCES agents(id),
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Schema
  schema TEXT NOT NULL,                    -- JSON Schema defining the tool's fields
  schema_version TEXT NOT NULL,            -- semver
  
  -- Metadata
  category TEXT,                           -- optional, for browsing
  usage_count INTEGER DEFAULT 0,           -- how many submissions reference this
  adoption_score REAL DEFAULT 0,           -- computed from usage patterns
  
  -- Lifecycle
  status TEXT DEFAULT 'active',            -- active | deprecated | removed
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  
  -- Composability
  extends TEXT                             -- JSON: ["base-tool-id"] for tool inheritance
);

CREATE INDEX idx_tools_category ON tools(category);
CREATE INDEX idx_tools_usage ON tools(usage_count DESC);
```

### 2.5 Negotiation Records

```sql
CREATE TABLE negotiation_records (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  
  -- Record content
  record_type TEXT NOT NULL,               -- proposal | counter | acceptance | rejection | disclosure | event
  submitted_by TEXT NOT NULL,              -- agent_id
  content TEXT NOT NULL,                   -- JSON: the actual record data
  content_hash TEXT,                       -- SHA-256 for tamper evidence
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT                          -- optional TTL on time-sensitive records
);

CREATE INDEX idx_negotiation_candidate ON negotiation_records(candidate_id);
```

---

## 3. Embedding Standard

### 3.1 Canonical Embedding Model

The protocol specifies a canonical embedding model for interoperability. All embeddings in submissions MUST be computed using this model (or a compatible model that produces vectors in the same space).

**v4.0 canonical model:** `text-embedding-3-small` (OpenAI)
- Dimensions: 256 (using `dimensions` parameter for cost efficiency)
- Normalization: L2-normalized
- Encoding: float32 array

The canonical model may be updated in future protocol versions. The server advertises the current canonical model via `describe` / `server_info`.

### 3.2 BYOK Embedding Endpoint (optional server feature)

For agents that cannot call embedding APIs directly (e.g., ChatGPT via paste-back flow), the server MAY provide:

```
POST /schelling/embed
{
  "text": "I need a senior React developer in Denver",
  "api_key_header": "Bearer sk-..."  // agent's own API key, proxied
}
→ { "embedding": [0.12, -0.34, ...], "model": "text-embedding-3-small", "dimensions": 256 }
```

The server proxies the request to the embedding provider using the agent's own API key. The server incurs no cost.

### 3.3 Two Embeddings Per Submission

Each submission produces:
- **ask_embedding**: What the agent is looking for. Computed from intent_text + any ask-relevant context.
- **offer_embedding**: What the agent/principal brings to the table. Computed from relevant user traits + offer details. Nullable for pure-ask submissions (e.g., "looking for a lost dog").

Agents compute these embeddings from their own prompt engineering. Suggested prompt structure:

**For ask_embedding:**
> "Embed the following as a need/want/request: [intent_text + ask details]"

**For offer_embedding:**
> "Embed the following as an offering/capability/resource: [relevant user traits + offer details]"

The protocol does NOT mandate the prompt — agents can optimize their own embedding quality.

---

## 4. Matching Algorithm

### 4.1 Cross-Match Scoring

For submissions A and B:

```
ask_offer_ab = cosine(A.ask_embedding, B.offer_embedding)   -- Does B offer what A wants?
ask_offer_ba = cosine(B.ask_embedding, A.offer_embedding)   -- Does A offer what B wants?

-- Composite cross-match score
cross_score = (w_ab * max(0, ask_offer_ab) + w_ba * max(0, ask_offer_ba)) / (w_ab + w_ba)
```

Default weights: `w_ab = 0.5, w_ba = 0.5` (symmetric). Agents can override via `match_config`.

### 4.2 Tool Satisfaction Scoring

When submissions reference shared tools:
- For each tool that both submissions have filled: compute field-level satisfaction
- Numeric fields: proximity scoring (e.g., salary range overlap)
- Categorical fields: exact or fuzzy match
- Boolean fields: exact match
- Array fields: Jaccard similarity

```
tool_score = average satisfaction across shared tools (0 if no shared tools)
```

### 4.3 Composite Score

```
composite = (α * cross_score) + (β * tool_score) + (γ * reputation_factor)
```

Defaults: α=0.6, β=0.3, γ=0.1. Agents can customize weights per submission via `match_config`.

### 4.4 Candidate Generation

When a new submission arrives:
1. Compute cosine similarity of `ask_embedding` against all active submissions' `offer_embedding` (and vice versa)
2. Filter: `cross_score >= threshold` (default 0.3, configurable per submission)
3. Score tool satisfaction for candidates with shared tools
4. Compute composite score
5. Return top-K candidates (default 50, configurable)
6. Create `candidates` records for surfaced pairs
7. Set both sides to `stage_a/b = DISCOVERED`

### 4.5 Transparency / Analytics

The server provides market transparency to help agents make informed decisions:

```
POST /schelling/market_insights
{
  "submission_id": "...",
  "agent_api_key": "..."
}
→ {
    "pool_size": 14200,                          -- total active submissions
    "estimated_matches": 340,                    -- submissions above threshold for your ask
    "avg_cross_score": 0.52,                     -- average match quality
    "tool_coverage": {
      "hiring/software-v3": {
        "adoption_rate": 0.73,                   -- % of matches that have this tool filled
        "avg_satisfaction_boost": 0.15           -- how much adding this tool improves scores
      }
    },
    "selectivity_analysis": {
      "current_pool": 340,
      "if_required_tool_added": 248,             -- pool with additional tool requirement
      "if_threshold_raised_to_0.5": 120          -- pool with stricter threshold
    }
  }
```

This is the **tradeoff economy made transparent**. An agent can see: "If I require `hiring/software-v3`, I lose 27% of my pool but gain 15% average match quality. Is that worth it?" The agent decides. The server informs.

---

## 5. Coordination Flow

### 5.1 Full Lifecycle

```
1. SUBMIT        Agent registers submission (intent + embeddings + tools)
2. MATCH          Server runs matching, generates candidates
3. DISCOVER       Both agents see scored candidates with breakdown
4. INTEREST       One or both agents express interest
5. DISCLOSE       Staged mutual information exchange (funnel stages)
6. NEGOTIATE      Agents exchange proposals/counters (registered with server)
7. AGREE          Outcome recorded (contract, handshake, etc.)
8. DELIVER        Work/value exchanged
9. SETTLE         Both sides confirm, reputation updated
10. ADJUDICATE    If dispute: evidence-based resolution
```

### 5.2 Staged Disclosure

Information disclosure is agent-controlled. At each funnel stage, agents choose what to reveal:

- **DISCOVERED (1):** Only what's in the submission (intent_text, structured tool data, composite score)
- **INTERESTED (2):** Agent can reveal additional context (e.g., fill requested tools, share portfolio)
- **COMMITTED (3):** Agent can reveal identity, contact info, detailed terms
- **CONNECTED (4):** Full disclosure — direct communication channel established

The protocol doesn't mandate what's revealed at each stage. It provides the stages and lets agents choose.

### 5.3 Negotiation Records

All negotiation events CAN be registered with the server for tamper-evident record-keeping:

```
POST /schelling/negotiation
{
  "candidate_id": "...",
  "record_type": "proposal",
  "content": { "terms": "...", "deadline": "...", "budget": 5000 },
  "agent_api_key": "..."
}
→ { "record_id": "...", "content_hash": "sha256:abc123...", "created_at": "..." }
```

Records are append-only. Content hashes create a tamper-evident chain. If a dispute arises, the full negotiation history is available to the jury.

---

## 6. Tool Marketplace

### 6.1 Tool Operations

```
POST /schelling/tool/publish      -- Publish a new tool (schema)
POST /schelling/tool/list         -- Browse available tools
POST /schelling/tool/get          -- Get a tool's schema + metadata
POST /schelling/tool/recommend    -- "Similar submissions use these tools"
POST /schelling/tool/deprecate    -- Mark a tool as deprecated
```

### 6.2 Tool Schema Format

Tools are JSON Schemas with metadata:

```json
{
  "id": "hiring/software-engineer-v3",
  "display_name": "Software Engineer Profile",
  "description": "Structured data for software engineering roles",
  "schema": {
    "type": "object",
    "properties": {
      "years_experience": { "type": "integer", "minimum": 0 },
      "primary_languages": { "type": "array", "items": { "type": "string" } },
      "location": { "type": "string" },
      "remote_policy": { "type": "string", "enum": ["remote", "hybrid", "onsite"] },
      "salary_range_usd": {
        "type": "object",
        "properties": {
          "min": { "type": "integer" },
          "max": { "type": "integer" }
        }
      }
    },
    "required": ["years_experience", "primary_languages"]
  },
  "schema_version": "3.0.0",
  "extends": ["hiring/base-v2"]
}
```

### 6.3 Convergence Dynamics

Tool adoption is transparent. The server provides:
- Usage count per tool
- Adoption rate in specific embedding neighborhoods (e.g., "78% of hiring-adjacent submissions use this tool")
- Satisfaction improvement correlation (does using this tool improve match outcomes?)

This creates positive feedback loops: popular tools get more adoption, which improves match quality for adopters, which drives more adoption. Schelling focal points emerge organically.

---

## 7. Migration from v3

### 7.1 Endpoint Mapping

| v3 Operation | v4 Equivalent |
|---|---|
| `register` | `agent/create` + `submit` |
| `search` | `match` (searches against submissions, not agents) |
| `quick_seek` | `submit` with ask only |
| `quick_offer` | `submit` with offer only |
| `interest` | `interest` (on candidate, not user pair) |
| `commit` | `commit` (on candidate) |
| `contract propose` | `negotiation` record |
| `report` | `settle` |

### 7.2 Backwards Compatibility

- v3 endpoints remain available but internally create submissions
- `register` with traits → creates agent + submission with server-side embedding (using traits as text)
- `search` → matches against submissions in same cluster (if cluster provided) or globally
- Existing tests should pass with adapter layer

---

## 8. What the Server Provides vs What Agents Do

| Concern | Server | Agent |
|---|---|---|
| Embedding computation | NO (optional BYOK proxy) | YES |
| Intent parsing | NO | YES |
| Trait extraction | NO | YES |
| Matching math | YES (cosine + structured) | Chooses weights/config |
| Market analytics | YES | Consumes to make decisions |
| Tool schemas | Stores + serves | Creates, chooses, fills |
| Negotiation records | Stores (tamper-evident) | Writes records |
| Reputation | Computes from outcomes | Reports outcomes |
| Dispute resolution | Facilitates (jury system) | Participates |
| Enforcement | Reputation consequences | Responds to consequences |

---

## 9. Open Questions

1. **Canonical embedding dimensions:** 256 vs 512? Lower = cheaper + faster matching. Higher = more semantic precision. Recommend starting at 256, upgrading if match quality is insufficient.

2. **Vector index:** At scale (millions of submissions), brute-force cosine is too slow. When do we add approximate nearest neighbor (ANN) indexing? SQLite has no native vector index. Options: sqlite-vss extension, migrate to Postgres with pgvector, or external vector DB.

3. **Tool versioning:** When `hiring/software-engineer-v3` becomes `v4`, do v3 submissions auto-migrate? Probably not — let tools naturally sunset as adoption shifts.

4. **Embedding drift:** If the canonical model changes between protocol versions, all embeddings become incompatible. Need a migration strategy (re-embed on protocol upgrade? dual-index during transition?).

5. **Privacy:** Submission intent_text is stored on the server. For sensitive intents (dating, medical), should there be an option for encrypted intent where only the embedding is server-visible? Embeddings leak some information but far less than plaintext.

---

*This document supersedes the matching model in SPEC.md (v3.0). The protocol version for this architecture is 4.0.*
