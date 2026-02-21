# Schelling Protocol v2 — Implementation Plan

**Date:** 2026-02-18
**Status:** Ready for execution
**Baseline:** Current codebase with hard verticals, unidirectional scoring, no intent embeddings

---

## Current State Assessment

### What Exists (Reusable)

| Module | Status | Reuse? |
|---|---|---|
| `src/db/schema.ts` | v2 schema with `vertical_id`, no intent embeddings | **REWRITE** — needs intent_embedding column, new tables |
| `src/db/client.ts` | SQLite via `bun:sqlite` | **REUSE** as-is |
| `src/types.ts` | DIMENSION_NAMES, Stage enum, pole labels, helper fns | **MODIFY** — add intent dimensions, bidirectional types, new error codes |
| `src/matching/compatibility.ts` | Unidirectional cosine similarity, shared categories | **REWRITE** — needs bidirectional scoring, intent similarity |
| `src/matching/privacy.ts` | Embedding validation | **MODIFY** — add intent embedding validation |
| `src/core/funnel.ts` | Stage machine, transition rules | **REUSE** with minor tweaks |
| `src/core/reputation.ts` | 5-factor reputation computation | **MODIFY** — change vertical_id → cluster_id |
| `src/core/identity.ts` | Identity management | **REUSE** |
| `src/core/disputes.ts` | Basic dispute filing | **REWRITE** — needs jury system |
| `src/core/abuse.ts` | Abuse detection stubs | **REUSE** |
| `src/core/logger.ts` | Structured logging | **REUSE** |
| `src/handlers/register.ts` | Registration with vertical_id | **REWRITE** — intent embeddings, cluster affinity |
| `src/handlers/search.ts` | Unidirectional search with vertical_id | **REWRITE** — bidirectional, intent space, staleness |
| `src/handlers/compare.ts` | Unidirectional evaluate | **REWRITE** — bidirectional, explainability |
| `src/handlers/request-profile.ts` | Profile exchange | **MODIFY** — add bidirectional scores, explainability |
| `src/handlers/propose.ts` | Commit handler | **MODIFY** — bidirectional scores, relay info |
| `src/handlers/get-introductions.ts` | Connections handler | **MODIFY** — add relay fields |
| `src/handlers/decline.ts` | Hard decline, no expiry | **REWRITE** — add expiry, feedback |
| `src/handlers/withdraw.ts` | Basic withdrawal | **REUSE** with minor reputation integration |
| `src/handlers/report-outcome.ts` | Outcome reporting | **MODIFY** — add feedback param |
| `src/handlers/negotiate.ts` | Negotiation handler | **MODIFY** — change vertical_id → cluster context |
| `src/handlers/server-info.ts` | Server info | **MODIFY** — update capabilities, rename verticals→clusters |
| `src/handlers/list-verticals.ts` | List verticals | **REWRITE** → `schelling.intents` handler |
| `src/handlers/onboard.ts` | Onboarding guide | **MODIFY** — intent-based onboarding |
| `src/handlers/file-dispute.ts` | Dispute filing | **REWRITE** — jury system |
| `src/handlers/verify.ts` | Verification | **REUSE** |
| `src/handlers/export-data.ts` | Data export | **MODIFY** — add new tables |
| `src/handlers/delete-account.ts` | Account deletion | **MODIFY** — add new tables to cascade (including decline_pair_history, similar_users, user_attributes), anonymize (not delete) reputation events reported by this user about others |
| `src/handlers/get-reputation.ts` | Reputation query | **MODIFY** — cluster_id, agent quality |
| `src/verticals/registry.ts` | Vertical registry | **REWRITE** → cluster registry |
| `src/verticals/types.ts` | Vertical descriptor types | **REWRITE** → cluster config types |
| `src/verticals/matchmaking/descriptor.ts` | Matchmaking config | **REWRITE** → cluster centroid config |
| `src/verticals/marketplace/descriptor.ts` | Marketplace config | **REWRITE** → cluster centroid config |
| `src/verticals/marketplace/scoring.ts` | Marketplace scoring | **REUSE** — wrap in module interface |
| `src/transports/mcp.ts` | MCP tool bindings | **MODIFY** — add new tools, rename ops |
| `src/transports/rest.ts` | REST endpoints | **MODIFY** — add new endpoints |
| `src/index.ts` | Server entry point | **MODIFY** — init clusters instead of verticals |
| `tests/*` | 9 test files | **MODIFY** — update for new schema, add new tests |

**Summary:** ~30% reusable as-is, ~35% needs modification, ~35% needs rewriting.

---

## Dependency Graph

```
Phase 1: Schema & Intent Space Foundation
    │
    ├──→ Phase 2: Bidirectional Scoring
    │        │
    │        ├──→ Phase 8: Match Explainability
    │        │
    │        └──→ Phase 7: Feedback & Learning (partial — needs Phase 2 scores)
    │
    ├──→ Phase 3: Intent Clustering & Module Activation
    │
    ├──→ Phase 4: Decline Expiry & Reconsider
    │
    ├──→ Phase 5: Profile Update
    │
    ├──→ Phase 6: Message Relay
    │
    ├──→ Phase 10: Embedding Staleness & Agent Quality
    │
    └──→ Phase 9: Agent Jury System (independent of scoring, needs schema)

Phase 7: Feedback & Learning
    │
    └──→ Phase 11: Analytics & A/B Testing

Phase 12: Testing UI (parallel to everything after Phase 2)

Phase 1 + Phase 3 ──→ Phase 13: Peer Roles in Talent
Phase 1 + Phase 2 ──→ Phase 14: Multi-Party Groups
Phase 1 ──→ Phase 15: Structured Attributes & Hard Filters
Phase 1 + Phase 2 ──→ Phase 16: Inquire
Phase 1 + Phase 2 ──→ Phase 17: Subscribe
Phase 1 + Phase 15 ──→ Phase 18: Agent Capabilities
Phase 1 + Phase 2 + Phase 10 ──→ Phase 19: Contracts
    │
    └──→ Phase 20: Events (also needs Phase 1 + Phase 2 for match-only events)
```

**Parallelizable pairs:**
- Phase 4 + Phase 5 + Phase 6 (all independent after Phase 1)
- Phase 8 + Phase 9 (after Phase 2, independent of each other)
- Phase 10 + Phase 11 (after Phase 7)
- Phase 12 can start after Phase 2

**Highest risk phases:**
1. **Phase 1** (Schema Migration) — Foundation for everything; mistakes cascade
2. **Phase 2** (Bidirectional Scoring) — Core algorithm change; affects all handlers
3. **Phase 7** (Feedback & Learning) — Most complex new logic; collaborative filtering
4. **Phase 9** (Agent Jury) — Decentralized system; hard to test edge cases

---

## Phase 1: Schema Migration & Intent Space Foundation

**Complexity:** XL
**Estimated time:** 3–4 days
**Dependencies:** None (this is the foundation)

### What's Being Built

Replace `vertical_id` with intent embeddings throughout the DB and codebase. Add `intent_embedding` column to users table. Create cluster registry to replace vertical registry.

### DB Schema Changes

```sql
-- Migration 001: Add intent embedding support

-- Connection pooling and performance setup
PRAGMA foreign_keys = ON;  -- CRITICAL: SQLite ignores FK constraints by default. Must be set per-connection.
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;
PRAGMA temp_store=MEMORY;

-- Rate limiting table (foundation for all endpoints)
CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  window_start INTEGER NOT NULL,  -- Unix timestamp
  request_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_token, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON rate_limits(user_token, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- 1. Add intent_embedding column to users
ALTER TABLE users ADD COLUMN intent_embedding TEXT; -- JSON array of 16 floats
ALTER TABLE users ADD COLUMN intents TEXT; -- JSON array of natural-language strings (replaces intent)
ALTER TABLE users ADD COLUMN intent_tags TEXT; -- JSON object {index: [tags]}
ALTER TABLE users ADD COLUMN primary_cluster TEXT; -- Computed from intent_embedding
ALTER TABLE users ADD COLUMN cluster_affinities TEXT; -- JSON {cluster_id: cosine_sim}
ALTER TABLE users ADD COLUMN last_registered_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE users ADD COLUMN structured_attributes TEXT; -- JSON object for categorical filtering

-- 2. Rename vertical_id to cluster context (keep column for migration, add new)
-- We keep vertical_id temporarily for backward compat, add primary_cluster
-- vertical_id will be dropped in a later migration after all code references updated

-- 3. Update candidates table
ALTER TABLE candidates ADD COLUMN score_your_fit REAL; -- A→B directional
ALTER TABLE candidates ADD COLUMN score_their_fit REAL; -- B→A directional
ALTER TABLE candidates ADD COLUMN intent_similarity REAL; -- Intent cosine sim
ALTER TABLE candidates ADD COLUMN computed_at TEXT NOT NULL DEFAULT (datetime('now')); -- Score computation timestamp
ALTER TABLE candidates ADD COLUMN algorithm_variant TEXT; -- For A/B testing

-- 4. Update declines table
ALTER TABLE declines ADD COLUMN expiry_at TEXT; -- ISO 8601 expiry timestamp, NULL = permanent
ALTER TABLE declines ADD COLUMN reconsidered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE declines ADD COLUMN reconsidered_at TEXT;
ALTER TABLE declines ADD COLUMN feedback TEXT; -- JSON feedback object
ALTER TABLE declines ADD COLUMN repeat_count INTEGER NOT NULL DEFAULT 1; -- Escalating: 1st, 2nd, 3rd+

-- Repeat-decline tracking (survives re-registration)
CREATE TABLE IF NOT EXISTS decline_pair_history (
  decliner_token TEXT NOT NULL,
  declined_token TEXT NOT NULL,
  total_declines INTEGER NOT NULL DEFAULT 0,
  last_declined_at TEXT NOT NULL DEFAULT (datetime('now')),
  permanent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (decliner_token, declined_token)
);

-- Background jobs queue
CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled ON background_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON background_jobs(job_type);

-- 5. Idempotency cache (referenced by ensureIdempotency() but missing from original migrations)
CREATE TABLE IF NOT EXISTS idempotency_cache (
  fingerprint TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 6. Normalized user attributes for structured attribute filtering (avoids JSON scanning)
CREATE TABLE IF NOT EXISTS user_attributes (
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  attr_key TEXT NOT NULL,
  attr_value TEXT NOT NULL,
  PRIMARY KEY (user_token, attr_key, attr_value)
);
CREATE INDEX IF NOT EXISTS idx_user_attrs_kv ON user_attributes(attr_key, attr_value);

-- 7. Pre-computed similar users for collaborative filtering (avoids O(N) scan per score)
CREATE TABLE IF NOT EXISTS similar_users (
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  similar_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  similarity REAL NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (user_token, similar_token)
);
CREATE INDEX IF NOT EXISTS idx_similar_users_token ON similar_users(user_token, similarity DESC);

-- 8. Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_users_primary_cluster ON users(primary_cluster);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_registered ON users(last_registered_at);
CREATE INDEX IF NOT EXISTS idx_users_embedding_search ON users(status, primary_cluster, last_registered_at); -- Composite for search
CREATE INDEX IF NOT EXISTS idx_candidates_scores ON candidates(combined_score DESC, computed_at DESC); -- Search ranking
CREATE INDEX IF NOT EXISTS idx_candidates_user_tokens ON candidates(user_token_a, user_token_b); -- Relationship lookups
CREATE INDEX IF NOT EXISTS idx_declines_expiry ON declines(expiry_at);
CREATE INDEX IF NOT EXISTS idx_declines_active ON declines(decliner_token, expiry_at, reconsidered); -- Active decline check

-- Embedding storage optimization (consider pgvector extension for production)
-- SQLite: Store as JSON arrays (current approach)
-- PostgreSQL migration path: Use vector(50) for embeddings, vector(16) for intent_embeddings
-- With HNSW index: CREATE INDEX ON users USING hnsw (embedding vector_cosine_ops);
```

### Exact TypeScript Type Definitions

```typescript
// Core data types with complete field specifications
export interface UserRecord {
  user_token: string;
  role: string;
  agent_model: string;
  protocol_version: string;
  created_at: string; // ISO 8601
  last_registered_at: string; // ISO 8601
  status: "active" | "paused" | "suspended";
  
  // Embeddings (required)
  embedding: number[]; // 50 dimensions, [-1, 1]
  intent_embedding: number[]; // 16 dimensions, [-1, 1]
  
  // Intent metadata
  intents: string[]; // Natural language intent descriptions
  intent_tags?: Record<number, string[]>; // {dimension_index: [tags]}
  primary_cluster: string; // Computed from intent_embedding
  cluster_affinities: Record<string, number>; // {cluster_id: cosine_similarity}
  
  // Profile data
  description: string;
  seeking: string;
  interests: string;
  values_text?: string;
  age_range?: string;
  city?: string;
  deal_breakers?: Record<string, any>;
  structured_attributes?: Record<string, any>; // For categorical filtering
  media_refs?: string[];
  
  // Identity & verification
  identity?: {
    name: string;
    contact: string;
    additional?: Record<string, any>;
  };
  verification_level: "anonymous" | "verified" | "attested"; // Matches spec §5.4 (NOT "none")
  verification_artifacts?: any[];
  
  // Reputation & quality
  reputation_score: number; // [0, 1]
  interaction_count: number;
  consistency_score?: number; // [0, 1], requires ≥5 outcomes
  agent_quality_score?: number; // [0, 1], computed from outcomes
}

export interface CandidateRecord {
  id: string;
  user_token_a: string;
  user_token_b: string;
  group_id: string; // Always pair for v2.0
  stage: Stage;
  created_at: string; // ISO 8601
  computed_at: string; // Score computation timestamp
  
  // Bidirectional scores
  score_your_fit: number; // A→B fit, [0, 1]
  score_their_fit: number; // B→A fit, [0, 1] 
  combined_score: number; // sqrt(your_fit * their_fit)
  intent_similarity: number; // Intent cosine similarity, [0, 1]
  
  // Score breakdown (JSON stored)
  breakdown: ScoreBreakdown;
  
  // Metadata
  algorithm_variant?: string; // For A/B testing
  stale: boolean; // Profile >180 days old
  penalized: boolean; // Staleness penalty applied
}

export interface ScoreBreakdown {
  trait_similarity: number;
  intent_similarity: number;
  preference_alignment: number;
  deal_breaker_pass: number;
  collaborative_signal: number;
  shared_categories: string[];
  complementary_traits: Array<{
    dimension: string;
    your_value: number;
    their_value: number;
    difference: number;
  }>;
  strongest_alignments: string[];
}

export interface DeclineRecord {
  id: string;
  candidate_id: string;
  decliner_token: string;
  declined_at: string; // ISO 8601
  expiry_at?: string; // ISO 8601, null for permanent
  reconsidered: boolean;
  reconsidered_at?: string; // ISO 8601
  feedback?: FeedbackData;
  repeat_count: number; // 1st, 2nd, 3rd+ decline of same person
}

export interface FeedbackData {
  dimension_scores?: Record<string, number>; // [-1, 1] per dimension
  rejection_reason?: string;
  rejection_freeform?: string;
  what_i_wanted?: string;
  satisfaction?: "very_satisfied" | "satisfied" | "neutral" | "dissatisfied" | "very_dissatisfied";
  would_recommend?: boolean;
}

export interface BackgroundJob {
  id: string;
  job_type: "score_recompute" | "reputation_update" | "collaborative_filter" | "stale_cleanup";
  payload: Record<string, any>;
  status: "pending" | "processing" | "completed" | "failed";
  scheduled_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
}

// API request/response types
export interface RegisterRequest {
  role: string;
  agent_model: string;
  embedding: number[];
  intent_embedding: number[];
  intents: string[];
  intent_tags?: Record<number, string[]>;
  description: string;
  seeking: string;
  interests: string;
  values_text?: string;
  age_range?: string;
  city?: string;
  deal_breakers?: Record<string, any>;
  structured_attributes?: Record<string, any>;
  media_refs?: string[];
  identity?: {
    name: string;
    contact: string;
    additional?: Record<string, any>;
  };
  verification_level?: "anonymous" | "verified" | "attested"; // Matches spec §5.4
  verification_artifacts?: any[];
}

export interface SearchResponse {
  candidates: Array<{
    candidate_id: string;
    your_fit: number; // Quantized to 2dp at DISCOVERED
    their_fit: number; // Quantized to 2dp at DISCOVERED  
    combined_score: number; // Quantized to 2dp at DISCOVERED
    intent_similarity: number; // Quantized to 2dp at DISCOVERED
    breakdown: Partial<ScoreBreakdown>; // Limited at DISCOVERED
    stale: boolean;
    computed_at: string;
  }>;
  total_matches: number;
  next_cursor?: string;
  pending_actions: PendingAction[];
}

export interface PendingAction {
  id: string;
  candidate_id?: string;
  action_type: "evaluate" | "exchange" | "respond_proposal" | "review_commitment" | 
               "review_dispute" | "provide_verification" | "provide_identity" | 
               "new_message" | "direct_request" | "jury_duty" | "profile_refresh" | "mutual_gate_expired";
  created_at: string;
  metadata?: Record<string, any>;
}
```

### Algorithm Specifications (Exact Pseudocode)

```typescript
// Cosine similarity computation (16-dimensional intent space)
function cosineSimilarity16(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < 16; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Bidirectional score calculation (exact formula)
function computeBidirectionalScore(
  embeddingA: number[], embeddingB: number[],
  intentA: number[], intentB: number[],
  learnedPrefsA?: LearnedPreferences,
  learnedPrefsB?: LearnedPreferences,
  dealBreakersA?: Record<string, any>,
  dealBreakersB?: Record<string, any>
): BidirectionalScore {
  
  // Compute A→B directional fit
  const yourFit = computeDirectionalFit(embeddingA, embeddingB, intentA, intentB, learnedPrefsA, dealBreakersA);
  
  // Compute B→A directional fit  
  const theirFit = computeDirectionalFit(embeddingB, embeddingA, intentB, intentA, learnedPrefsB, dealBreakersB);
  
  // Combined score = geometric mean
  const combinedScore = Math.sqrt(yourFit * theirFit);
  
  return { yourFit, theirFit, combinedScore };
}

function computeDirectionalFit(
  scorerEmbedding: number[],
  candidateEmbedding: number[],
  scorerIntent: number[],
  candidateIntent: number[],
  learnedPrefs?: LearnedPreferences,
  dealBreakers?: Record<string, any>
): number {
  
  // Component 1: Trait similarity (40% weight)
  const traitSim = cosineSimilarity50(scorerEmbedding, candidateEmbedding);
  const traitComponent = 0.40 * (traitSim + 1) / 2; // Map [-1,1] → [0,1]
  
  // Component 2: Intent similarity (20% weight)  
  const intentSim = cosineSimilarity16(scorerIntent, candidateIntent);
  const intentComponent = 0.20 * (intentSim + 1) / 2;
  
  // Component 3: Preference alignment (20% weight)
  const prefAlignment = learnedPrefs ? 
    computePreferenceAlignment(candidateEmbedding, learnedPrefs) :
    (traitSim + 1) / 2; // Default to trait similarity
  const prefComponent = 0.20 * prefAlignment;
  
  // Component 4: Deal-breaker pass (10% weight)
  const dealBreakerPass = dealBreakers ? 
    checkDealBreakers(candidateEmbedding, dealBreakers) : 1.0;
  const dealBreakerComponent = 0.10 * dealBreakerPass;
  
  // Component 5: Collaborative signal (10% weight) 
  const collabSignal = 0.5; // Default when no collaborative data
  const collabComponent = 0.10 * collabSignal;
  
  return traitComponent + intentComponent + prefComponent + 
         dealBreakerComponent + collabComponent;
}

// Reputation computation (5-factor weighted)
function computeReputation(events: ReputationEvent[], clusterId: string): ReputationScore {
  const now = Date.now();
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  
  let outcomeSum = 0, completionSum = 0;
  let totalWeight = 0;
  const scores: number[] = [];
  const outcomes: number[] = [];
  
  for (const event of events) {
    const ageMs = now - new Date(event.created_at).getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    
    // Time decay: max(0.2, e^(-age_days/365))
    const timeWeight = Math.max(0.2, Math.exp(-ageDays / 365));
    
    // Cross-cluster bleed: 0.8 * cluster_score + 0.2 * global_score
    const clusterWeight = event.cluster_id === clusterId ? 0.8 : 0.2;
    const effectiveWeight = timeWeight * clusterWeight;
    
    outcomeSum += event.outcome_value * effectiveWeight;
    completionSum += (event.completed ? 1 : 0) * effectiveWeight;
    totalWeight += effectiveWeight;
    
    // Store for consistency calculation
    if (event.combined_score && event.outcome_value !== undefined) {
      scores.push(event.combined_score);
      outcomes.push(event.outcome_value);
    }
  }
  
  if (totalWeight === 0) return { score: 0.5, breakdown: defaultBreakdown() };
  
  // Factor 1: Outcome (40% weight)
  const outcomeScore = outcomeSum / totalWeight;
  
  // Factor 2: Completion (20% weight) 
  const completionScore = completionSum / totalWeight;
  
  // Factor 3: Consistency (20% weight) - Pearson correlation
  const consistencyScore = scores.length >= 5 ? 
    Math.max(0, pearsonCorrelation(scores, outcomes)) : 0.5;
  
  // Factor 4: Dispute (10% weight) - simplified, floored at 0
  const disputeScore = Math.max(0, 1.0 - (events.filter(e => e.type === 'dispute_loss').length * 0.15));
  
  // Factor 5: Tenure (10% weight)
  const earliestEvent = Math.min(...events.map(e => new Date(e.created_at).getTime()));
  const tenureDays = (now - earliestEvent) / (24 * 60 * 60 * 1000);
  const tenureScore = Math.min(1.0, tenureDays / 180); // Max at 6 months
  
  // Weighted combination
  const rawScore = 0.40 * outcomeScore + 0.20 * completionScore + 
                   0.20 * consistencyScore + 0.10 * disputeScore + 0.10 * tenureScore;
  
  // Cold start: score 0.5 for <5 interactions
  // NOTE: The spec says "events weighted 1.5× during provisional period" — this means
  // the TIME DECAY weight of events is multiplied by 1.5, NOT the final score.
  // The 1.5× weighting is applied inside the event loop above via effectiveWeight.
  const interactionCount = events.length;
  const finalScore = interactionCount < 5 ? 0.5 : rawScore;
  
  // Consistency penalty: <0.3 after 10+ events reduces effective reputation
  const penaltyApplied = interactionCount >= 10 && consistencyScore < 0.3;
  const effectiveScore = penaltyApplied ? 
    finalScore * Math.max(0.5, consistencyScore) : finalScore;
  
  return {
    score: Math.max(0, Math.min(1, effectiveScore)),
    breakdown: {
      outcome: outcomeScore,
      completion: completionScore, 
      consistency: consistencyScore,
      dispute: disputeScore,
      tenure: tenureScore
    },
    interaction_count: interactionCount,
    penalty_applied: penaltyApplied
  };
}

// Pearson correlation for consistency scoring
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  // Handle constant arrays: if all outcomes identical and positive, that's perfect consistency
  if (denominator === 0) {
    return y.every(v => v === y[0]) && y[0] >= 0.5 ? 1.0 : 0.0;
  }
  return numerator / denominator;
}

// Time decay staleness penalty
function computeStalenessPenalty(lastRegisteredAt: string): StalenessInfo {
  const ageMs = Date.now() - new Date(lastRegisteredAt).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  
  if (ageDays <= 90) {
    return { factor: 1.0, stale: false, penalized: false };
  }
  
  const stale = ageDays > 180;
  const penalized = ageDays > 90;
  
  // Linear decay from 1.0 to 0.7 between day 90-390
  const factor = penalized ? Math.max(0.7, 1.0 - (ageDays - 90) / 300) : 1.0;
  
  return { factor, stale, penalized };
}
```

### Files Modified

| File | Change |
|---|---|
| `src/db/schema.ts` | Add complete schema with all new tables, indexes, and PRAGMA settings. Include rate_limits table, background_jobs table, structured_attributes column, algorithm_variant tracking. |
| `src/types.ts` | Add complete TypeScript interfaces above. Include ALL §14 error codes, bidirectional score types, background job types, pending action types. Define exact algorithm interfaces. |
| `src/matching/privacy.ts` | Add `validateIntentEmbedding(embedding: number[]): ValidationResult` with exact validation: 16 dims, range [-1,1], L2 norm ≥ 0.5, ≥3 dims with |value| > 0.1, finite values, dimension labels for errors. **Also update existing `validateTraitEmbedding`** to check `Number.isFinite()` per dimension (NaN/Infinity rejection was missing). |
| `src/handlers/register.ts` | Complete rewrite with: structured validation pipeline, ACTIVE_COMMITMENT checks, exact centroid computations, backward compatibility, rate limiting (5 req/hour), connection pooling, transaction boundaries, error handling patterns, input sanitization, structured logging. |
| `src/handlers/search.ts` | Add pagination cursors, USER_PAUSED check, staleness penalties, score quantization at DISCOVERED, composite indexing utilization, rate limiting (30 req/hour), caching layer for frequent searches. |

### New Files

| File | Purpose |
|---|---|
| `src/clusters/centroids.ts` | Define the 4 pre-defined cluster centroid vectors, affinity threshold (0.5), cluster IDs. Export `CLUSTER_CENTROIDS`, `computeClusterAffinities(intentEmbedding)`, `getPrimaryCluster(intentEmbedding)`. |
| `src/clusters/registry.ts` | Replace `src/verticals/registry.ts`. Store `IntentClusterConfig` objects. `initClusterRegistry()`, `getCluster(id)`, `listClusters()`. Backward compat shim that maps vertical lookups to cluster lookups. |
| `src/clusters/types.ts` | Replace `src/verticals/types.ts`. `IntentClusterConfig`, `ClusterRole`, `ModuleDescriptor`, `ClusterFunnelConfig`, `ClusterDealBreakerConfig`. |
| `src/clusters/matchmaking.ts` | Matchmaking cluster config (replaces `src/verticals/matchmaking/descriptor.ts`). |
| `src/clusters/marketplace.ts` | Marketplace cluster config (replaces `src/verticals/marketplace/descriptor.ts`). |
| `src/clusters/talent.ts` | Talent cluster config (new). |
| `src/clusters/roommates.ts` | Roommates cluster config (new). |
| `src/matching/intent.ts` | `computeIntentSimilarity(a, b)`, `cosineSimilarity16(a, b)` for intent embeddings. |
| `src/db/migrations/001-intent-space.ts` | Migration script that runs ALTER TABLE statements, backfills existing users with cluster centroid as intent_embedding based on their vertical_id. |

### Data Migration Strategy

For existing users with `vertical_id`:
1. Set `intent_embedding` = centroid vector of their `vertical_id` cluster
2. Set `intents` = `[vertical_id]` (e.g., `["matchmaking"]`)
3. Set `primary_cluster` = `vertical_id`
4. Set `cluster_affinities` = `{vertical_id: 1.0}`
5. Set `last_registered_at` = `created_at`

### Error Handling & Best Practices

```typescript
// Connection pooling configuration
const connectionPool = {
  maxConnections: 10,
  idleTimeout: 30000,
  acquireTimeout: 10000,
  retryDelay: 1000,
  maxRetries: 3,
  // CRITICAL: Set PRAGMA foreign_keys = ON for every new connection
  onConnect: (conn) => conn.exec('PRAGMA foreign_keys = ON'),
};

// Redis failure mode: SOFT-FAIL for rate limiting
// If Redis is unavailable, rate limiting is bypassed (log warning, allow request).
// Cache misses degrade to database queries. Never hard-fail on Redis outage.

// Structured logging format
interface LogContext {
  user_token?: string;
  operation: string;
  phase: string;
  duration_ms?: number;
  error_code?: string;
  validation_errors?: string[];
  rate_limit_hit?: boolean;
}

// Rate limiting per endpoint (requests per hour)
// Rate limits per spec §16.3 (requests per hour unless noted)
const RATE_LIMITS = {
  'schelling.register': 5,      // Per DAY (spec §16.3), not per hour
  'schelling.search': 10,       // Per hour (spec §16.3)
  'schelling.evaluate': 50,     // Per hour (spec §16.3)
  'schelling.exchange': 20,     // Per hour (spec §16.3)
  'schelling.message': 100,     // Per hour (spec §16.3)
  'schelling.update': 20,       // Per hour (spec §16.3)
  'schelling.refresh': 1,       // Per 30 DAYS (spec §5.5b)
  'schelling.commit': 10,       // Per hour (spec §16.3)
  'schelling.feedback': 50,     // Per hour (spec §16.3)
  'schelling.dispute': 3,       // Per DAY (spec §16.3)
  'schelling.reconsider': 10,   // Per DAY (spec §16.3)
  'schelling.relay_block': 20,  // Per hour (spec §16.3)
};
// NOTE: Also implement IP-based rate limiting for schelling.register (10/hour/IP)
// to prevent rate limit bypass via new account creation.

// Transaction boundaries (SERIALIZABLE isolation for critical operations)
async function registerUser(data: RegisterRequest): Promise<RegisterResponse> {
  const connection = await pool.acquire();
  const transaction = await connection.beginTransaction('SERIALIZABLE');
  
  try {
    // 1. Validation phase (fail fast)
    const validationResult = await validateRegistrationData(data);
    if (!validationResult.valid) {
      await transaction.rollback();
      return { success: false, error: 'INVALID_INPUT', details: validationResult.errors };
    }
    
    // 2. Rate limiting check
    const rateLimitOk = await checkRateLimit(data.user_token, 'schelling.register', connection);
    if (!rateLimitOk) {
      await transaction.rollback();
      return { success: false, error: 'RATE_LIMITED' };
    }
    
    // 3. ACTIVE_COMMITMENT check (if re-registering)
    if (data.intent_embedding) {
      const hasActiveCommitment = await checkActiveCommitments(data.user_token, data.intent_embedding, connection);
      if (hasActiveCommitment) {
        await transaction.rollback();
        return { success: false, error: 'ACTIVE_COMMITMENT' };
      }
    }
    
    // 4. Core registration logic (within transaction)
    const userRecord = await createUserRecord(data, connection);
    await updateRateLimit(data.user_token, 'schelling.register', connection);
    
    // 5. Background job scheduling (outside transaction)
    await transaction.commit();
    
    // 6. Queue async work (reputation update, collaborative filtering)
    if (userRecord.re_registration) {
      await scheduleBackgroundJob('score_recompute', { user_token: data.user_token });
    }
    
    return { success: true, user_token: userRecord.user_token };
    
  } catch (error) {
    await transaction.rollback();
    logger.error('Registration failed', { 
      user_token: data.user_token, 
      error: error.message,
      operation: 'schelling.register',
      phase: 'transaction' 
    });
    return { success: false, error: 'INTERNAL_ERROR' };
  } finally {
    await pool.release(connection);
  }
}

// Input validation with detailed error reporting
function validateIntentEmbedding(embedding: number[]): ValidationResult {
  const errors: string[] = [];
  
  // Dimension check
  if (!Array.isArray(embedding) || embedding.length !== 16) {
    errors.push(`Intent embedding must have exactly 16 dimensions, got ${embedding?.length || 'null'}`);
    return { valid: false, errors };
  }
  
  // Range and finite check
  for (let i = 0; i < 16; i++) {
    const value = embedding[i];
    if (!Number.isFinite(value)) {
      errors.push(`Dimension ${i} is not finite: ${value}`);
    } else if (value < -1 || value > 1) {
      errors.push(`Dimension ${i} out of range [-1,1]: ${value}`);
    }
  }
  
  if (errors.length > 0) return { valid: false, errors };
  
  // L2 norm check
  const l2Norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  if (l2Norm < 0.5) {
    errors.push(`Intent embedding L2 norm too low: ${l2Norm.toFixed(3)} (minimum 0.5)`);
  }
  
  // Significant dimensions check
  const significantDims = embedding.filter(x => Math.abs(x) > 0.1).length;
  if (significantDims < 3) {
    errors.push(`Intent embedding needs ≥3 significant dimensions (|value| > 0.1), found ${significantDims}`);
  }
  
  return { valid: errors.length === 0, errors };
}

// Idempotency guarantees using request fingerprinting
async function ensureIdempotency(operation: string, requestData: any): Promise<string> {
  const fingerprint = crypto.createHash('sha256')
    .update(JSON.stringify({ operation, ...requestData }))
    .digest('hex');
  
  // Check for duplicate request within 24h window
  const existing = await db.query(
    'SELECT response FROM idempotency_cache WHERE fingerprint = ? AND created_at > datetime("now", "-24 hours")',
    [fingerprint]
  );
  
  if (existing.length > 0) {
    return existing[0].response;
  }
  
  return fingerprint; // Store response with this fingerprint after successful operation
}
```

### Testing Strategy Per Phase

**Unit Tests (Jest + Vitest):**
```typescript
// Intent embedding validation edge cases
describe('validateIntentEmbedding', () => {
  test('rejects wrong length', () => {
    const result = validateIntentEmbedding([1, 2, 3]); // Only 3 dims
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/exactly 16 dimensions/);
  });
  
  test('rejects low L2 norm', () => {
    const weakVector = Array(16).fill(0.01); // Norm = 0.04
    const result = validateIntentEmbedding(weakVector);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/L2 norm too low/);
  });
  
  test('rejects insufficient significant dimensions', () => {
    const vector = Array(16).fill(0.05); // All values < 0.1
    vector[0] = 0.9; vector[1] = 0.2; // Only 2 significant
    const result = validateIntentEmbedding(vector);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/≥3 significant dimensions/);
  });
});

// Cluster affinity computation
describe('computeClusterAffinities', () => {
  test('exact centroid match returns 1.0', () => {
    const matchmakingCentroid = [+0.85, +0.60, -0.80, /* ... */];
    const affinities = computeClusterAffinities(matchmakingCentroid);
    expect(affinities.matchmaking).toBeCloseTo(1.0, 3);
  });
  
  test('midpoint vector returns partial affinities', () => {
    const midpoint = Array(16).fill(0); // Equidistant from all
    const affinities = computeClusterAffinities(midpoint);
    expect(Object.values(affinities)).toSatisfy(vals => 
      vals.every(v => v > 0.3 && v < 0.8));
  });
});
```

**Integration Tests (Supertest + Test DB):**
```typescript
describe('Registration Integration', () => {
  let testDb: Database;
  
  beforeEach(async () => {
    testDb = await createTestDatabase();
    await runMigrations(testDb);
  });
  
  test('complete registration flow', async () => {
    const registrationData = {
      role: 'participant',
      agent_model: 'claude-3.5-sonnet',
      embedding: generateTestEmbedding50(),
      intent_embedding: generateTestIntentEmbedding(),
      intents: ['find a romantic partner'],
      description: 'Test user',
      seeking: 'Test seeking'
    };
    
    const response = await request(app)
      .post('/schelling/register')
      .send(registrationData)
      .expect(200);
    
    expect(response.body.user_token).toBeDefined();
    expect(response.body.primary_cluster).toBe('matchmaking');
    
    // Verify database state
    const user = await testDb.query('SELECT * FROM users WHERE user_token = ?', [response.body.user_token]);
    expect(user[0].intent_embedding).toBeDefined();
    expect(user[0].cluster_affinities).toBeDefined();
  });
  
  test('backward compatibility with single intent string', async () => {
    const response = await request(app)
      .post('/schelling/register')
      .send({ ...baseRegistrationData, intents: ['matchmaking'] }) // No intent_embedding
      .expect(200);
    
    const user = await testDb.query('SELECT * FROM users WHERE user_token = ?', [response.body.user_token]);
    expect(JSON.parse(user[0].intent_embedding)).toEqual(MATCHMAKING_CENTROID);
  });
  
  test('ACTIVE_COMMITMENT prevents re-registration', async () => {
    // Setup: Create user with active exclusive commitment
    const userToken = await createTestUserWithCommitment();
    
    const response = await request(app)
      .post('/schelling/register')
      .send({ ...baseRegistrationData, user_token: userToken })
      .expect(400);
    
    expect(response.body.error).toBe('ACTIVE_COMMITMENT');
  });
});
```

**Load Tests (Artillery.io):**
```yaml
# load-test-registration.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Registration load test"
  payload:
    path: "test-embeddings.csv"
    fields:
      - embedding
      - intent_embedding

scenarios:
  - name: "Register user"
    weight: 100
    flow:
      - post:
          url: "/schelling/register" 
          json:
            role: "participant"
            agent_model: "test-agent"
            embedding: "{{ embedding }}"
            intent_embedding: "{{ intent_embedding }}"
            description: "Load test user"
            seeking: "Load test seeking"
        expect:
          - statusCode: 200
          - hasProperty: "user_token"
```

**Performance Targets:**
- Registration: p50 < 200ms, p99 < 500ms (cold start with full validation)  
- Search: p50 < 100ms, p99 < 300ms (up to 1K users brute force)
- Database: <10ms per individual query with proper indexing
- Memory: <100MB sustained per 1K users (embedding storage optimization)
- Rate limiting: <5ms overhead per request with Redis backend

### Zero-Downtime Migration Procedure

```bash
#!/bin/bash
# Migration 001 deployment script

set -e

# 1. Verify current state
echo "Verifying database schema version..."
CURRENT_VERSION=$(sqlite3 schelling.db "SELECT value FROM metadata WHERE key='schema_version'" 2>/dev/null || echo "0")
if [ "$CURRENT_VERSION" != "0" ]; then
  echo "Migration 001 already applied (version: $CURRENT_VERSION)"
  exit 0
fi

# 2. Backup before migration
echo "Creating backup..."
cp schelling.db "schelling.db.backup.$(date +%s)"

# 3. Apply migration with rollback capability  
echo "Applying migration 001..."
sqlite3 schelling.db < migrations/001-intent-space.sql

# 4. Verify migration success
echo "Verifying new schema..."
sqlite3 schelling.db "SELECT COUNT(*) FROM users WHERE intent_embedding IS NOT NULL" > /dev/null

# 5. Data migration (backfill existing users)
echo "Backfilling existing user data..."  
node scripts/backfill-intent-embeddings.js

# 6. Update schema version
sqlite3 schelling.db "INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', '1')"

echo "Migration 001 complete"

# Rollback procedure (if needed):
# 1. Stop application
# 2. Restore backup: cp schelling.db.backup.{timestamp} schelling.db  
# 3. Restart application with old code
```

### Test Plan

- **Unit:** All algorithm functions with edge cases and mathematical properties
- **Unit:** Validation functions with comprehensive invalid input coverage
- **Unit:** Rate limiting edge cases (boundary conditions, concurrent requests)
- **Unit:** Connection pooling under high load
- **Integration:** Full registration → cluster assignment → backward compatibility
- **Integration:** Migration → backfill → verification on test dataset
- **Integration:** Rate limiting enforcement across multiple endpoints
- **Integration:** Transaction rollback scenarios (network failures, validation errors)
- **Load:** 100 concurrent registrations, measure p50/p99 latency and error rate
- **Load:** Database connection pool exhaustion recovery
- **Migration:** Zero-downtime migration on copy of production data

### Definition of Done

- All existing tests pass with the new schema
- New users can register with `intent_embedding` and get `primary_cluster` + `cluster_affinities` in response
- Backward-compatible registration (omitting `intent_embedding`, providing single intent string) works
- Migration script backfills existing data correctly
- `vertical_id` lookups still work (via shim) but new code uses cluster_id
- Rate limiting works across all endpoints with proper Redis persistence
- Connection pooling handles 10x normal load without failures
- Zero-downtime migration tested on staging environment
- All validation functions reject invalid inputs with clear error messages
- Structured logging captures all critical events with searchable context
- Background job queue processes score recomputation within 5 minutes
- Performance targets met under load test scenarios

### Rollback Strategy

Keep `vertical_id` column intact. The migration only ADDs columns, never drops. If rollback needed:
1. Revert code to use `vertical_id` (all old code still references it)
2. New columns are ignored by old code (SQLite ignores unknown columns in SELECT *)
3. No data loss — `vertical_id` is still the source of truth during transition
4. Background jobs continue processing but only affect new columns
5. Rate limiting persists in Redis — no impact on rollback
6. Database backup automatically taken before migration for immediate restore capability

---

## Phase 2: Bidirectional Scoring

**Complexity:** L
**Estimated time:** 2–3 days  
**Dependencies:** Phase 1

### What's Being Built

Replace unidirectional `compatibility_score` with `your_fit` / `their_fit` / `combined_score` throughout. Implement the scoring formula from spec §17.2.

### Concurrency Handling & Race Conditions

**Problem:** Two agents search simultaneously and both get the same high-scoring candidate. Both try to create candidate records at the same time.

**Solution:** Unique constraint on (user_token_a, user_token_b) with deterministic ordering (lexicographic) and UPSERT semantics:

```sql  
-- Candidate table constraint prevents duplicates
-- NOTE: SQLite does not support partial unique indexes (WHERE clause on UNIQUE).
-- Use a CHECK constraint + standard unique index instead:
CHECK (user_token_a < user_token_b),  -- Enforce canonical ordering at table level
UNIQUE (user_token_a, user_token_b)   -- Standard unique index (no WHERE needed)
```

**Exclusive commitment serialization:** All `schelling.commit` operations in exclusive-commitment clusters MUST use `BEGIN IMMEDIATE` (SQLite write lock) and re-verify no active commitments exist within the transaction:
```sql
BEGIN IMMEDIATE;
-- Re-check: does this user already have an active commitment in this cluster?
SELECT COUNT(*) FROM candidates 
  WHERE (user_token_a = ?user OR user_token_b = ?user) 
  AND stage_a >= 4 OR stage_b >= 4;
-- If count > 0, ROLLBACK and return ACTIVE_COMMITMENT
-- Otherwise, proceed with commit
COMMIT;
```

```typescript
// Atomic candidate creation with race condition handling
async function createCandidateRecord(tokenA: string, tokenB: string, scores: BidirectionalScore): Promise<string> {
  // Ensure consistent ordering to prevent A→B vs B→A duplicates
  const [primaryToken, secondaryToken] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA];
  
  // UPSERT with ON CONFLICT handling  
  const result = await db.query(`
    INSERT INTO candidates (id, user_token_a, user_token_b, score_your_fit, score_their_fit, combined_score, stage, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, 'DISCOVERED', datetime('now'))
    ON CONFLICT (user_token_a, user_token_b) DO UPDATE SET
      score_your_fit = excluded.score_your_fit,
      score_their_fit = excluded.score_their_fit, 
      combined_score = excluded.combined_score,
      computed_at = excluded.computed_at
    RETURNING id
  `, [generateId(), primaryToken, secondaryToken, scores.yourFit, scores.theirFit, scores.combinedScore]);
  
  return result[0].id;
}
```

**Concurrent feedback submissions:** Use optimistic locking with version numbers on candidate records to prevent lost updates when multiple agents submit feedback simultaneously.

### Performance Optimization & Caching Strategy

**Database Query Optimization:**
```sql
-- Composite index for search performance (covers 90% of search queries)
CREATE INDEX idx_search_performance ON users(status, primary_cluster, last_registered_at, reputation_score DESC);

-- Covering index for score calculations (avoids extra lookups)  
CREATE INDEX idx_candidate_scoring ON candidates(user_token_a, user_token_b, combined_score DESC, computed_at) 
INCLUDE (score_your_fit, score_their_fit, intent_similarity);
```

**Caching Strategy (Redis):**
- **Search result caching:** Cache search results for 5 minutes with key pattern `search:{user_token}:{cluster}:{hash(filters)}`
- **Score computation caching:** Cache bidirectional scores for user pairs for 1 hour: `scores:{tokenA}:{tokenB}`
- **Embedding similarity caching:** Cache cosine similarities for frequently accessed pairs for 30 minutes
- **Cluster affinity caching:** Cache cluster affinity computations for 6 hours per user

```typescript
// Search result caching with intelligent invalidation
async function searchWithCache(userToken: string, filters: SearchFilters): Promise<SearchResults> {
  const cacheKey = `search:${userToken}:${filters.cluster}:${hashFilters(filters)}`;
  
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Perform search
  const results = await performSearch(userToken, filters);
  
  // Cache with intelligent TTL based on cluster size
  const clusterSize = await getClusterSize(filters.cluster);
  const ttl = clusterSize < 100 ? 300 : 60; // 5min for small clusters, 1min for large
  
  await redis.setex(cacheKey, ttl, JSON.stringify(results));
  return results;
}

// Cache invalidation on user updates
async function invalidateUserCache(userToken: string, oldCluster?: string, newCluster?: string) {
  const patterns = [
    `search:${userToken}:*`,  // User's own searches
    `scores:${userToken}:*`,  // User's scores with others
    `scores:*:${userToken}`,  // Others' scores with user
  ];
  
  if (oldCluster) patterns.push(`search:*:${oldCluster}:*`);
  if (newCluster) patterns.push(`search:*:${newCluster}:*`);
  
  await Promise.all(patterns.map(pattern => redis.del(pattern)));
}
```

**Performance Targets:**
- Search (cold): p50 < 150ms, p99 < 400ms (up to 1K users)
- Search (cached): p50 < 30ms, p99 < 100ms  
- Score computation: p50 < 5ms per pair, p99 < 20ms
- Database queries: <15ms with proper indexing
- Cache hit rate: >80% for search, >60% for scores

### Data Integrity & Consistency Checks

```typescript
// Bidirectional score invariant validation
function validateBidirectionalScore(score: BidirectionalScore): ValidationResult {
  const { yourFit, theirFit, combinedScore } = score;
  
  // Range checks
  if (yourFit < 0 || yourFit > 1 || theirFit < 0 || theirFit > 1) {
    return { valid: false, error: 'Directional scores must be in [0,1]' };
  }
  
  // Geometric mean invariant (within floating point tolerance)
  const expectedCombined = Math.sqrt(yourFit * theirFit);
  if (Math.abs(combinedScore - expectedCombined) > 1e-6) {
    return { valid: false, error: `Combined score violation: expected ${expectedCombined}, got ${combinedScore}` };
  }
  
  // Consistency check: if either directional score is 0, combined must be 0
  if ((yourFit === 0 || theirFit === 0) && combinedScore !== 0) {
    return { valid: false, error: 'Combined score must be 0 when either directional score is 0' };
  }
  
  return { valid: true };
}

// Database consistency checks (run periodically)
async function auditScoreConsistency(): Promise<ConsistencyReport> {
  const inconsistencies: Array<{candidateId: string, issue: string}> = [];
  
  const candidates = await db.query(`
    SELECT id, score_your_fit, score_their_fit, combined_score 
    FROM candidates 
    WHERE combined_score IS NOT NULL
  `);
  
  for (const candidate of candidates) {
    const expected = Math.sqrt(candidate.score_your_fit * candidate.score_their_fit);
    if (Math.abs(candidate.combined_score - expected) > 1e-5) {
      inconsistencies.push({
        candidateId: candidate.id,
        issue: `Score mismatch: ${candidate.combined_score} ≠ √(${candidate.score_your_fit} × ${candidate.score_their_fit})`
      });
    }
  }
  
  return { inconsistencies, checked: candidates.length };
}
```

### Files Modified

| File | Change |
|---|---|
| `src/matching/compatibility.ts` | **Complete rewrite** with exact algorithm implementation. Thread-safe score computation. Caching layer integration. Mathematical invariant validation. Error handling for edge cases (NaN, division by zero, out-of-range embeddings). |
| `src/matching/scoring.ts` | Central orchestrator with component isolation. Pluggable scoring modules. A/B testing variant support. Performance monitoring hooks. Score explanation generation. |
| `src/handlers/search.ts` | **Major enhancement:** Rate limiting (30 req/hour/user). Connection pooling. Pagination with cursor encoding. Score quantization (2dp at DISCOVERED, full precision after). Staleness penalty application. Cache integration. Concurrent request handling. USER_PAUSED checks. Structured logging. |
| `src/handlers/compare.ts` | Transaction isolation for consistency. Input validation. Score breakdown with detailed explanations. Error handling patterns. Cache-aware operations. |
| `src/handlers/request-profile.ts` | Mutual gate timeout handling with background job scheduling. Profile privacy controls. Transaction boundaries. Concurrent access protection. Status transition validation. |
| `src/handlers/propose.ts` | Exclusive commitment race condition handling. SERIALIZABLE transaction isolation. Identity validation. Auto-decline batch operations. Deadlock prevention. Event logging for audit trails. |
| `src/handlers/get-introductions.ts` | Optimized queries with JOINs. Paginated results. Real-time status updates. Performance metrics collection. |
| `src/transports/mcp.ts` | Updated schemas with complete validation. Rate limiting integration. Error response standardization. |
| `src/transports/rest.ts` | CORS handling. Request/response compression. Authentication middleware. API versioning support. |

### New Files

| File | Purpose |
|---|---|
| `src/matching/scoring.ts` | Exact algorithm implementations with all formulas from the specification. Component-based architecture. |
| `src/matching/cache.ts` | Redis-based caching for search results, scores, embeddings. Intelligent invalidation logic. |
| `src/matching/performance.ts` | Query optimization utilities. Database connection monitoring. Performance metrics collection. |
| `src/core/concurrency.ts` | Race condition handling utilities. Optimistic locking. Deadlock detection and recovery. |
| `src/core/validation.ts` | Mathematical invariant validation. Data consistency checks. Audit trail utilities. |

### Exact Algorithm Implementation 

```typescript
// Complete bidirectional scoring algorithm with all mathematical details
class BidirectionalScoringEngine {
  
  // Main scoring function with full validation and error handling
  static computeBidirectionalScore(
    embeddingA: Float64Array, embeddingB: Float64Array,
    intentA: Float64Array, intentB: Float64Array,
    learnedPrefsA?: LearnedPreferences,
    learnedPrefsB?: LearnedPreferences,
    dealBreakersA?: DealBreakers,
    dealBreakersB?: DealBreakers,
    collaborativeData?: CollaborativeData
  ): BidirectionalScore {
    
    // Input validation
    this.validateInputs(embeddingA, embeddingB, intentA, intentB);
    
    // Compute A→B directional fit
    const yourFit = this.computeDirectionalFit({
      scorerEmbedding: embeddingA,
      candidateEmbedding: embeddingB, 
      scorerIntent: intentA,
      candidateIntent: intentB,
      learnedPrefs: learnedPrefsA,
      dealBreakers: dealBreakersA,
      collaborativeData
    });
    
    // Compute B→A directional fit
    const theirFit = this.computeDirectionalFit({
      scorerEmbedding: embeddingB,
      candidateEmbedding: embeddingA,
      scorerIntent: intentB, 
      candidateIntent: intentA,
      learnedPrefs: learnedPrefsB,
      dealBreakers: dealBreakersB,
      collaborativeData
    });
    
    // Combined score = geometric mean (ensures both parties must be satisfied)
    const combinedScore = Math.sqrt(yourFit * theirFit);
    
    // Generate detailed breakdown for explainability
    const breakdown = this.generateBreakdown(embeddingA, embeddingB, intentA, intentB);
    
    // Validate mathematical invariants before returning
    const score = { yourFit, theirFit, combinedScore, breakdown };
    this.validateScore(score);
    
    return score;
  }
  
  // Directional fit computation (exact spec §17.2 implementation)
  private static computeDirectionalFit(params: DirectionalFitParams): number {
    const { scorerEmbedding, candidateEmbedding, scorerIntent, candidateIntent, learnedPrefs, dealBreakers, collaborativeData } = params;
    
    // Component 1: Trait similarity (40% weight)
    const traitCosine = this.cosineSimilarity50(scorerEmbedding, candidateEmbedding);
    const traitSimilarity = (traitCosine + 1) / 2; // Map [-1,1] → [0,1]
    const traitComponent = 0.40 * traitSimilarity;
    
    // Component 2: Intent similarity (20% weight)  
    const intentCosine = this.cosineSimilarity16(scorerIntent, candidateIntent);
    const intentSimilarity = (intentCosine + 1) / 2; // Map [-1,1] → [0,1] 
    const intentComponent = 0.20 * intentSimilarity;
    
    // Component 3: Preference alignment (20% weight)
    const preferenceAlignment = learnedPrefs ? 
      this.computePreferenceAlignment(candidateEmbedding, learnedPrefs) :
      traitSimilarity; // Default to trait similarity when no learned preferences
    const prefComponent = 0.20 * preferenceAlignment;
    
    // Component 4: Deal-breaker pass (10% weight)
    const dealBreakerPass = dealBreakers ?
      this.evaluateDealBreakers(candidateEmbedding, dealBreakers) : 1.0;
    const dealBreakerComponent = 0.10 * dealBreakerPass;
    
    // Component 5: Collaborative filtering signal (10% weight)
    const collaborativeSignal = collaborativeData ?
      this.computeCollaborativeSignal(scorerEmbedding, candidateEmbedding, collaborativeData) : 0.5;
    const collabComponent = 0.10 * collaborativeSignal;
    
    const totalScore = traitComponent + intentComponent + prefComponent + 
                      dealBreakerComponent + collabComponent;
    
    // Ensure score is in valid range [0,1]
    return Math.max(0, Math.min(1, totalScore));
  }
  
  // High-performance cosine similarity for 50-dim embeddings (SIMD-optimized when available)
  private static cosineSimilarity50(a: Float64Array, b: Float64Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    // Unroll loop for better performance with 50 dimensions
    for (let i = 0; i < 50; i += 5) {
      dotProduct += a[i] * b[i] + a[i+1] * b[i+1] + a[i+2] * b[i+2] + a[i+3] * b[i+3] + a[i+4] * b[i+4];
      normA += a[i]**2 + a[i+1]**2 + a[i+2]**2 + a[i+3]**2 + a[i+4]**2;
      normB += b[i]**2 + b[i+1]**2 + b[i+2]**2 + b[i+3]**2 + b[i+4]**2;
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
  
  // 16-dimensional intent cosine similarity
  private static cosineSimilarity16(a: Float64Array, b: Float64Array): number {
    let dotProduct = 0;
    let normA = 0; 
    let normB = 0;
    
    for (let i = 0; i < 16; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
  
  // Learned preference alignment computation
  private static computePreferenceAlignment(candidateEmbedding: Float64Array, learnedPrefs: LearnedPreferences): number {
    let alignmentScore = 0;
    let totalWeight = 0;
    
    // Weight dimensions by learned importance
    for (const [dimension, importance] of Object.entries(learnedPrefs.dimension_importance)) {
      const dimIndex = parseInt(dimension);
      const candidateValue = candidateEmbedding[dimIndex];
      const idealRange = learnedPrefs.ideal_ranges[dimension];
      
      if (idealRange) {
        // Score based on how well candidate falls within learned ideal range
        let dimensionScore = 0;
        if (candidateValue >= idealRange.min && candidateValue <= idealRange.max) {
          // Within acceptable range, score based on distance from ideal
          const distFromIdeal = Math.abs(candidateValue - idealRange.ideal);
          const rangeSize = idealRange.max - idealRange.min;
          dimensionScore = 1 - (distFromIdeal / (rangeSize / 2));
        } else {
          // Outside range, penalty based on distance
          const penalty = Math.min(Math.abs(candidateValue - idealRange.min), Math.abs(candidateValue - idealRange.max));
          dimensionScore = Math.max(0, 1 - penalty);
        }
        
        alignmentScore += dimensionScore * importance;
        totalWeight += importance;
      }
    }
    
    return totalWeight > 0 ? alignmentScore / totalWeight : 0.5;
  }
  
  // Deal-breaker evaluation (binary pass/fail)
  private static evaluateDealBreakers(candidateEmbedding: Float64Array, dealBreakers: DealBreakers): number {
    // Check all deal-breakers - if any fail, return 0 (hard constraint)
    for (const [rule, threshold] of Object.entries(dealBreakers)) {
      if (!this.checkDealBreakerRule(candidateEmbedding, rule, threshold)) {
        return 0; // Failed deal-breaker = immediate rejection
      }
    }
    return 1; // All deal-breakers passed
  }
  
  // Collaborative filtering signal computation
  // CRITICAL: Uses pre-computed similar_users table (refreshed daily by background job)
  // to avoid O(N) full-table scan per score computation. See migration 001 for table definition.
  private static async computeCollaborativeSignal(
    scorerToken: string, 
    candidateEmbedding: Float64Array,
    db: Database
  ): Promise<number> {
    // Query pre-computed similar users (top 50, refreshed daily)
    const similarUsers = await db.query(
      `SELECT su.similar_token, u.embedding FROM similar_users su
       JOIN users u ON u.user_token = su.similar_token
       WHERE su.user_token = ? AND su.similarity > 0.8
       ORDER BY su.similarity DESC LIMIT 50`,
      [scorerToken]
    );
    
    if (similarUsers.length < 3) {
      return 0.5; // Insufficient data for collaborative filtering
    }
    
    // Aggregate their feedback on similar candidates
    let totalSignal = 0;
    let signalCount = 0;
    
    for (const user of similarUsers) {
      const feedbacks = await db.query(
        `SELECT f.satisfaction, c.embedding_b FROM feedback f
         JOIN candidates c ON c.id = f.candidate_id
         WHERE f.user_token = ?
         LIMIT 50`,
        [user.similar_token]
      );
      for (const fb of feedbacks) {
        // Check if candidate is similar to target candidate
        const candidateEmb = new Float64Array(JSON.parse(fb.embedding_b));
        if (this.cosineSimilarity50(candidateEmbedding, candidateEmb) > 0.7) {
          const outcomeValue = fb.satisfaction === 'very_satisfied' || fb.satisfaction === 'satisfied' ? 1.0 :
                              fb.satisfaction === 'neutral' ? 0.5 : 0.0;
          totalSignal += outcomeValue;
          signalCount++;
        }
      }
    }
    
    return signalCount > 0 ? totalSignal / signalCount : 0.5;
  }
  
  // Background job: refresh similar_users table (run daily)
  // This pre-computes the O(N²) all-pairs similarity and stores top-50 per user
  static async refreshSimilarUsersIndex(db: Database): Promise<void> {
    const users = await db.query('SELECT user_token, embedding FROM users WHERE status = "active"');
    for (const user of users) {
      const userEmb = new Float64Array(JSON.parse(user.embedding));
      const similarities: Array<{token: string, sim: number}> = [];
      for (const other of users) {
        if (other.user_token === user.user_token) continue;
        const otherEmb = new Float64Array(JSON.parse(other.embedding));
        const sim = this.cosineSimilarity50(userEmb, otherEmb);
        if (sim > 0.8) similarities.push({token: other.user_token, sim});
      }
      similarities.sort((a, b) => b.sim - a.sim);
      const top50 = similarities.slice(0, 50);
      
      await db.query('DELETE FROM similar_users WHERE user_token = ?', [user.user_token]);
      for (const s of top50) {
        await db.query(
          'INSERT INTO similar_users (user_token, similar_token, similarity) VALUES (?, ?, ?)',
          [user.user_token, s.token, s.sim]
        );
      }
    }
  }
}
```

### Graceful Degradation Strategies

```typescript
// Handle edge cases where normal scoring fails
class ScoringFallbackHandler {
  
  static handleScoringFailure(error: Error, embeddingA: Float64Array, embeddingB: Float64Array): BidirectionalScore {
    console.error('Scoring computation failed, using fallback', { error: error.message });
    
    try {
      // Minimal viable scoring using just trait cosine similarity
      const traitSim = BidirectionalScoringEngine.cosineSimilarity50(embeddingA, embeddingB);
      const fallbackScore = (traitSim + 1) / 2; // Map to [0,1]
      
      return {
        yourFit: fallbackScore,
        theirFit: fallbackScore,
        combinedScore: fallbackScore,
        breakdown: {
          trait_similarity: traitSim,
          intent_similarity: 0.5, // Unknown
          preference_alignment: 0.5, // Unknown
          deal_breaker_pass: 1.0, // Assume pass
          collaborative_signal: 0.5, // Unknown
          shared_categories: [],
          complementary_traits: [],
          strongest_alignments: []
        },
        fallback_used: true
      };
    } catch (fallbackError) {
      // Even fallback failed, return neutral score
      return this.getNeutralScore();
    }
  }
  
  static getNeutralScore(): BidirectionalScore {
    return {
      yourFit: 0.5,
      theirFit: 0.5, 
      combinedScore: 0.5,
      breakdown: this.getNeutralBreakdown(),
      emergency_fallback: true
    };
  }
}
```

### Test Plan

**Unit Tests (Mathematical Properties):**
```typescript
describe('Bidirectional Scoring Engine', () => {
  test('geometric mean invariant holds for all inputs', () => {
    const testCases = [
      { yourFit: 0.8, theirFit: 0.6 }, // Expected: 0.693
      { yourFit: 1.0, theirFit: 0.0 }, // Expected: 0.0
      { yourFit: 0.5, theirFit: 0.5 }, // Expected: 0.5
    ];
    
    for (const test of testCases) {
      const expected = Math.sqrt(test.yourFit * test.theirFit);
      const result = BidirectionalScoringEngine.computeBidirectionalScore(/* ... */);
      expect(result.combinedScore).toBeCloseTo(expected, 6);
    }
  });
  
  test('asymmetric deal-breakers create asymmetric scores', () => {
    const dealBreakersA = { no_smoking: true };
    const dealBreakersB = {}; // No deal-breakers
    const smokingEmbedding = createEmbeddingWithSmoking(true);
    const nonSmokingEmbedding = createEmbeddingWithSmoking(false);
    
    const result = BidirectionalScoringEngine.computeBidirectionalScore(
      nonSmokingEmbedding, smokingEmbedding, /* intents */, dealBreakersA, dealBreakersB
    );
    
    expect(result.yourFit).toBeLessThan(0.1); // A rejects B (smoker)
    expect(result.theirFit).toBeGreaterThan(0.5); // B doesn't reject A
    expect(result.combinedScore).toBeLessThan(0.3); // Geometric mean pulls down
  });
  
  test('performance target: 1000 score computations under 100ms', async () => {
    const embeddings = generateRandomEmbeddings(1000);
    const start = performance.now();
    
    for (let i = 0; i < 500; i++) {
      BidirectionalScoringEngine.computeBidirectionalScore(
        embeddings[i*2], embeddings[i*2+1], /* ... */
      );
    }
    
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100); // Should be much faster with optimizations
  });
});
```

**Integration Tests (End-to-End Workflows):**
```typescript
describe('Search Integration with Bidirectional Scoring', () => {
  test('search returns properly quantized scores at DISCOVERED stage', async () => {
    const user = await registerTestUser({ stage: 'DISCOVERED' });
    const response = await request(app).post('/schelling/search').send({ user_token: user.token });
    
    expect(response.body.candidates).toBeDefined();
    for (const candidate of response.body.candidates) {
      // Scores should be quantized to 2 decimal places at DISCOVERED
      expect(candidate.your_fit.toString().split('.')[1]?.length).toBeLessThanOrEqual(2);
      expect(candidate.their_fit.toString().split('.')[1]?.length).toBeLessThanOrEqual(2);
      expect(candidate.combined_score.toString().split('.')[1]?.length).toBeLessThanOrEqual(2);
    }
  });
  
  test('concurrent searches handle race conditions gracefully', async () => {
    const users = await Promise.all(Array(10).fill(0).map(() => registerTestUser()));
    
    // All users search simultaneously
    const searches = users.map(user => 
      request(app).post('/schelling/search').send({ user_token: user.token })
    );
    
    const responses = await Promise.all(searches);
    
    // All should succeed without deadlocks or duplicate candidates
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.candidates).toBeDefined();
    });
    
    // Verify no duplicate candidate records in database
    const allCandidates = await db.query('SELECT user_token_a, user_token_b FROM candidates');
    const pairs = new Set(allCandidates.map(c => `${c.user_token_a}:${c.user_token_b}`));
    expect(pairs.size).toBe(allCandidates.length); // No duplicates
  });
});
```

**Load Tests (Performance Validation):**
```bash
# Artillery.io configuration for bidirectional scoring load test
artillery run --target http://localhost:3000 scoring-load-test.yml

# Expected results:
# - p50 response time: <150ms for search with 20 candidates
# - p99 response time: <400ms
# - Error rate: <0.1%
# - Cache hit rate: >80% after warmup
```

### Definition of Done

- All handlers return `your_fit`, `their_fit`, `combined_score` with correct mathematical relationships
- Geometric mean invariant holds: `combined = sqrt(your * their)` within floating point precision
- Search results properly quantized at DISCOVERED stage (2 decimal places)
- Concurrent requests handled without race conditions or deadlocks
- Performance targets met under load: p50 <150ms, p99 <400ms
- Cache hit rates >80% for search, >60% for score computations
- All mathematical edge cases handled gracefully (division by zero, NaN, etc.)
- Fallback scoring works when primary algorithm fails
- Score consistency validation passes on all test data
- Database indexes optimized for search query patterns

### Rollback Strategy

**Immediate Rollback (< 5 minutes):**
1. Feature flag `bidirectional_scoring_enabled = false` 
2. Handlers fall back to legacy `compatibility_score` computation
3. New columns ignored, old `score` column still populated and used

**Full Rollback (if needed):**
1. Database migration to drop new scoring columns
2. Revert all handlers to v1 unidirectional scoring
3. Clear Redis cache to remove bidirectional score data
4. No data loss - all relationships preserved, just scoring method changed

---

## Phase 3: Intent Clustering & Module Activation + User Journey Findings

**Complexity:** M
**Estimated time:** 2 days
**Dependencies:** Phase 1

### What's Being Built

Replace vertical registry with cluster registry. Implement module activation based on intent embedding proximity to cluster centroids. Replace `schelling.verticals` with `schelling.intents`. **CRITICAL:** Fix the 3 key findings from user journey analysis.

### User Journey Critical Findings Integration

**Finding 1: Talent Cluster Symmetric Roles Problem**
The talent cluster's forced employer/candidate asymmetry breaks co-founder and peer collaboration use cases. Two people both looking for co-founders can't find each other because they'd both register as "employer."

**Fix:** Add cluster configuration override for symmetric professional relationships:
```typescript
// Talent cluster config modification
const talentClusterConfig: IntentClusterConfig = {
  id: 'talent',
  centroid: TALENT_CENTROID,
  default_roles: ['employer', 'candidate'], // Default asymmetric
  allow_symmetric_override: true, // NEW: Enable symmetric mode
  symmetric_threshold: 0.7, // When intent similarity > 0.7, both get 'peer' role
  // When both users have high commitment_duration + peer symmetry + exclusivity
  peer_intent_pattern: {
    commitment_duration: 0.7,  // Long-term partnership
    relationship_symmetry: -0.4, // Peer relationship
    exclusivity: 0.6,         // Seeking one person
    identity_specificity: 0.6  // Very specific needs
  }
};

// Role assignment logic
function assignTalentRole(intentEmbedding: number[]): string {
  const peerPattern = talentClusterConfig.peer_intent_pattern;
  const matchesPeerPattern = Object.entries(peerPattern).every(([dim, threshold]) => {
    const dimIndex = INTENT_DIMENSION_NAMES.indexOf(dim);
    return dimIndex !== -1 && intentEmbedding[dimIndex] >= threshold;
  });
  
  return matchesPeerPattern ? 'peer' : 'employer'; // 'candidate' assigned to non-matching users
}
```

**Finding 2: Multi-Party Coordination Limitations** 
The protocol only supports pair matching (group_id always refers to 2-person groups), but roommate search and team formation need 3+ people.

**Fix:** Document the constraint and add future extension architecture:
```typescript
// Current limitation documentation
interface GroupConstraints {
  current_max_size: 2; // v2.0 limitation
  future_extension_ready: true; // Architecture supports N-party
  blocked_use_cases: [
    'group_roommate_search', // 3-4 people sharing apartment
    'team_formation',       // Startup teams, band formation  
    'multi_couple_friendship' // Two couples looking for other couples
  ];
}

// Future extension readiness indicators
const GROUP_EXTENSION_READY = {
  database_schema: true,    // group_id already abstracts group size
  scoring_algorithm: false, // Currently only pairwise similarity
  funnel_stages: false,     // Assumes binary mutual progression
  message_relay: false,     // Only handles A↔B communication
};

// Architecture notes for v2.1+ multi-party support
interface FutureMultiPartyRequirements {
  group_compatibility_scoring: 'pairwise_aggregation | holistic_group_dynamics';
  consensus_mechanisms: 'majority_vote | unanimous_consent | coordinator_model';
  conversation_patterns: 'group_chat | hub_and_spoke | round_robin';
  commitment_semantics: 'all_or_none | partial_commitment | rolling_commitment';
}
```

**Finding 3: Categorical/Conjunctive Filtering** 
Embedding similarity fails for hard requirements like "must speak Mandarin AND practice estate law AND be Denver-based." These need exact matching, not similarity.

**Fix:** Add structured attributes to registration that are visible and filterable:
```typescript
// Enhanced registration with structured attributes
interface StructuredAttributes {
  // Language requirements
  languages_spoken?: string[]; // ['en', 'zh-CN', 'es']
  communication_language?: string; // Primary language for interaction
  
  // Professional/legal attributes  
  professional_licenses?: Array<{
    type: string; // 'bar_admission', 'medical_license', 'cpa'
    jurisdiction: string; // 'colorado', 'california', 'us_federal'
    specializations?: string[]; // ['estate_law', 'tax', 'immigration']
  }>;
  
  // Location attributes (more granular than city)
  location_constraints?: {
    must_be_local: boolean;
    acceptable_radius_km?: number;
    timezone_flexibility?: 'same_tz' | 'within_3h' | 'any';
  };
  
  // Domain-specific categorical requirements
  marketplace_categories?: string[]; // ['electronics', 'furniture', 'vehicles']
  skill_categories?: string[]; // ['machine_learning', 'frontend', 'devops'] 
  roommate_requirements?: {
    max_occupants: number;
    pet_policy: 'none' | 'cats' | 'dogs' | 'any';
    smoking_policy: 'none' | 'outside_only' | 'any';
  };
}

// Search enhancement with categorical filters
interface EnhancedSearchFilters {
  // Existing embedding-based filters
  cluster?: string;
  threshold?: number;
  
  // NEW: Categorical filters (AND logic within categories, OR across items)
  required_languages?: string[]; // Must speak at least one
  required_licenses?: Array<{
    type: string;
    jurisdiction: string;  
    specializations?: string[]; // Must have at least one if specified
  }>;
  location_radius_km?: number;
  
  // Hybrid mode: categorical + embedding ranking
  categorical_first: boolean; // Filter categorically first, then rank by embedding similarity
}
```

### Files Modified

| File | Change |
|---|---|
| `src/handlers/list-verticals.ts` | **RENAME** → `src/handlers/list-intents.ts`. Rewrite to return cluster centroids, module info, per-cluster stats. Accept `include_custom` param. |
| `src/handlers/server-info.ts` | Replace `supported_verticals` with `supported_clusters`. Add `active_modules`. Update capabilities list. |
| `src/handlers/onboard.ts` | Accept `intent_embedding` as alternative to `cluster_id`. Find closest cluster by centroid proximity. Return module-specific fields. Add `recommended_attributes` per cluster per spec §4.8. |
| `src/handlers/register.ts` | Validate module-specific fields only when module is active (reject with `MODULE_FIELD_NOT_ACTIVE` otherwise). |
| `src/handlers/negotiate.ts` | **MODIFY** — change `vertical_id` context to cluster context. Update negotiation round tracking to use cluster-scoped config. No spec changes needed — `schelling.negotiate` (§5.18) is unchanged, only internal references shift from vertical to cluster. |
| `src/handlers/verify.ts` | **REUSE** — minimal changes. Verify request/provide lifecycle per spec §5.19 already works. Add `VERIFICATION_EXPIRED` error for requests older than 7 days per spec. |
| `src/transports/mcp.ts` | Replace `schelling.verticals` tool with `schelling.intents`. Update register tool schema. |
| `src/transports/rest.ts` | Add `/schelling/intents` endpoint. |
| `src/index.ts` | Replace `initVerticalRegistry()` with `initClusterRegistry()`. |

### New Files

| File | Purpose |
|---|---|
| `src/modules/types.ts` | `ModuleDescriptor` interface with activation_clusters, data_schema, proposal_schema. |
| `src/modules/negotiation.ts` | Negotiation module descriptor. |
| `src/modules/structured-data.ts` | Structured data module descriptor. |
| `src/modules/skills.ts` | Skills module descriptor. |
| `src/modules/registry.ts` | `getActiveModules(intentEmbedding)` — returns module IDs where cosine similarity to any activation cluster centroid > 0.5. |

### Test Plan

**Unit Tests (Cluster Configuration & User Journey Fixes):**
```typescript
describe('Talent Cluster Symmetric Role Fix', () => {
  test('co-founder intent pattern gets peer role', () => {
    const coFounderIntent = [
      -0.85, // romantic_intent: not romantic  
      +0.20, // social_bonding: some rapport needed
      +0.70, // professional_context
      +0.30, // material_exchange: equity over salary
      +0.90, // commitment_duration: decades-long
      -0.50, // relationship_symmetry: peer equality  
      +0.80, // exclusivity: looking for THE co-founder
      +0.40, // formality: structured but not rigid
      +0.20, // emotional_depth: trust matters
      +0.70, // identity_specificity: very specific person needed
      +0.60, // vulnerability_level: high stakes
      -0.20, // shared_lifestyle: separate but intense work overlap
      +0.40, // urgency: moderate timeline
      +0.30, // locality_requirement: preferred not required
      +0.60, // interaction_frequency: daily collaboration
      -0.30  // scope_breadth: fairly well-defined need
    ];
    
    const role = assignTalentRole(coFounderIntent);
    expect(role).toBe('peer');
    
    // Two users with peer roles should match each other
    const searchResults = searchTalentCluster(coFounderIntent, 'peer');
    expect(searchResults.some(result => result.role === 'peer')).toBe(true);
  });
  
  test('traditional hiring intent gets employer/candidate roles', () => {
    const hiringIntent = [/* traditional employer pattern */];
    const role = assignTalentRole(hiringIntent);
    expect(role).toBe('employer');
  });
});

describe('Structured Attribute Filtering', () => {
  test('Mandarin + estate law + Denver filters work', () => {
    const searchFilters = {
      cluster: 'talent',
      required_languages: ['zh-CN'],
      required_licenses: [{
        type: 'bar_admission',
        jurisdiction: 'colorado', 
        specializations: ['estate_law']
      }],
      location_radius_km: 50 // Within 50km of Denver
    };
    
    const results = performStructuredSearch(searchFilters);
    
    // All results must satisfy ALL categorical requirements
    results.forEach(candidate => {
      expect(candidate.structured_attributes.languages_spoken).toContain('zh-CN');
      expect(candidate.structured_attributes.professional_licenses).toContainEqual(
        expect.objectContaining({
          type: 'bar_admission',
          jurisdiction: 'colorado',
          specializations: expect.arrayContaining(['estate_law'])
        })
      );
    });
  });
});
```

**Integration Tests (Module Activation & Registry):**
```typescript  
describe('Intent Clustering Integration', () => {
  test('schelling.intents returns enhanced cluster info', async () => {
    const response = await request(app)
      .get('/schelling/intents')
      .expect(200);
    
    expect(response.body.clusters).toHaveLength(4);
    
    const talentCluster = response.body.clusters.find(c => c.id === 'talent');
    expect(talentCluster.allow_symmetric_override).toBe(true);
    expect(talentCluster.peer_intent_pattern).toBeDefined();
    expect(talentCluster.supported_attributes).toContain('professional_licenses');
  });
  
  test('registration with structured attributes validation', async () => {
    const registrationData = {
      ...baseRegistrationData,
      cluster_affinity: { talent: 0.8 },
      structured_attributes: {
        languages_spoken: ['en', 'zh-CN'],
        professional_licenses: [{
          type: 'bar_admission',
          jurisdiction: 'colorado',
          specializations: ['estate_law', 'cross_border']
        }]
      }
    };
    
    const response = await request(app)
      .post('/schelling/register')
      .send(registrationData)
      .expect(200);
    
    // Verify structured attributes stored and indexed
    const user = await db.query('SELECT structured_attributes FROM users WHERE user_token = ?', 
      [response.body.user_token]);
    const attrs = JSON.parse(user[0].structured_attributes);
    expect(attrs.languages_spoken).toContain('zh-CN');
  });
  
  test('hybrid categorical + embedding search ranking', async () => {
    // Create test users: one perfect categorical match with low embedding similarity,
    // one poor categorical match with high embedding similarity
    await createTestUser({ 
      languages: ['zh-CN'], 
      embedding: lowSimilarityEmbedding,
      licenses: [{ type: 'bar_admission', jurisdiction: 'colorado', specializations: ['estate_law'] }]
    });
    
    await createTestUser({
      languages: ['en'], 
      embedding: highSimilarityEmbedding, 
      licenses: []
    });
    
    const searchResults = await performHybridSearch({
      required_languages: ['zh-CN'],
      required_licenses: [{ type: 'bar_admission', jurisdiction: 'colorado' }],
      categorical_first: true // Apply categorical filters first
    });
    
    // Should only return the categorical match, despite lower embedding similarity
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].structured_attributes.languages_spoken).toContain('zh-CN');
  });
});
```

**Load Tests (Multi-Party Architecture Stress):**
```typescript
// Verify current architecture can handle future multi-party extension
describe('Multi-Party Architecture Readiness', () => {
  test('group_id abstraction supports variable group sizes', () => {
    // Create mock 3-person group structure (for future extension)
    const groupId = 'group_' + generateId();
    const userTokens = ['user1', 'user2', 'user3'];
    
    // Current schema should handle this gracefully (though functionality limited)
    const mockCandidateRecords = userTokens.map((token, i) => ({
      id: generateId(),
      group_id: groupId,
      user_token_a: token,
      user_token_b: userTokens[(i + 1) % userTokens.length], // Circular pairs
      stage: 'DISCOVERED'
    }));
    
    // Database should accept these records without constraint violations
    expect(() => mockCandidateRecords.forEach(insertMockCandidate)).not.toThrow();
  });
});
```

### Definition of Done

- `schelling.intents` returns all 4 pre-defined clusters with centroids, roles, modules, stats, and structured attribute support
- Talent cluster supports both asymmetric (employer/candidate) and symmetric (peer) role assignment based on intent pattern
- Structured attribute filtering works for categorical requirements (languages, licenses, location)
- Module activation correctly based on intent embedding proximity  
- Hybrid search (categorical + embedding) produces expected ranking behavior
- Multi-party constraint documented with clear future extension roadmap
- `vertical_id` still works as backward-compat alias for cluster operations
- All 3 critical user journey findings addressed within protocol constraints

### Rollback Strategy

**Phase 3 Rollback:**
1. Revert to vertical registry calls directly
2. Disable structured attribute filtering (fall back to embedding-only search)
3. Talent cluster reverts to employer/candidate roles only
4. New cluster configuration fields ignored by old code
5. Data preserved - no migration needed for rollback

---

## Phase 4: Decline Expiry & Reconsider

**Complexity:** S
**Estimated time:** 1 day
**Dependencies:** Phase 1 (schema with expiry_at)

### What's Being Built

Add TTL-based expiry to declines. Implement `schelling.reconsider`. Update search to respect expiry.

### DB Schema Changes

Already added in Phase 1 migration: `expiry_at`, `reconsidered`, `reconsidered_at`, `feedback` on declines table.

### Files Modified

| File | Change |
|---|---|
| `src/handlers/decline.ts` | Compute `expiry_at` from cluster's `decline_ttl_days` (default 90) with escalating TTL: look up repeat-decline count for this user pair; 1st decline = base TTL, 2nd = 2× TTL, 3rd+ = permanent (null expiry). Store expiry_at and repeat_count. Accept `feedback` object. Return `expires_at` in response (null for permanent). |
| `src/handlers/search.ts` | Change decline exclusion query: exclude where (`expiry_at > datetime('now') OR expiry_at IS NULL`) AND `reconsidered = 0`. Expired or reconsidered declines don't exclude. Permanent declines (null expiry) always exclude. |
| `src/transports/mcp.ts` | Add `schelling.reconsider` tool. Update `schelling.decline` with feedback param. |
| `src/transports/rest.ts` | Add `/schelling/reconsider` endpoint. |

### New Files

| File | Purpose |
|---|---|
| `src/handlers/reconsider.ts` | `handleReconsider(input, ctx)`. Find active decline by decliner + candidate_id. If found and not expired, set `reconsidered = 1`, `reconsidered_at = now`. Return original decline info. Idempotent: reconsidering already-reconsidered returns success. Error if no active decline. |

### Test Plan

- **Unit:** Decline creates record with correct `expiry_at` (90 days for matchmaking, 30 for marketplace)
- **Unit:** 2nd decline of same person → 2× TTL
- **Unit:** 3rd decline of same person → permanent (null expiry)
- **Unit:** Permanent decline → reconsider returns PERMANENT_DECLINE
- **Integration:** Decline → search → declined user excluded
- **Integration:** Decline → wait for expiry (mock time) → search → declined user reappears
- **Integration:** Decline → reconsider → search → declined user reappears immediately
- **Integration:** Reconsider already-reconsidered → success (idempotent)
- **Integration:** Reconsider non-existent decline → NO_ACTIVE_DECLINE error
- **Integration:** 3 declines of same person → permanent exclusion across re-registrations

### Definition of Done

- Declines have configurable TTL per cluster
- Expired declines don't block search
- `schelling.reconsider` lifts search exclusion while preserving analytics record
- Decline records retained indefinitely regardless of expiry/reconsider

### Rollback Strategy

If expiry logic breaks search, revert search handler's WHERE clause to the simpler `NOT IN (SELECT declined_token FROM declines WHERE decliner_token = ?)`. Expiry data remains in table but is ignored.

---

## Phase 5: Profile Update

**Complexity:** S
**Estimated time:** 0.5–1 day
**Dependencies:** Phase 1 (text-only updates), Phase 2 (embedding updates with recompute_scores)

### What's Being Built

`schelling.update` handler that updates text fields and status without destroying candidate relationships.

### New Files

| File | Purpose |
|---|---|
| `src/handlers/update.ts` | `handleUpdate(input, ctx)`. Accept `user_token` + updatable fields (description, seeking, interests, values_text, status, deal_breakers, media_refs, identity, embedding, intent_embedding, intents, intent_tags, agent_model, recompute_scores, marketplace fields). Reject immutable fields (role, protocol_version, verification_level) with `IMMUTABLE_FIELD` error. When `embedding` or `intent_embedding` provided, require `recompute_scores: true` — validate new embeddings, replace stored values, trigger async score recomputation for all active candidates, update `last_registered_at`. Check for `ACTIVE_COMMITMENT` when intent_embedding changes primary cluster in exclusive-commitment clusters. Return `{updated: true, updated_fields: [...], updated_at: ..., scores_recomputing: bool}`. |
| `src/handlers/refresh.ts` | `handleRefresh(input, ctx)`. Validate user exists. Update `last_registered_at` to now. Rate limit: max once per 30 days. Return `{refreshed: true, last_registered_at, previous_registered_at}`. |
### Files Modified

| File | Change |
|---|---|
| `src/transports/mcp.ts` | Add `schelling.update`, `schelling.refresh` tools. |
| `src/transports/rest.ts` | Add `/schelling/update`, `/schelling/refresh` endpoints. |

### Test Plan

- **Unit:** Update description → description changes, candidates unaffected
- **Unit:** Update status to "paused" → user excluded from search
- **Unit:** Update embedding with recompute_scores:true → scores recomputed, last_registered_at updated
- **Unit:** Update intent_embedding → cluster affinities recomputed
- **Unit:** Update intent_embedding with active exclusive commitment → ACTIVE_COMMITMENT error
- **Unit:** Attempt to update role → IMMUTABLE_FIELD error
- **Unit:** Update agent_model → agent_model changes, no re-registration needed
- **Integration:** Register → create candidates → update embedding → candidates preserved with new scores
- **Integration:** Refresh → last_registered_at updated, staleness clock reset

### Definition of Done

- `schelling.update` modifies text fields without touching candidates/scores
- `schelling.update` with `recompute_scores` updates embeddings and triggers score recomputation while preserving all relationships
- `schelling.refresh` resets staleness clock without modifying data
- Immutable fields (role, protocol_version, verification_level) properly rejected
- Active commitment guard works for exclusive-commitment clusters

### Rollback Strategy

Remove the new handler. No schema changes. No data impact.

---

## Phase 6: Message Relay

**Complexity:** XL
**Estimated time:** 3–4 days
**Dependencies:** Phase 1

### What's Being Built

Agent-mediated conversation between connected users. Three new operations: `schelling.message`, `schelling.messages`, `schelling.direct`.

### DB Schema Changes

```sql
-- Migration 002: Message relay tables

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  sender_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'markdown')),
  read INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_candidate ON messages(candidate_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_token);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(candidate_id, read);

-- Track direct communication opt-ins
CREATE TABLE IF NOT EXISTS direct_optins (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  opted_in_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (candidate_id, user_token)
);

CREATE INDEX IF NOT EXISTS idx_direct_optins_candidate ON direct_optins(candidate_id);

-- Track relay blocks per candidate pair
CREATE TABLE IF NOT EXISTS relay_blocks (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  blocker_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  blocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (candidate_id, blocker_token)
);

CREATE INDEX IF NOT EXISTS idx_relay_blocks_candidate ON relay_blocks(candidate_id);

-- Add new pending action types
-- (pending_actions table already exists, just need to accept new types)
```

Update `pending_actions` CHECK constraint to include `'new_message'`, `'direct_request'`, `'jury_duty'`, `'profile_refresh'`.

### New Files

| File | Purpose |
|---|---|
| `src/handlers/message.ts` | `handleMessage(input, ctx)`. Validate: user exists, candidate exists, caller is participant, both at CONNECTED+. Validate content length ≤ 5000 chars. Insert message. Create `new_message` pending action for recipient. Return `{message_id, sent_at, candidate_id}`. |
| `src/handlers/messages.ts` | `handleMessages(input, ctx)`. Validate same as above. Query messages for candidate_id with pagination (limit, before, after). Mark returned messages from other party as read. Return `{messages: [...], total_messages, has_more}`. |
| `src/handlers/direct.ts` | `handleDirect(input, ctx)`. Validate both at CONNECTED+. Check both have `identity.contact`. Insert opt-in record. If both sides opted in, return `{status: "mutual", contact: other_contact}`. Else return `{status: "pending"}`. Create `direct_request` pending action for other party. |
| `src/handlers/relay-block.ts` | `handleRelayBlock(input, ctx)`. Insert/delete relay block record in `relay_blocks` table. When block active, suppress message delivery from blocked party (sender sees success, message not delivered). Per-candidate rate limit: 10 consecutive messages without reply triggers `RATE_LIMITED`. |
| `src/handlers/pending.ts` | `handlePending(input, ctx)`. Query all pending actions for caller: evaluate, exchange, respond_proposal, review_commitment, review_dispute, provide_verification, provide_identity, new_message, direct_request, jury_duty, profile_refresh, mutual_gate_expired. Return `{actions: [{id, candidate_id, action_type, created_at, metadata}]}`. For jury_duty: include `{dispute_id, verdict_deadline}`. For profile_refresh: include `{last_registered_at, age_days, recommendation}`. |
| `src/db/migrations/002-message-relay.ts` | Migration script for messages, direct_optins, and relay_blocks tables. |

### Files Modified

| File | Change |
|---|---|
| `src/db/schema.ts` | Add messages, direct_optins, relay_blocks tables to DDL. Update pending_actions CHECK constraint. |
| `src/handlers/get-introductions.ts` | Add `relay_enabled: true`, `direct_established` (check direct_optins), `unread_messages` (count unread messages) to each introduction. Return real contact info if direct_established. |
| `src/handlers/propose.ts` | On mutual commit, return `relay_enabled: true` and `contact: "relay"` instead of real contact. |
| `src/transports/mcp.ts` | Add `schelling.message`, `schelling.messages`, `schelling.direct`, `schelling.relay_block`, `schelling.pending` tools. |
| `src/transports/rest.ts` | Add 5 new endpoints (`/schelling/message`, `/schelling/messages`, `/schelling/direct`, `/schelling/relay_block`, `/schelling/pending`). |
| `src/handlers/export-data.ts` | Include messages in export. |
| `src/handlers/delete-account.ts` | Add messages and direct_optins to deletion cascade. |

### Test Plan

- **Unit:** Send message at wrong stage → STAGE_VIOLATION
- **Unit:** Send message > 5000 chars → MESSAGE_TOO_LONG
- **Unit:** Send message to non-participant → UNAUTHORIZED
- **Integration:** Connect → send message → retrieve messages → message appears
- **Integration:** Message read tracking — retrieve marks as read, unread count updates
- **Integration:** Direct opt-in — one side → pending. Both sides → mutual with real contact
- **Integration:** After direct, relay still works (both channels available)
- **Integration:** Connections shows unread_messages count and direct_established flag
- **Integration:** Pagination — send 60 messages, retrieve with limit=50, use before cursor for next page
- **Edge case:** Send message after other party deletes account → appropriate error
- **Integration:** Relay block → messages from blocked party suppressed silently
- **Integration:** Relay block + unblock → messages resume
- **Integration:** Per-candidate rate limit → 10 unanswered messages → RATE_LIMITED

### Definition of Done

- `schelling.message` sends messages between CONNECTED parties
- `schelling.messages` retrieves paginated message history with read tracking
- `schelling.direct` enables mutual real-contact-info exchange
- Connections returns relay/direct status and unread counts
- On mutual commit, contact is "relay" (not real contact)
- All privacy guarantees maintained: no tokens/contact in message metadata
- `schelling.relay_block` suppresses message delivery per-candidate without exiting the match
- Per-candidate message rate limit (10 unanswered) prevents one-sided flooding

### Rollback Strategy

Drop messages and direct_optins tables. Revert handlers to return real contact on commit (v1 behavior). No data loss for core matching data.

---

## Phase 7: Feedback & Learning System

**Complexity:** XL
**Estimated time:** 4–5 days
**Dependencies:** Phase 2 (bidirectional scores), Phase 4 (decline feedback)

### What's Being Built

Structured feedback collection, learned preferences, collaborative filtering, and insights API.

### DB Schema Changes

```sql
-- Migration 003: Feedback and learning tables

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  dimension_scores TEXT, -- JSON: {dimension_name: float in [-1,1]}
  rejection_reason TEXT,
  rejection_freeform TEXT,
  what_i_wanted TEXT,
  satisfaction TEXT CHECK (satisfaction IS NULL OR satisfaction IN ('very_satisfied','satisfied','neutral','dissatisfied','very_dissatisfied')),
  would_recommend INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_token);
CREATE INDEX IF NOT EXISTS idx_feedback_candidate ON feedback(candidate_id);

CREATE TABLE IF NOT EXISTS learned_preferences (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL,
  dimension_importance TEXT, -- JSON: {dimension: weight}
  ideal_ranges TEXT, -- JSON: {dimension: {min, max, ideal}}
  rejection_patterns TEXT, -- JSON: {reason: count}
  stage_decline_distribution TEXT, -- JSON: {stage: count}
  feedback_count INTEGER NOT NULL DEFAULT 0,
  feedback_quality_score REAL NOT NULL DEFAULT 0.0,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_token, cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_learned_prefs_user ON learned_preferences(user_token);
CREATE INDEX IF NOT EXISTS idx_learned_prefs_cluster ON learned_preferences(cluster_id);
```

### New Files

| File | Purpose |
|---|---|
| `src/handlers/feedback.ts` | `handleFeedback(input, ctx)`. Accept dimension_scores, rejection_reason, rejection_freeform, what_i_wanted, satisfaction, would_recommend. Insert/update feedback record. Trigger learned preference recomputation. Return `{recorded: true, feedback_id, insights_available}`. |
| `src/handlers/my-insights.ts` | `handleMyInsights(input, ctx)`. Aggregate feedback history. Compute rejection_patterns, preference_drift, suggested_adjustments. Compute collaborative_suggestions (find similar users by embedding cosine sim > 0.8, aggregate their feedback patterns). Return full insights object per spec §5.25. |
| `src/core/learning.ts` | `updateLearnedPreferences(db, userToken, clusterId)`. Recomputes dimension_importance (dimensions with avg |deviation| > 0.5 get higher weight), ideal_ranges (centroid of near-zero deviation matches), rejection_patterns, feedback_quality_score. Feedback quality is 4-factor per §18.6: completeness (0.20), consistency (0.30), specificity (0.20), behavioral coherence (0.30). Behavioral coherence cross-validates explicit feedback vs implicit signals (decline patterns). Feedback from users with quality <0.3 is discounted 50% in both user-specific and collaborative filtering. Also incorporates implicit stage-transition signals per §7.8: DISCOVERED decline = 0.2 weight, EVALUATED = 0.5, EXCHANGED/COMMITTED = 0.8, withdraw = 0.5, CONNECTED without negative = 0.8, COMPLETED positive = 1.0, COMPLETED negative = 1.0. |
| `src/core/collaborative.ts` | `getCollaborativeSuggestions(db, userToken, clusterId)`. Find users with trait embedding cosine sim > 0.8. Aggregate their feedback. Return similar_users_preferred, similar_users_avoided, confidence. Minimum: 3 similar users with feedback. |
| `src/db/migrations/003-feedback-learning.ts` | Migration script. |

### Files Modified

| File | Change |
|---|---|
| `src/handlers/decline.ts` | Pass `feedback` to feedback system when provided. |
| `src/handlers/report-outcome.ts` | Accept `feedback` param, pass to feedback system. **Add:** `ALREADY_REPORTED` guard — each user may report once per candidate pair. |
| `src/matching/scoring.ts` | Integrate learned preferences into preference_alignment component (weight 0.20). Use `ideal_ranges` to compute how well a candidate falls within the scorer's learned preferences. When no learned prefs, default to trait cosine similarity. |
| `src/transports/mcp.ts` | Add `schelling.feedback` and `schelling.my_insights` tools. Update `schelling.decline` and `schelling.report` to accept feedback. |
| `src/transports/rest.ts` | Add 2 new endpoints. |
| `src/handlers/export-data.ts` | Include feedback and learned_preferences. |
| `src/handlers/delete-account.ts` | Add to cascade. |

### Test Plan

- **Unit:** Feedback storage and retrieval
- **Unit:** Learned preference computation from 5+ feedback submissions
- **Unit:** Dimension importance correctly weights high-deviation dimensions
- **Unit:** Ideal ranges computed from near-zero deviation matches
- **Unit:** Feedback quality score: complete feedback > sparse feedback
- **Unit:** Collaborative filtering with 3+ similar users
- **Unit:** Collaborative filtering with < 3 similar users → empty suggestions
- **Integration:** Submit feedback → call my_insights → see patterns
- **Integration:** Feedback via decline → updates learned preferences
- **Integration:** Preference alignment affects scoring after 3+ feedbacks
- **Edge case:** Zero feedback → my_insights returns empty but valid structure
- **Edge case:** Inconsistent feedback → low feedback_quality_score

### Definition of Done

- `schelling.feedback` stores structured feedback
- `schelling.my_insights` returns aggregated patterns, preference drift, suggestions
- Learned preferences integrate into bidirectional scoring (preference_alignment component)
- Collaborative filtering produces suggestions when sufficient similar users exist
- Cold-start behavior works: good matches from day one with zero feedback

### Rollback Strategy

Drop feedback and learned_preferences tables. Revert scoring to not use learned prefs (preference_alignment defaults to trait similarity). No impact on core matching.

---

## Phase 8: Match Explainability

**Complexity:** M
**Estimated time:** 1.5 days
**Dependencies:** Phase 2

### What's Being Built

Add `narrative_summary`, `predicted_friction`, and `conversation_starters` to evaluate and exchange responses. Server-generated, template-based (no LLM required).

### New Files

| File | Purpose |
|---|---|
| `src/matching/explainability.ts` | `generateNarrativeSummary(breakdown, sharedInterests, complementaryTraits, intentSimilarity) → string`. Template-based: "You both value {top_alignment} and show strong alignment in {group}..." `generatePredictedFriction(complementaryTraits, breakdown) → string[]`. Identify dimensions with large divergence. `generateConversationStarters(sharedInterests, strongestAlignments, complementaryTraits) → string[]`. 2–5 topic suggestions. |

### Files Modified

| File | Change |
|---|---|
| `src/handlers/compare.ts` | Add `narrative_summary`, `predicted_friction`, `conversation_starters` to each comparison result. |
| `src/handlers/request-profile.ts` | Add same three fields to profile response. |
| `src/handlers/propose.ts` | Add `conversation_starters` and `narrative_summary` to introduction. |
| `src/handlers/get-introductions.ts` | Add `conversation_starters` to introductions. |

### Test Plan

- **Unit:** Narrative summary with strong personality alignment → mentions personality
- **Unit:** Narrative summary with shared interests → mentions interests
- **Unit:** Predicted friction with large divergence on extraversion → mentions social energy
- **Unit:** Conversation starters with shared interests → mentions interests
- **Unit:** Edge case: no shared interests, no strong alignments → generic but useful output
- **Integration:** Evaluate returns all three explainability fields
- **Integration:** Exchange returns all three

### Definition of Done

- Every evaluate and exchange response includes narrative_summary, predicted_friction, conversation_starters
- Outputs are human-readable, specific when data is rich, generic when data is sparse
- No LLM dependency — pure template filling

### Rollback Strategy

Remove the three fields from responses. No schema changes. No data impact.

---

## Phase 9: Agent Jury System

**Complexity:** XL
**Estimated time:** 3–4 days
**Dependencies:** Phase 1

### What's Being Built

Replace centralized dispute resolution with decentralized agent jury. Add `schelling.jury_duty` and `schelling.jury_verdict`.

### DB Schema Changes

```sql
-- Migration 004: Agent jury system

CREATE TABLE IF NOT EXISTS jury_assignments (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  juror_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  verdict TEXT CHECK (verdict IS NULL OR verdict IN ('for_filer','for_defendant','dismissed')),
  reasoning TEXT,
  voted_at TEXT,
  replaced INTEGER NOT NULL DEFAULT 0,
  replaced_at TEXT,
  UNIQUE (dispute_id, juror_token)
);

CREATE INDEX IF NOT EXISTS idx_jury_dispute ON jury_assignments(dispute_id);
CREATE INDEX IF NOT EXISTS idx_jury_juror ON jury_assignments(juror_token);
CREATE INDEX IF NOT EXISTS idx_jury_verdict ON jury_assignments(verdict);

-- Update disputes table
ALTER TABLE disputes ADD COLUMN jury_size INTEGER NOT NULL DEFAULT 3;
ALTER TABLE disputes ADD COLUMN verdict_deadline TEXT;
ALTER TABLE disputes ADD COLUMN defendant_response TEXT;
ALTER TABLE disputes ADD COLUMN defendant_response_at TEXT;
```

### New Files

| File | Purpose |
|---|---|
| `src/handlers/jury-duty.ts` | `handleJuryDuty(input, ctx)`. Query jury_assignments for juror where verdict IS NULL and not replaced. For each, build case presentation: anonymized evidence, reputation scores, interaction summary, context. Return `{cases: [...]}`. |
| `src/handlers/jury-verdict.ts` | `handleJuryVerdict(input, ctx)`. Validate: caller is assigned juror, hasn't voted, deadline not passed. Record verdict + reasoning. Check if majority reached. If so, resolve dispute, apply reputation consequences, create reputation events. Return `{recorded, verdict_count, verdict_threshold, resolved, resolution}`. |
| `src/core/jury-selection.ts` | `selectJury(db, disputeId, filerToken, defendantToken, jurySize)`. Find eligible jurors: no shared candidates, different candidate pools (Jaccard < 0.3), different agent_model, reputation ≥ 0.6, not called in 90 days. Relax criteria in specified order if insufficient (first 90-day cap, then candidate-pool, then agent-model; NEVER relax no-shared-candidates or reputation threshold). If fewer than 3 jurors after all relaxation, escalate to server operator (set dispute status to `"operator_review"`). Return juror tokens or null for operator escalation. `replaceJuror(db, disputeId, oldJurorToken)` — replace non-responsive juror after 7-day timeout: mark old assignment `replaced=1, replaced_at=now`, select new juror with same criteria, create new assignment with fresh 7-day deadline. Old juror receives `JUROR_REPLACED` if they try to vote. |
| `src/db/migrations/004-jury-system.ts` | Migration script. |

### Files Modified

| File | Change |
|---|---|
| `src/handlers/file-dispute.ts` | After filing, create `review_dispute` pending action for defendant (48-hour response window). Call `selectJury()` and create jury_assignments. Set verdict_deadline (7 days from jury assignment, not filing). Create `jury_duty` pending action for each juror. If defendant doesn't respond within 48h, case proceeds without defendant evidence (auto-escalation per §11.9). Return `{dispute_id, status: "jury_selection", jury_size, verdict_deadline}`. |
| `src/core/reputation.ts` | Handle jury-related reputation events: majority jurors get +0.02 boost, losing party gets penalty. |
| `src/transports/mcp.ts` | Add `schelling.jury_duty` and `schelling.jury_verdict` tools. |
| `src/transports/rest.ts` | Add 2 new endpoints. |
| `src/handlers/export-data.ts` | Include jury_assignments. |
| `src/handlers/delete-account.ts` | Add jury_assignments to cascade. |

### Test Plan

- **Unit:** Jury selection with clean pool → 3 eligible jurors
- **Unit:** Jury selection with insufficient pool → relaxed criteria
- **Unit:** Jury selection excludes users with shared candidates
- **Unit:** Jury selection excludes same agent_model
- **Unit:** Verdict recording and majority detection (2 of 3)
- **Unit:** Reputation impact: for_filer → defendant -0.15
- **Unit:** Reputation impact: for_defendant → filer -0.10
- **Unit:** Juror majority boost: +0.02
- **Integration:** File dispute → jury assigned → jury_duty shows case → verdicts → resolution
- **Integration:** Frivolous filing detection (3 losses in 30 days)
- **Edge case:** Juror fails to respond → replacement logic
- **Edge case:** All verdicts different → dismissed
- **Edge case:** Defendant doesn't respond in 48h → case proceeds

### Definition of Done

- Disputes trigger jury selection automatically
- `schelling.jury_duty` presents anonymized cases
- `schelling.jury_verdict` records verdicts and triggers resolution on majority
- Reputation consequences applied correctly
- Juror incentives (majority boost) working

### Rollback Strategy

Revert to centralized dispute resolution (current behavior in `src/core/disputes.ts`). Drop jury_assignments table. Disputes table keeps new columns but they're ignored.

---

## Phase 10: Embedding Staleness & Agent Quality

**Complexity:** M
**Estimated time:** 1.5 days
**Dependencies:** Phase 1

### What's Being Built

Three major subsystems: (1) Full reputation computation per spec §9, (2) staleness tracking with visibility penalties, (3) agent quality metrics. Also: `schelling.withdraw` reputation integration.

### Files Modified

| File | Change |
|---|---|
| `src/handlers/search.ts` | After scoring, apply staleness penalty: `combined_score × max(0.7, 1.0 - (age_days - 90) / 300)` for profiles > 90 days old. Set `stale: true` for profiles > 180 days. |
| `src/handlers/get-reputation.ts` | Return full §9 breakdown for self-query: `{score, cluster_scores, breakdown: {outcome, completion, consistency, dispute, tenure}, interaction_count, verification_level, member_since, agent_quality_score}`. For other-user queries: only `{score, interaction_count, verification_level, member_since}`. |
| `src/core/reputation.ts` | **Major rewrite per §9.** Implement 5-factor weighted computation: outcome (0.40), completion (0.20), consistency (0.20), dispute (0.10), tenure (0.10). Cross-cluster bleed: `effective = 0.80 × cluster_score + 0.20 × global_score`. Time decay: `weight = max(0.2, e^(-age_days/365))`. Cold start: score 0.5 for <5 interactions, 1.5× weighting during provisional period. Consistency scoring: Pearson correlation of combined_score vs outcome value (positive=1, neutral=0.5, negative=0); `max(0, correlation)`. Consistency penalty: users with consistency <0.3 after 10+ events get `effective_reputation × max(0.5, consistency_score)`. Sybil resistance: phone hash dedup check, agent attestation credibility (<10h interaction = discount), spam detection (>3 registrations from same phone_hash in 24h). |
| `src/handlers/withdraw.ts` | Add reputation cost: record withdrawal as reputation event. Track withdrawal frequency per cluster per 30-day window. >3 withdrawals per cluster per 30 days = additional reputation penalty. Reset caller stage from COMMITTED to EXCHANGED. |

### New Files

| File | Purpose |
|---|---|
| `src/core/staleness.ts` | `computeStalenessPenalty(lastRegisteredAt) → {factor: number, stale: boolean, penalized: boolean}`. Factor is 1.0 for < 90 days, decaying for 90-390 days, min 0.7. |
| `src/core/agent-quality.ts` | Agent quality computation. Per-model outcome aggregation. Formula: `0.5 × positive_rate + 0.3 × consistency + 0.2 × completion_rate`. Requires ≥ 20 outcomes. Score decay for inactive models: `decayed = 0.5 + (original - 0.5) × max(0, 1.0 - (days_inactive - 180) / 365)` — fully neutral after 545 days of inactivity. |

### Test Plan

- **Unit:** Staleness penalty at 0, 90, 180, 270 days
- **Unit:** Agent quality with 20+ outcomes
- **Unit:** Agent quality with < 20 outcomes → null
- **Unit:** Agent quality decay after 180, 365, 545 days of inactivity
- **Unit:** Reputation 5-factor computation with known inputs
- **Unit:** Cross-cluster bleed (80/20 split)
- **Unit:** Time decay at 0, 180, 365, 730 days
- **Unit:** Cold start: <5 interactions → 0.5, provisional 1.5× weighting
- **Unit:** Consistency scoring with known correlation values
- **Unit:** Consistency penalty: score <0.3 after 10+ events → effective reputation reduced
- **Unit:** Sybil resistance: duplicate phone hash detection
- **Unit:** Withdrawal reputation cost: 1 withdrawal OK, 4 in 30 days → extra penalty
- **Integration:** Register, mock time forward 100 days, search → combined_score reduced
- **Integration:** Search results include `stale` flag for old profiles
- **Integration:** Reputation self-query includes full breakdown + agent_quality_score
- **Integration:** Withdraw from COMMITTED → stage resets to EXCHANGED, reputation event created

### Definition of Done

- Profiles > 90 days get visibility penalty in search
- Profiles > 180 days flagged as stale
- Agent quality metrics computed from ≥ 20 outcomes
- Staleness info available in insights

### Rollback Strategy

Remove staleness penalty from search (simple code revert). Agent quality is additive — removing it just removes the field from responses.

---

## Phase 11: Analytics & A/B Testing

**Complexity:** L
**Estimated time:** 2–3 days
**Dependencies:** Phase 7

### What's Being Built

`schelling.analytics` with funnel metrics, outcome stats, feature importance, A/B test infrastructure with statistical rigor.

### DB Schema Changes

```sql
-- Migration 005: Analytics infrastructure

CREATE TABLE IF NOT EXISTS algorithm_variants (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_token)
);

CREATE INDEX IF NOT EXISTS idx_variants_variant ON algorithm_variants(variant_id);

-- Stage transition log for funnel analytics
CREATE TABLE IF NOT EXISTS stage_transitions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_token TEXT NOT NULL,
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  transitioned_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transitions_candidate ON stage_transitions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_transitions_user ON stage_transitions(user_token);
CREATE INDEX IF NOT EXISTS idx_transitions_at ON stage_transitions(transitioned_at);
```

### New Files

| File | Purpose |
|---|---|
| `src/handlers/analytics.ts` | `handleAnalytics(input, ctx)`. Admin-only. Compute funnel_metrics (conversion rates, median time per stage, drop-off), outcome_metrics, feature_importance (Pearson correlation per dimension), rejection_analysis, decline_analytics, algorithm_variants (two-proportion z-test), agent_quality (per model), staleness_metrics, message_relay_metrics, jury_metrics, system_health. |
| `src/core/statistics.ts` | `twoProportionZTest(x1, n1, x2, n2)` → `{z, p_value, significant}`. `wilsonConfidenceInterval(successes, total, confidence)` → `{lower, upper}`. `pearsonCorrelation(xs, ys)` → `{r, p_value}`. |
| `src/core/ab-testing.ts` | `assignVariant(db, userToken)` — random assignment to variant. `getVariantStats(db, variantId)` — outcome aggregation. |
| `src/db/migrations/005-analytics.ts` | Migration script. |

### Files Modified

| File | Change |
|---|---|
| `src/core/funnel.ts` | Log stage transitions to stage_transitions table. |
| `src/handlers/register.ts` | Assign algorithm variant on registration. |
| `src/transports/mcp.ts` | Add `schelling.analytics` tool (admin auth). |
| `src/transports/rest.ts` | Add endpoint. |

### Test Plan

- **Unit:** Two-proportion z-test with known values
- **Unit:** Confidence interval computation
- **Unit:** Pearson correlation
- **Unit:** Funnel conversion rate calculation
- **Integration:** Register 100+ users, run through funnel, verify analytics output
- **Integration:** A/B variant assignment is random and persistent
- **Integration:** Analytics respects time_range filter

### Definition of Done

- `schelling.analytics` returns comprehensive metrics per spec §5.26
- A/B test infrastructure with proper statistical tests (p < 0.05 threshold, 100 minimum sample)
- Feature importance computed from dimension-outcome correlations
- All metrics scoped by cluster_id and time_range

### Rollback Strategy

Drop analytics tables. Remove analytics handler. No impact on core matching.

---

## Phase 12: Testing UI

**Complexity:** L
**Estimated time:** 2–3 days (planned in parallel)
**Dependencies:** Phase 2 (needs bidirectional scores to be meaningful)

### What's Being Built

Reference the `testing-ui-spec.md` (being written in parallel). The testing UI is a web-based tool for manually exercising the protocol: register users, run searches, walk through the funnel, view scores, send messages, file disputes.

### Approach

This is a standalone frontend project that talks to the REST API. It does NOT modify server code — it's a client.

### Key Pages

1. **Register** — Form for all registration fields, with intent embedding sliders for the 16 dimensions
2. **Search** — Execute search, display bidirectional scores in a table
3. **Funnel View** — Step through evaluate → exchange → commit → connect for a candidate
4. **Message Relay** — Chat interface for connected pairs
5. **Analytics Dashboard** — Display analytics output (admin)
6. **Cluster Explorer** — Visualize intent space, show centroid positions, plot registered users

### Files

| File | Purpose |
|---|---|
| `testing-ui/index.html` | Single-page app shell |
| `testing-ui/app.ts` | Main app logic, REST client |
| `testing-ui/components/` | UI components per page |
| `testing-ui/styles.css` | Styling |

### Test Plan

- Manual testing against a running server
- Verify all 41 operations can be exercised from the UI
- Verify bidirectional scores display correctly
- Verify message relay works end-to-end

### Definition of Done

- All protocol operations exercisable from the UI
- Intent embedding visualized as sliders with dimension labels
- Bidirectional scores clearly displayed (your_fit, their_fit, combined)
- Message relay functional
- Connected to REST API

### Rollback Strategy

It's a standalone frontend. Delete the directory.

---

## Timeline Estimate

Assuming one senior engineer + AI assistance, sequential execution with noted parallelism:

| Phase | Est. Days | Cumulative |
|---|---|---|
| Phase 1: Schema & Intent Space | 3–4 | 3–4 |
| Phase 2: Bidirectional Scoring | 2–3 | 5–7 |
| Phase 3: Clustering & Modules | 2 | 7–9 |
| Phases 4+5 (parallel): Decline Expiry + Update | 1.5 | 8.5–10.5 |
| Phase 6: Message Relay | 3–4 | 11.5–14.5 |
| Phase 7: Feedback & Learning | 4–5 | 15.5–19.5 |
| Phase 8: Explainability | 1.5 | 17–21 |
| Phase 9: Jury System | 3–4 | 20–25 |
| Phase 10: Staleness & Quality | 1.5 | 21.5–26.5 |
| Phase 11: Analytics & A/B | 2–3 | 23.5–29.5 |
| Phase 12: Testing UI | 2–3 (parallel) | — |
| Phase 13: Peer Roles in Talent | 0.5 | 24–30 |
| Phase 14: Multi-Party Groups | 2–3 | 26–33 |
| Phase 15: Structured Attributes | 1–2 | 27–35 |
| Phase 16: Inquire | 2–3 | 29–38 |
| Phase 17: Subscribe | 3–4 | 32–42 |
| Phase 18: Agent Capabilities | 2 | 34–44 |
| Phase 19: Contracts | 3–4 | 37–48 |
| Phase 20: Events | 2–3 | 39–51 |

**Core protocol (Phases 1–12): ~25–30 working days (5–6 weeks)**

With aggressive parallelism (Phases 4+5+6 parallel, Phases 8+9 parallel, Phase 12 parallel):
**Core protocol: ~20–24 working days (4–5 weeks)**

**Coordination kernel (Phases 16–20): ~8–10 additional working days (2 weeks)**

With aggressive parallelism (Phases 16+17+18 parallel, then 19→20):
**Coordination kernel: ~5.5–7 working days**

**Full implementation (all 20 phases): ~30–37 working days (6–8 weeks)**

---

## Global Invariants

1. **All existing tests must pass after every phase.** Update tests before proceeding.
2. **`vertical_id` backward compatibility maintained through Phase 3.** Can be deprecated after.
3. **No data loss at any point.** Migrations only ADD columns/tables; never DROP until fully migrated.
4. **Each phase is independently deployable.** No phase depends on another being deployed simultaneously.
5. **Idempotency keys work for all new operations.**
6. **Error codes match spec §14 exactly.** All 50+ error codes from the spec must be defined.
7. **All 41 spec operations covered.** Every operation from §5.1–§5.29 plus §4.11 (group_evaluate, group_commit) plus §21 (inquire, subscribe, unsubscribe, notifications, contract, contract_update, event) must have a corresponding implementation phase.

---

## Migration Execution Order

```
001-intent-space.ts          (Phase 1)
002-message-relay.ts         (Phase 6)
003-feedback-learning.ts     (Phase 7)
004-jury-system.ts           (Phase 9)
005-analytics.ts             (Phase 11)
006-groups.ts                (Phase 14)
007-inquiries.ts             (Phase 16)
008-subscriptions.ts         (Phase 17)
009-capabilities.ts          (Phase 18)
010-contracts.ts             (Phase 19)
011-events.ts                (Phase 20)
```

Migrations are additive (ALTER TABLE ADD, CREATE TABLE). Safe to run in sequence. Each migration is idempotent (uses IF NOT EXISTS / ADD COLUMN with error handling for SQLite's lack of IF NOT EXISTS on ALTER TABLE).

---

## File Organization After All Phases

```
src/
├── clusters/
│   ├── centroids.ts          (Phase 1)
│   ├── registry.ts           (Phase 1)
│   ├── types.ts              (Phase 1)
│   ├── matchmaking.ts        (Phase 1)
│   ├── marketplace.ts        (Phase 1)
│   ├── talent.ts             (Phase 1)
│   └── roommates.ts          (Phase 1)
├── modules/
│   ├── types.ts              (Phase 3)
│   ├── registry.ts           (Phase 3)
│   ├── negotiation.ts        (Phase 3)
│   ├── structured-data.ts    (Phase 3)
│   └── skills.ts             (Phase 3)
├── matching/
│   ├── compatibility.ts      (Phase 2 — rewritten)
│   ├── scoring.ts            (Phase 2 — new)
│   ├── intent.ts             (Phase 1 — new)
│   ├── privacy.ts            (Phase 1 — modified)
│   └── explainability.ts     (Phase 8 — new)
├── core/
│   ├── funnel.ts             (modified)
│   ├── reputation.ts         (modified)
│   ├── identity.ts           (reused)
│   ├── disputes.ts           (Phase 9 — rewritten)
│   ├── jury-selection.ts     (Phase 9 — new)
│   ├── abuse.ts              (reused)
│   ├── logger.ts             (reused)
│   ├── staleness.ts          (Phase 10 — new)
│   ├── agent-quality.ts      (Phase 10 — new)
│   ├── learning.ts           (Phase 7 — new)
│   ├── collaborative.ts      (Phase 7 — new)
│   ├── statistics.ts         (Phase 11 — new)
│   └── ab-testing.ts         (Phase 11 — new)
├── handlers/
│   ├── register.ts           (Phase 1 — rewritten)
│   ├── update.ts             (Phase 5 — new, supports embedding updates)
│   ├── refresh.ts            (Phase 5 — new)
│   ├── search.ts             (Phase 2 — rewritten)
│   ├── compare.ts            (Phase 2 — rewritten)
│   ├── request-profile.ts    (Phase 2 — modified)
│   ├── propose.ts            (Phase 2 — modified)
│   ├── get-introductions.ts  (Phase 6 — modified)
│   ├── decline.ts            (Phase 4 — rewritten)
│   ├── reconsider.ts         (Phase 4 — new)
│   ├── withdraw.ts           (modified)
│   ├── message.ts            (Phase 6 — new)
│   ├── messages.ts           (Phase 6 — new)
│   ├── direct.ts             (Phase 6 — new)
│   ├── relay-block.ts        (Phase 6 — new)
│   ├── report-outcome.ts     (Phase 7 — modified)
│   ├── feedback.ts           (Phase 7 — new)
│   ├── my-insights.ts        (Phase 7 — new)
│   ├── analytics.ts          (Phase 11 — new)
│   ├── negotiate.ts          (modified)
│   ├── verify.ts             (reused)
│   ├── file-dispute.ts       (Phase 9 — rewritten)
│   ├── jury-duty.ts          (Phase 9 — new)
│   ├── jury-verdict.ts       (Phase 9 — new)
│   ├── list-intents.ts       (Phase 3 — replaces list-verticals.ts)
│   ├── onboard.ts            (Phase 3 — modified)
│   ├── server-info.ts        (Phase 3 — modified)
│   ├── get-reputation.ts     (Phase 10 — modified)
│   ├── export-data.ts        (modified across phases)
│   ├── delete-account.ts     (modified across phases)
│   └── pending.ts            (Phase 6 — new, replaces inline pending logic)
├── db/
│   ├── schema.ts             (modified across phases)
│   ├── client.ts             (reused)
│   └── migrations/
│       ├── 001-intent-space.ts
│       ├── 002-message-relay.ts
│       ├── 003-feedback-learning.ts
│       ├── 004-jury-system.ts
│       └── 005-analytics.ts
├── transports/
│   ├── mcp.ts                (modified across phases)
│   └── rest.ts               (modified across phases)
├── types.ts                  (modified across phases)
└── index.ts                  (modified)

testing-ui/                   (Phase 12)
├── index.html
├── app.ts
├── components/
└── styles.css
```

**Additional files from Phases 13–20 (Coordination Kernel):**

```
src/handlers/
├── inquire.ts               (Phase 16)
├── subscribe.ts             (Phase 17)
├── unsubscribe.ts           (Phase 17)
├── notifications.ts         (Phase 17)
├── group-evaluate.ts        (Phase 14)
├── group-commit.ts          (Phase 14)
├── contract.ts              (Phase 19)
├── contract-update.ts       (Phase 19)
└── event.ts                 (Phase 20)

src/core/
└── subscription-matcher.ts  (Phase 17)

src/db/migrations/
├── 006-groups.ts            (Phase 14)
├── 007-inquiries.ts         (Phase 16)
├── 008-subscriptions.ts     (Phase 17)
├── 009-capabilities.ts      (Phase 18)
├── 010-contracts.ts         (Phase 19)
└── 011-events.ts            (Phase 20)
```

**Total: ~45 new files. ~25 modified files. ~5 deleted/replaced.**

---

## Appendix A: Gap Analysis — Spec Coverage Audit

**Date:** 2026-02-18
**Audited against:** spec-v2.md (all 41 operations, §1–§22)

The following gaps were identified where the implementation plan did not fully cover the spec. Each gap is documented with the fix applied above or noted for inline integration.

### Gap 1: `schelling.pending` handler not detailed

**Spec reference:** §5.29 — a full operation with input/output schema.
**Plan status:** Listed in file organization (Phase 6) as `src/handlers/pending.ts` but never described in any phase's "What's Being Built," "New Files," or "Test Plan."
**Fix:** Added to Phase 6 as an explicit new file with handler description and test coverage.

### Gap 2: `relay_blocks` table missing from migration 002

**Spec reference:** §5.16b — `schelling.relay_block` needs persistent block records.
**Plan status:** Phase 6 describes `src/handlers/relay-block.ts` but migration 002 has no `relay_blocks` table.
**Fix:** Added `relay_blocks` table to migration 002 schema.

### Gap 3: Mutual gate timeout logic not covered

**Spec reference:** §5.8 — If the other party doesn't reach EVALUATED within `mutual_gate_timeout_days` (default 30), the pending request expires and a `mutual_gate_expired` pending action is created.
**Plan status:** Not mentioned in any phase.
**Fix:** Added to Phase 5 as part of the exchange handler logic, with a periodic sweep or on-access check.

### Gap 4: Phase 5 dependency on Phase 2 for embedding score recomputation

**Spec reference:** §5.5 — `schelling.update` with `recompute_scores: true` triggers score recomputation using bidirectional scoring.
**Plan status:** Phase 5 lists dependency as "Phase 1" only, but embedding recomputation requires the bidirectional scoring from Phase 2.
**Fix:** Updated Phase 5 dependencies to include Phase 2 (for the recompute_scores path). Text-only updates can ship after Phase 1; embedding updates require Phase 2.

### Gap 5: Reputation system details incomplete

**Spec reference:** §9.1–9.7 — Cross-cluster bleed (80/20), time decay (`max(0.2, e^(-age_days/365))`), consistency scoring (Pearson correlation of combined_score vs outcome), Sybil resistance mechanisms, cold-start score of 0.5 for <5 interactions, 1.5× weighting during provisional period, consistency penalty for scores <0.3 after 10+ events.
**Plan status:** Phase 10 modifies `src/core/reputation.ts` but only mentions `computeAgentQuality`. The reputation factor formula, time decay, cross-cluster bleed, consistency scoring, and Sybil resistance are not specified in any phase.
**Fix:** Added Phase 10 reputation system work items covering all §9 requirements.

### Gap 6: Score quantization at DISCOVERED stage

**Spec reference:** §12.2 — At DISCOVERED, scores are quantized to 2 decimal places to limit information leakage.
**Plan status:** Not mentioned anywhere.
**Fix:** Added to Phase 2 search handler work.

### Gap 7: `schelling.withdraw` not assigned to any phase

**Spec reference:** §5.13 — Withdrawal carries reputation cost, rate-limited (>3 per cluster per 30 days = additional penalties), resets stage from COMMITTED to EXCHANGED.
**Plan status:** Listed as "REUSE with minor reputation integration" in current state but no phase owns the work.
**Fix:** Added to Phase 10 (reputation phase) since the main new work is reputation integration.

### Gap 8: Defendant response mechanism in jury system

**Spec reference:** §11.4 — Defendant is notified via pending action (`review_dispute`) and has 48 hours to respond before case goes to jury. §11.9 — Auto-escalation if defendant doesn't respond.
**Plan status:** Phase 9 mentions `defendant_response` and `defendant_response_at` columns but no handler for submitting the response.
**Fix:** Added defendant response handling to Phase 9's dispute filing flow.

### Gap 9: Juror replacement logic

**Spec reference:** §11.7 — Jurors who don't respond within 7 days are replaced. The replacement gets a fresh 7-day window.
**Plan status:** Phase 9 mentions "replacement logic" in edge case tests but doesn't describe implementation.
**Fix:** Added explicit juror replacement logic to Phase 9.

### Gap 10: Exclusive commitment auto-decline in commit handler

**Spec reference:** §5.9 — In exclusive_commitment clusters, committing auto-declines all other candidates.
**Plan status:** Not mentioned in Phase 2's commit handler modifications.
**Fix:** Added to Phase 2 propose.ts modifications.

### Gap 11: `USER_PAUSED` check in search

**Spec reference:** §5.6 — If caller's status is "paused", search fails with USER_PAUSED.
**Plan status:** Not mentioned in search handler.
**Fix:** Added to Phase 2 search handler.

### Gap 12: Pagination cursor in search

**Spec reference:** §5.6 — `cursor` input parameter and `next_cursor` output for pagination.
**Plan status:** Not mentioned.
**Fix:** Added to Phase 2 search handler.

### Gap 13: `ALREADY_REPORTED` guard in report

**Spec reference:** §5.17 — Each user may report once per candidate pair. Returns ALREADY_REPORTED if duplicate.
**Plan status:** Not explicitly mentioned in Phase 7's report handler.
**Fix:** Added to Phase 7.

### Gap 14: `mutual_no_identity` status in commit response

**Spec reference:** §5.9 — When both commit but one lacks identity data, return status `"mutual_no_identity"` and create `provide_identity` pending action.
**Plan status:** Not mentioned.
**Fix:** Added to Phase 2 propose.ts.

### Gap 15: Missing error codes in types.ts

**Spec reference:** §14 — Full error code list.
**Plan status:** Phase 1 lists new error codes to add but omits several that may not exist in v1: `STAGE_TOO_EARLY`, `MUTUAL_REQUIRED`, `NEGOTIATION_NOT_ENABLED`, `INVALID_STAGE`, `MAX_ROUNDS_EXCEEDED`, `NO_PROPOSAL_TO_ACCEPT`, `CANNOT_ACCEPT_OWN_PROPOSAL`, `PROPOSAL_NOT_PENDING`, `MISSING_PROPOSAL`, `INVALID_PROPOSAL_FIELD`, `NOT_PARTICIPANT`, `DUPLICATE_DISPUTE`, `DISPUTE_NOT_FOUND`, `NOT_JUROR`, `ALREADY_VOTED`, `VERDICT_DEADLINE_PASSED`, `NO_PENDING_REQUEST`, `ARTIFACTS_REQUIRED`, `INVALID_TYPE`, `CONFIRMATION_REQUIRED`, `RELAY_BLOCKED`, `INTERNAL_ERROR`.
**Fix:** Expanded the error code list in Phase 1 types.ts to include ALL §14 codes.

### Gap 16: Agent quality score decay for inactive models

**Spec reference:** §18.3 — Scores decay toward 0.5 after 180 days of inactivity.
**Plan status:** Not mentioned.
**Fix:** Added to Phase 10 agent-quality.ts.

### Gap 17: Feedback quality scoring details

**Spec reference:** §8.4 / §18.6 — Four-factor quality score (completeness 0.20, consistency 0.30, specificity 0.20, behavioral coherence 0.30). Feedback from users with quality <0.3 is discounted 50%.
**Plan status:** Phase 7 mentions `feedback_quality_score` field but doesn't specify the four-factor computation or the discount mechanism.
**Fix:** Added computation details to Phase 7 learning.ts.

### Gap 18: Implicit signals from stage transitions

**Spec reference:** §7.8 — Stage transitions produce implicit feedback signals with specific weights (0.2 for DISCOVERED decline through 1.0 for COMPLETED outcome).
**Plan status:** Not mentioned in Phase 7 or Phase 11.
**Fix:** Added to Phase 7 learning system as input alongside explicit feedback.

### Gap 19: `schelling.exchange` mutual gate and pending_mutual response

**Spec reference:** §5.8 — If the other side hasn't reached EVALUATED, return status `"pending_mutual"` with stage info.
**Plan status:** The exchange handler (request-profile.ts) is listed as "MODIFY" but the mutual gate logic and the two response formats aren't described.
**Fix:** Added to Phase 2 request-profile.ts modifications.

### Gap 20: `schelling.negotiate` and `schelling.verify` not assigned to phases

**Spec reference:** §5.18 (`schelling.negotiate`), §5.19 (`schelling.verify`).
**Plan status:** Listed in current state as "MODIFY" and "REUSE" but not explicitly assigned to any phase's deliverables.
**Fix:** Added to Phase 3 (clustering) as explicit modification items, since the main work is the vertical→cluster context change.

### Gap 21: Rate limiting infrastructure

**Spec reference:** §16.3 — Per-operation rate limits with specific recommended defaults.
**Plan status:** Not covered in any phase.
**Fix:** This is cross-cutting infrastructure. Added note to Phase 1 as a foundation concern (rate limit table/middleware), with specific limits applied per-handler as each phase ships.

---

## Appendix B: Inline Fixes Applied to Phases

The following inline fixes have been applied to the phase descriptions above (documented here for traceability):

**Phase 1:**
- Added ALL §14 error codes to types.ts (not just the new ones — ensure complete coverage)
- Added rate limiting middleware/table as foundation work

**Phase 2:**
- Added score quantization (2 decimal places) at DISCOVERED stage to search handler
- Added `USER_PAUSED` caller status check to search handler
- Added `cursor`/`next_cursor` pagination to search handler
- Added `pending_actions` to search response
- Added exclusive commitment auto-decline logic to propose.ts (commit handler)
- Added `mutual_no_identity` status handling to propose.ts
- Added mutual gate (`pending_mutual` response) to request-profile.ts (exchange handler)

**Phase 5:**
- Updated dependencies: Phase 1 for text-only updates, Phase 2 for embedding recomputation
- Added mutual gate timeout sweep/check logic

**Phase 6:**
- Added `relay_blocks` table to migration 002
- Added `schelling.pending` handler as explicit deliverable with full description

**Phase 7:**
- Added ALREADY_REPORTED guard to report handler
- Added feedback quality score four-factor computation to learning.ts
- Added implicit stage-transition signals (§7.8 weights) as input to learning system
- Added 50% discount for feedback from users with quality <0.3

**Phase 9:**
- Added defendant response submission mechanism (via pending action + dispute update endpoint or inline in dispute handler)
- Added 48-hour auto-escalation for non-responsive defendants
- Added juror replacement logic (7-day timeout → replace → new 7-day window)
- Added JUROR_REPLACED error code handling

**Phase 10:**
- Added full reputation computation per §9: cross-cluster bleed (80/20), time decay, consistency scoring (Pearson), cold-start (0.5 for <5 interactions, 1.5× provisional weighting), consistency penalty (<0.3 after 10+ events)
- Added Sybil resistance checks (phone hash dedup, agent attestation credibility, spam detection)
- Added `schelling.withdraw` reputation integration (reputation cost, rate-limit >3/cluster/30days)
- Added agent quality score decay for inactive models (§18.3)

---

## Phase 13: Journey Fix — Peer Roles in Talent Cluster

**Complexity:** S
**Estimated time:** 0.5 day
**Dependencies:** Phase 1, Phase 3

### What's Being Built

Add `peer` role to talent cluster and `peer_roles` support to cluster configuration. Update search to handle peer-role matching (same-role search).

### Files Modified

| File | Change |
|---|---|
| `src/clusters/types.ts` | Add `peer_roles: string[]` to `IntentClusterConfig`. |
| `src/clusters/talent.ts` | Add `peer` role definition. Set `peer_roles: ["peer"]`. |
| `src/handlers/search.ts` | Update role filtering: if caller has a peer role, search for same-role users instead of complementary role. |
| `src/handlers/register.ts` | Accept `role: "peer"` for talent cluster. |

### Test Plan

- Register two users as `peer` in talent cluster → both appear in each other's search
- Register `employer` → `peer` users NOT in results
- Register `peer` → `employer`/`candidate` users NOT in results

---

## Phase 14: Journey Fix — Multi-Party Group Formation

**Complexity:** L
**Estimated time:** 2–3 days
**Dependencies:** Phase 1, Phase 2

### What's Being Built

`schelling.group_evaluate` and `schelling.group_commit` operations. Group record storage. Update roommates cluster to `group_size: {min: 2, max: 6}`.

### DB Schema Changes

```sql
-- Migration 006: Multi-party groups

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  cluster_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(user_token),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'complete', 'dissolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_token TEXT NOT NULL REFERENCES users(user_token),
  committed INTEGER NOT NULL DEFAULT 0,
  committed_at TEXT,
  UNIQUE (group_id, user_token)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_token);
```

### New Files

| File | Purpose |
|---|---|
| `src/handlers/group-evaluate.ts` | Compute pairwise matrix for proposed group members. Return min/mean/viable/weakest_pair. |
| `src/handlers/group-commit.ts` | Create or join a group. Track per-member commitment. Complete group when all committed. Dissolve when membership drops below min. |
| `src/db/migrations/006-groups.ts` | Migration script. |

### Files Modified

| File | Change |
|---|---|
| `src/clusters/roommates.ts` | Set `group_size: {min: 2, max: 6}`, `group_min_pairwise: 0.4`. |
| `src/clusters/types.ts` | Add `group_size`, `group_min_pairwise` to config. |
| `src/handlers/connections.ts` | Include group connections (all members' names when group is complete). |
| `src/transports/mcp.ts` | Add `schelling.group_evaluate`, `schelling.group_commit` tools. |
| `src/transports/rest.ts` | Add 2 new endpoints. |

### Test Plan

- Group evaluate with 3 members → returns 3 pairwise scores
- Group commit creates proposed group → second member joins → third joins → status "complete"
- Member declines → removed from group. If below min, group dissolved.
- Group proposal in pair-only cluster → INVALID_INPUT
- Group with pair below min_pairwise → rejected

---

## Phase 15: Journey Fix — Structured Attributes & Hard Filters

**Complexity:** M
**Estimated time:** 1–2 days
**Dependencies:** Phase 1

### What's Being Built

`structured_attributes` field on registration, `hard_filters` and `soft_filters` on search. Exact-match filtering server-side.

### DB Schema Changes

Already included in Phase 1 migration: `structured_attributes TEXT` on users table.

### Files Modified

| File | Change |
|---|---|
| `src/handlers/register.ts` | Accept and store `structured_attributes` object. Validate: keys are strings, values are strings or arrays of strings. Max 20 keys, max 100 chars per value. |
| `src/handlers/update.ts` | Accept `structured_attributes` updates (merge or replace). |
| `src/handlers/search.ts` | Accept `hard_filters` and `soft_filters` objects. Apply hard_filters before scoring: for each filter key, check candidate's `structured_attributes[key]` contains any filter value. Apply soft_filters as +0.05/match scoring bonus (capped +0.15). Return `structured_attributes` in candidate results. |
| `src/handlers/onboard.ts` | Return `recommended_attributes` per cluster. |
| `src/handlers/list-intents.ts` | Include `recommended_attributes` in cluster info. |
| `src/transports/mcp.ts` | Update register, update, search tool schemas. |
| `src/transports/rest.ts` | Update accordingly. |

### Test Plan

- Register with `structured_attributes: {languages: ["en", "zh"], profession: "attorney"}` → stored correctly
- Search with `hard_filters: {languages: "zh"}` → only candidates with "zh" in languages returned
- Search with `hard_filters: {languages: "zh", jurisdiction: "CO"}` → conjunctive: both must match
- Search with `soft_filters: {languages: "zh"}` → non-matching candidates still returned, matching candidates get score boost
- Candidate without the filtered attribute key → excluded by hard filter
- Update structured_attributes → search reflects new values
- Hard filter + embedding scoring → filters narrow, then similarity ranks within filtered set

---

## Deployment & Operations

### Environment Configuration

**Development Environment:**
```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  schelling-api:
    build: .
    environment:
      - NODE_ENV=development
      - DATABASE_URL=sqlite:./dev.db
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=debug
      - RATE_LIMIT_ENABLED=false
      - FEATURE_FLAGS=bidirectional_scoring:true,message_relay:false
    volumes:
      - ./src:/app/src
      - ./dev.db:/app/dev.db
    ports:
      - "3000:3000"
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  postgres: # For production-scale testing
    image: postgres:15
    environment:
      POSTGRES_DB: schelling_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
```

**Staging Environment:**
```yaml
# Production-like setup with pgvector extension for embedding similarity
version: '3.8'
services:
  schelling-api:
    image: schelling:${BUILD_TAG}
    environment:
      - NODE_ENV=staging
      - DATABASE_URL=postgresql://staging_user:${DB_PASSWORD}@postgres:5432/schelling_staging
      - REDIS_URL=redis://redis-cluster:6379
      - LOG_LEVEL=info
      - RATE_LIMIT_REDIS_URL=redis://redis-cluster:6379
      - FEATURE_FLAGS=bidirectional_scoring:true,message_relay:true,jury_system:false
      - METRICS_ENABLED=true
      - HEALTH_CHECK_PATH=/health
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
  
  postgres:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: schelling_staging
      POSTGRES_USER: staging_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - staging_db_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 2G

  redis-cluster:
    image: redis:7-alpine
    command: redis-server --maxmemory 512mb --maxmemory-policy lru
```

**Production Environment:**
```yaml
# High-availability production setup with load balancing
# Kubernetes deployment configuration
apiVersion: apps/v1
kind: Deployment
metadata:
  name: schelling-api
spec:
  replicas: 4
  selector:
    matchLabels:
      app: schelling-api
  template:
    spec:
      containers:
      - name: schelling-api
        image: schelling:${RELEASE_TAG}
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: connection-string
        - name: REDIS_CLUSTER_URLS
          value: "redis://redis-0:6379,redis://redis-1:6379,redis://redis-2:6379"
        - name: FEATURE_FLAGS
          valueFrom:
            configMapKeyRef:
              name: feature-flags
              key: flags
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"  
            cpu: "500m"
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
```

### CI/CD Pipeline Structure

```yaml
# .github/workflows/deploy.yml
name: Deploy Schelling Protocol

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg15
        env:
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linting
      run: npm run lint
      
    - name: Run type checking
      run: npm run type-check
    
    - name: Run unit tests
      run: npm run test:unit
      env:
        DATABASE_URL: postgresql://postgres:test_password@localhost:5432/test
        REDIS_URL: redis://localhost:6379
    
    - name: Run integration tests
      run: npm run test:integration
      
    - name: Run migration tests
      run: npm run test:migrations
      
    - name: Run load tests (light)
      run: npm run test:load:ci
      
    - name: Generate test coverage
      run: npm run test:coverage
      
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
  
  security-scan:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Run Snyk vulnerability scan
      run: npx snyk test
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
    
    - name: Run SAST with CodeQL
      uses: github/codeql-action/init@v2
      with:
        languages: typescript
  
  build-and-deploy-staging:
    if: github.ref == 'refs/heads/develop'
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker image
      run: |
        docker build -t schelling:${{ github.sha }} .
        docker tag schelling:${{ github.sha }} schelling:staging-latest
    
    - name: Deploy to staging
      run: |
        # Zero-downtime deployment
        ./scripts/deploy-staging.sh ${{ github.sha }}
    
    - name: Run smoke tests
      run: ./scripts/smoke-tests-staging.sh
      
    - name: Run performance regression tests  
      run: ./scripts/performance-tests.sh staging
  
  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    environment: production
    steps:
    - name: Deploy with blue-green strategy
      run: |
        ./scripts/deploy-production.sh ${{ github.sha }}
        
    - name: Validate deployment health
      run: |
        ./scripts/validate-production-health.sh
        
    - name: Run production smoke tests
      run: |
        ./scripts/smoke-tests-production.sh
```

### Database Management & Backup Strategy

**Backup Strategy:**
```bash
#!/bin/bash
# scripts/backup-database.sh

set -e

BACKUP_BUCKET="s3://schelling-backups"
DATE=$(date +%Y%m%d_%H%M%S)
ENVIRONMENT=${ENVIRONMENT:-production}

# Full database backup
pg_dump $DATABASE_URL | gzip > "backup_${ENVIRONMENT}_${DATE}.sql.gz"

# Upload to S3 with lifecycle management
aws s3 cp "backup_${ENVIRONMENT}_${DATE}.sql.gz" \
  "${BACKUP_BUCKET}/${ENVIRONMENT}/full/backup_${DATE}.sql.gz" \
  --storage-class STANDARD_IA

# Embedding-specific backup (for machine learning analysis)
pg_dump $DATABASE_URL \
  --table=users --table=candidates --table=feedback \
  --data-only | gzip > "embeddings_${ENVIRONMENT}_${DATE}.sql.gz"

# Upload embeddings backup
aws s3 cp "embeddings_${ENVIRONMENT}_${DATE}.sql.gz" \
  "${BACKUP_BUCKET}/${ENVIRONMENT}/embeddings/embeddings_${DATE}.sql.gz"

# Cleanup local files
rm "backup_${ENVIRONMENT}_${DATE}.sql.gz"
rm "embeddings_${ENVIRONMENT}_${DATE}.sql.gz"

echo "Backup completed: backup_${DATE}"

# Backup lifecycle:
# - Daily backups retained for 30 days
# - Weekly backups retained for 1 year  
# - Monthly backups retained for 7 years
# - Embedding backups retained indefinitely for ML research
```

**Migration Management:**
```typescript
// Migration framework with rollback capability
class MigrationManager {
  async runMigration(migrationId: string, dryRun: boolean = false): Promise<MigrationResult> {
    const migration = await this.loadMigration(migrationId);
    
    if (dryRun) {
      return this.validateMigration(migration);
    }
    
    // Create checkpoint before migration
    const checkpointId = await this.createCheckpoint();
    
    try {
      // Lock for exclusive migration access
      await this.acquireMigrationLock();
      
      // Execute migration within transaction
      const result = await this.executeMigration(migration);
      
      // Validate migration success
      await this.validateMigrationComplete(migration);
      
      return { success: true, checkpointId, result };
      
    } catch (error) {
      // Auto-rollback on failure
      await this.rollbackToCheckpoint(checkpointId);
      throw new MigrationError(`Migration ${migrationId} failed: ${error.message}`, { checkpointId });
      
    } finally {
      await this.releaseMigrationLock();
    }
  }
}
```

### Monitoring & Observability

**Metrics Dashboard (Prometheus + Grafana):**
```yaml
# Key metrics to track
schelling_metrics:
  # Request metrics
  - http_requests_total (counter)
  - http_request_duration_seconds (histogram)
  - http_requests_in_flight (gauge)
  
  # Business metrics
  - registrations_total (counter) 
  - searches_total (counter)
  - matches_created_total (counter)
  - connections_established_total (counter)
  - messages_sent_total (counter)
  - disputes_filed_total (counter)
  
  # System metrics
  - database_connections_active (gauge)
  - redis_cache_hit_rate (gauge)
  - embedding_similarity_computation_seconds (histogram)
  - background_job_queue_depth (gauge)
  - background_job_processing_seconds (histogram)
  
  # Quality metrics  
  - reputation_score_distribution (histogram)
  - feedback_quality_score_distribution (histogram)
  - score_consistency_violations_total (counter)
  - rate_limit_hits_total (counter)
```

**Alerting Rules:**
```yaml
# alerts.yml
groups:
- name: schelling_alerts
  rules:
  # System health
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
    for: 2m
    annotations:
      summary: "High error rate detected"
      
  - alert: DatabaseConnectionPoolExhausted  
    expr: database_connections_active / database_connections_max > 0.9
    for: 1m
    annotations:
      summary: "Database connection pool near capacity"
  
  # Business metrics
  - alert: SearchLatencyHigh
    expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{endpoint="/schelling/search"}[5m])) > 0.4
    for: 2m
    annotations:
      summary: "Search p99 latency above 400ms"
      
  - alert: RegistrationRateAnomalous
    expr: rate(registrations_total[1h]) > 100 OR rate(registrations_total[1h]) < 0.1  
    for: 10m
    annotations:
      summary: "Registration rate outside normal bounds"
  
  # Data quality
  - alert: ScoreConsistencyViolations
    expr: rate(score_consistency_violations_total[15m]) > 0
    for: 0m # Immediate alert
    annotations:
      summary: "Bidirectional score consistency violations detected"
```

### Feature Flag Management

```typescript
// Feature flag system for phased rollout
interface FeatureFlag {
  name: string;
  enabled: boolean;
  rollout_percentage: number;
  user_whitelist?: string[];
  cluster_restrictions?: string[];
  rollback_switch: boolean;
}

class FeatureFlagManager {
  private flags = new Map<string, FeatureFlag>();
  
  constructor() {
    this.initializeFlags();
  }
  
  private initializeFlags() {
    // Phase rollout flags
    this.setFlag('bidirectional_scoring', { 
      enabled: true, 
      rollout_percentage: 100,
      rollback_switch: false 
    });
    
    this.setFlag('message_relay', { 
      enabled: true, 
      rollout_percentage: 50, // Gradual rollout
      rollback_switch: false 
    });
    
    this.setFlag('jury_system', { 
      enabled: false, 
      rollout_percentage: 0, // Not ready yet
      rollback_switch: false 
    });
    
    this.setFlag('structured_attributes', {
      enabled: true,
      rollout_percentage: 25, // A/B test
      cluster_restrictions: ['talent', 'marketplace']
    });
  }
  
  isEnabled(flagName: string, userToken?: string, clusterId?: string): boolean {
    const flag = this.flags.get(flagName);
    if (!flag) return false;
    
    // Rollback switch overrides everything
    if (flag.rollback_switch) return false;
    
    // Not enabled at all
    if (!flag.enabled) return false;
    
    // Cluster restrictions
    if (flag.cluster_restrictions && clusterId && !flag.cluster_restrictions.includes(clusterId)) {
      return false;
    }
    
    // User whitelist
    if (flag.user_whitelist && userToken && flag.user_whitelist.includes(userToken)) {
      return true;
    }
    
    // Percentage rollout (deterministic based on user token)
    if (userToken) {
      const hash = crypto.createHash('md5').update(flagName + userToken).digest('hex');
      const percentage = parseInt(hash.substring(0, 8), 16) / 0xffffffff * 100;
      return percentage < flag.rollout_percentage;
    }
    
    return Math.random() * 100 < flag.rollout_percentage;
  }
}

// Usage in handlers
async function handleSearch(request: SearchRequest): Promise<SearchResponse> {
  const useBidirectionalScoring = featureFlags.isEnabled('bidirectional_scoring', request.user_token);
  
  if (useBidirectionalScoring) {
    return computeBidirectionalSearch(request);
  } else {
    return computeLegacySearch(request); // Fallback
  }
}
```

### Security & Compliance

**Security Checklist:**
- [ ] HTTPS enforced in production (TLS 1.3 minimum)
- [ ] Database connections encrypted (sslmode=require)
- [ ] API rate limiting with Redis backend
- [ ] Input validation and sanitization on all endpoints
- [ ] SQL injection prevention (parameterized queries only)
- [ ] CORS properly configured for allowed origins
- [ ] Secrets management via Kubernetes secrets / AWS Secrets Manager
- [ ] Container security scanning (Snyk, Trivy)
- [ ] Regular dependency updates and vulnerability scans
- [ ] GDPR compliance for user data handling
- [ ] Data anonymization for deleted users
- [ ] Audit logging for all sensitive operations

**Health Check Endpoints:**
```typescript
// Comprehensive health checks
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.VERSION,
    checks: {
      database: await checkDatabaseHealth(),
      redis: await checkRedisHealth(),
      background_jobs: await checkBackgroundJobHealth(),
      feature_flags: await checkFeatureFlagHealth()
    }
  };
  
  const allHealthy = Object.values(health.checks).every(check => check.status === 'healthy');
  const status = allHealthy ? 200 : 503;
  
  res.status(status).json(health);
});

app.get('/health/live', (req, res) => {
  // Simple liveness check for Kubernetes
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (req, res) => {
  // Readiness check - can serve traffic
  const ready = await checkReadiness(); // Database connection, Redis connection
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
```

### Performance Tuning & Scaling

**Database Optimization:**
- Connection pooling: 10 connections per API instance
- Query optimization with EXPLAIN ANALYZE on all search queries
- Composite indexes for common search patterns
- Partitioning for large tables (candidates, messages, reputation_events)
- pgvector extension for embedding similarity (HNSW indexing)
- Read replicas for analytics and reporting queries

**Caching Strategy:**
- Redis cluster for session management and rate limiting
- Application-level caching for search results (5-minute TTL)
- CDN caching for static assets and API documentation
- Embedding similarity caching for frequent pair lookups

**Horizontal Scaling Plan:**
- Stateless API design enables easy horizontal scaling
- Database read replicas for read-heavy workloads
- Background job processing via distributed queue (Bull/Redis)
- Load balancing with session affinity for WebSocket connections (future)

**Expected Data Volumes:**
- 1K users: Single instance, SQLite acceptable
- 10K users: PostgreSQL, 2-4 API instances, Redis cluster
- 100K users: Database sharding, 10+ API instances, dedicated analytics DB
- 1M users: Microservices architecture, event streaming, ML pipeline

---

## CHANGELOG - Implementation Plan Hardening Pass (2026-02-18)

This comprehensive enhancement addresses all requirements from the hardening mission:

### 1. Technical Depth Added
- **Exact SQL schemas** with complete CREATE TABLE statements, indexes, constraints, foreign keys, and performance optimizations for all 5 migrations
- **Complete TypeScript interfaces** for all data types: UserRecord, CandidateRecord, DeclineRecord, BackgroundJob, API request/response types with full field specifications
- **Exact algorithm pseudocode** with mathematical formulas for cosine similarity, bidirectional scoring, reputation computation (5-factor), time decay, consistency scoring (Pearson correlation), staleness penalties
- **Comprehensive database indexing** strategy with composite indexes for search performance, covering indexes, and query optimization
- **Connection pooling** configuration with acquisition timeouts, retry logic, and resource limits
- **Detailed caching strategy** with Redis-based search result caching, score caching, intelligent invalidation, and performance targets

### 2. Best Practices Implementation  
- **Structured error handling patterns** with transaction rollbacks, detailed validation, idempotency guarantees using request fingerprinting
- **Database transaction boundaries** with SERIALIZABLE isolation for critical operations, deadlock prevention, and optimistic locking
- **Comprehensive input validation** with embedding dimension checks, range validation, L2 norm requirements, sanitization
- **Structured logging format** with searchable context, operation tracking, performance metrics, error correlation
- **Complete testing strategy** with unit tests (Jest), integration tests (Supertest), load tests (Artillery), migration tests, mathematical property validation
- **Zero-downtime migration procedures** with backup creation, verification steps, rollback procedures for each phase
- **API versioning strategy** with feature flags, backward compatibility, graceful degradation
- **Rate limiting per endpoint** with specific limits per spec §16.3 (register: 5/day, search: 10/hr, message: 100/hr)

### 3. Robustness Enhancements
- **Concurrency handling** with race condition prevention using UPSERT semantics, optimistic locking for feedback submissions, deadlock detection
- **Data integrity** with mathematical invariant validation, bidirectional score consistency checks, orphan prevention, cascade delete handling  
- **Performance targets** with specific p50/p99 latency requirements: search p50 <150ms, registration p50 <200ms, score computation <5ms
- **Embedding storage optimization** with pgvector extension path for production, HNSW indexing for similarity search scaling
- **Background job design** for async score recomputation, reputation updates, collaborative filtering, stale profile cleanup
- **Graceful degradation** with fallback scoring when collaborative filtering has insufficient data, neutral scores for <5 reputation events

### 4. User Journey Findings Integration
- **Talent cluster symmetric roles fix** with peer role assignment for co-founder intents, configurable role override based on intent patterns
- **Multi-party coordination limitations** documented with current constraints and future extension architecture notes  
- **Categorical/conjunctive filtering** with structured_attributes field supporting languages, licenses, locations, specializations for exact matching requirements

### 5. Deployment & Operations
- **Complete environment setup** (dev/staging/prod) with Docker Compose, Kubernetes configurations, resource limits
- **Full CI/CD pipeline** with automated testing, security scanning, blue-green deployments, smoke tests
- **Database backup strategy** with S3 lifecycle management, embedding-specific backups, restoration procedures
- **Comprehensive monitoring** with Prometheus metrics, Grafana dashboards, alerting rules for system and business metrics
- **Feature flag system** for phased rollouts with percentage-based rollouts, user whitelisting, cluster restrictions, emergency rollback switches

The enhanced implementation plan is now production-ready with explicit guidance for database schema, algorithms, error handling, testing, deployment, and operations that a senior engineer can execute with minimal questions.

---

---

## Phase 16: Pre-Commitment Agent Dialogue (`schelling.inquire`)

**Complexity:** M
**Estimated time:** 2–3 days
**Dependencies:** Phase 1 (schema), Phase 2 (bidirectional scoring for stage checks)

### What's Being Built

Structured Q&A between agents at the EVALUATED stage. The server relays questions/answers, stores history, enforces rate limits (5 questions per counterparty per 24h). Cluster configs can define suggested question categories.

### DB Schema Changes

```sql
-- Migration: Add inquiries table
CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  asker_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  question TEXT NOT NULL,
  category TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  asked_at TEXT NOT NULL DEFAULT (datetime('now')),
  answer TEXT,
  confidence REAL,
  source TEXT CHECK (source IN ('agent_knowledge', 'human_confirmed')),
  answered_at TEXT,
  expired INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_inquiries_candidate ON inquiries(candidate_id, asked_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_asker ON inquiries(asker_token, asked_at);
```

### Files Modified

| File | Change |
|---|---|
| `src/handlers/inquire.ts` | **NEW.** Handle ask/answer/list actions. Validate stage ≥ EVALUATED. Enforce 5-question-per-counterparty-per-24h rate limit. Create `new_inquiry` pending actions. Mark questions as expired after 7 days (background job). |
| `src/core/funnel.ts` | No changes — inquire doesn't advance stages. |
| `src/handlers/pending.ts` | Add `new_inquiry` to pending action types. |
| `src/handlers/export-data.ts` | Include inquiries in data export. |
| `src/handlers/delete-account.ts` | Add inquiries to deletion cascade. |
| `src/transports/mcp.ts` | Add `schelling.inquire` tool with ask/answer/list schemas. |
| `src/transports/rest.ts` | Add `POST /schelling/inquire` and `POST /schelling/inquiries` (list alias) endpoints per spec §13.3. |
| `src/verticals/types.ts` | Add `suggested_inquiry_categories` to cluster config type. |

### Handler Signatures

```typescript
// src/handlers/inquire.ts
export async function handleInquire(input: {
  user_token: string;
  candidate_id: string;
  action: "ask" | "answer" | "list";
  // ask fields
  question?: string;
  category?: string;
  required?: boolean;
  // answer fields
  inquiry_id?: string;
  answer?: string;
  confidence?: number;
  source?: "agent_knowledge" | "human_confirmed";
  idempotency_key?: string;
}): Promise<InquireAskResponse | InquireAnswerResponse | InquireListResponse>;
```

### Test Plan

- Ask a question at EVALUATED stage → success, `new_inquiry` pending action created for counterparty
- Ask a question at DISCOVERED stage → `STAGE_VIOLATION`
- Answer a question → success, inquiry updated with answer
- Answer already-answered question → `ALREADY_ANSWERED`
- Ask 5 questions to same counterparty in 24h → all succeed
- Ask 6th question to same counterparty → `RATE_LIMITED`
- Ask 5 questions to different counterparty → succeeds (per-counterparty limit)
- List inquiries → returns Q&A history in reverse chronological order
- Question > 2,000 chars → `QUESTION_TOO_LONG`
- Inquiry expires after 7 days → marked as expired in list response
- Delete account → inquiries deleted
- Export data → inquiries included

---

## Phase 17: Push-Based Discovery (`schelling.subscribe`)

**Complexity:** L
**Estimated time:** 3–4 days
**Dependencies:** Phase 1 (schema), Phase 2 (scoring for notification evaluation)

### What's Being Built

Standing query subscriptions with intent embedding, hard filters, capability filters, and similarity thresholds. Server evaluates new registrations against active subscriptions. Notifications via pending actions (poll-based, not push). Max 10 active subscriptions, configurable TTL (default 30 days), max_notifications_per_day.

### DB Schema Changes

```sql
-- Migration: Add subscriptions and notifications tables
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  intent_embedding TEXT NOT NULL, -- JSON array of 16 floats
  hard_filters TEXT, -- JSON object
  capability_filters TEXT, -- JSON array of strings
  threshold REAL NOT NULL,
  max_notifications_per_day INTEGER NOT NULL DEFAULT 10,
  ttl_days INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  notifications_today INTEGER NOT NULL DEFAULT 0,
  last_notification_date TEXT -- date string YYYY-MM-DD for daily counter reset
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_token, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions(status, expires_at);

CREATE TABLE IF NOT EXISTS subscription_notifications (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  matched_user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  combined_score REAL NOT NULL,
  intent_similarity REAL NOT NULL,
  matched_at TEXT NOT NULL DEFAULT (datetime('now')),
  read INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sub_notifications_sub ON subscription_notifications(subscription_id, matched_at DESC);
```

### Files Modified

| File | Change |
|---|---|
| `src/handlers/subscribe.ts` | **NEW.** Create subscription, validate intent_embedding, enforce max 10 active subscriptions per user. Compute expires_at from ttl_days. |
| `src/handlers/unsubscribe.ts` | **NEW.** Cancel subscription by setting status to `cancelled`. Idempotent. |
| `src/handlers/notifications.ts` | **NEW.** Retrieve subscription notifications (replaces `schelling.notifications` in §21). |
| `src/handlers/register.ts` | **MODIFY.** After successful registration, evaluate new user against all active subscriptions. For each match exceeding threshold: create notification record + `subscription_match` pending action. |
| `src/handlers/pending.ts` | Add `subscription_match` to pending action types. |
| `src/handlers/export-data.ts` | Include subscriptions and notifications in data export. |
| `src/handlers/delete-account.ts` | Add subscriptions and notifications to deletion cascade. |
| `src/core/background-jobs.ts` | Add `subscription_expiry` job type: periodic sweep to expire subscriptions past TTL. Reset daily notification counters. |
| `src/transports/mcp.ts` | Add `schelling.subscribe`, `schelling.unsubscribe`, `schelling.notifications` tools. |
| `src/transports/rest.ts` | Add 3 new POST endpoints. |

### Handler Signatures

```typescript
// src/handlers/subscribe.ts
export async function handleSubscribe(input: {
  user_token: string;
  intent_embedding: number[];
  hard_filters?: Record<string, string | string[]>;
  capability_filters?: string[];
  threshold: number;
  max_notifications_per_day?: number;
  ttl_days?: number;
  idempotency_key?: string;
}): Promise<SubscribeResponse>;

// src/handlers/unsubscribe.ts
export async function handleUnsubscribe(input: {
  user_token: string;
  subscription_id: string;
}): Promise<UnsubscribeResponse>;

// src/handlers/notifications.ts
export async function handleNotifications(input: {
  user_token: string;
  subscription_id?: string;
  since?: string;
  limit?: number;
}): Promise<NotificationsResponse>;
```

### Test Plan

- Create subscription with valid params → success, subscription_id returned
- Create 10 subscriptions → all succeed
- Create 11th → `MAX_SUBSCRIPTIONS`
- New user registers matching subscription → notification created, pending action appears
- New user registers below threshold → no notification
- max_notifications_per_day enforced → excess matches silently dropped
- Subscription expires after TTL → status changes to `expired`, no more notifications
- Unsubscribe → immediate cancellation, no new notifications
- Unsubscribe already-cancelled → idempotent success
- Notifications endpoint → returns matches with scores
- Delete account → subscriptions and notifications deleted
- hard_filters on subscription → only matching new registrations trigger
- capability_filters on subscription → only matching capabilities trigger

---

## Phase 18: Agent Capabilities

**Complexity:** M
**Estimated time:** 2 days
**Dependencies:** Phase 1 (schema), Phase 15 (structured attributes pattern)

### What's Being Built

`agent_capabilities` field on registration and update. `capability_filters` on search and subscribe. Visible at stage 1 (DISCOVERED). Prefix matching support (e.g., `"speak_language"` matches `"speak_language:zh"`).

### DB Schema Changes

```sql
-- Migration: Add agent capabilities table (normalized for filtering)
CREATE TABLE IF NOT EXISTS agent_capabilities (
  user_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  parameters TEXT, -- JSON object
  confidence REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (user_token, capability)
);

CREATE INDEX IF NOT EXISTS idx_agent_caps_capability ON agent_capabilities(capability);

-- Also add agent_capabilities JSON column to users table for full storage
ALTER TABLE users ADD COLUMN agent_capabilities TEXT; -- JSON array of capability objects
```

### Files Modified

| File | Change |
|---|---|
| `src/handlers/register.ts` | Accept `agent_capabilities` array. Validate: max 50 capabilities per spec §5.4 (NOTE: §21.3.2 says 20 — use 50 as §5.4 is authoritative), snake_case identifiers 1-100 chars, confidence in [0,1], parameters max 1KB. Store in users.agent_capabilities (JSON) and normalized agent_capabilities table. |
| `src/handlers/update.ts` | Accept `agent_capabilities`. Full replacement (not merge). Delete old capabilities rows, insert new ones. |
| `src/handlers/search.ts` | Accept `capability_filters` array. For each filter string, check candidate has matching capability (exact match or prefix match with `:` separator). Conjunctive: ALL filters must match. Return `agent_capabilities` in candidate results. |
| `src/handlers/subscribe.ts` | Accept `capability_filters`. Store in subscription. Apply during new-registration evaluation. |
| `src/handlers/export-data.ts` | Include agent_capabilities in export. |
| `src/handlers/delete-account.ts` | Add agent_capabilities to deletion cascade. |
| `src/transports/mcp.ts` | Update register, update, search, subscribe tool schemas. |
| `src/transports/rest.ts` | Update accordingly. |

### Handler Signatures

```typescript
// Capability validation (shared utility)
export function validateCapabilities(caps: AgentCapability[]): ValidationResult;

export interface AgentCapability {
  capability: string; // snake_case, 1-100 chars
  parameters?: Record<string, any>; // max 1KB serialized
  confidence: number; // [0, 1]
}

// Capability filter matching
export function matchesCapabilityFilters(
  candidateCaps: AgentCapability[],
  filters: string[]
): boolean;
```

### Test Plan

- Register with agent_capabilities → stored correctly, returned in response
- Search with `capability_filters: ["can_schedule_meetings"]` → only matching candidates returned
- Prefix matching: filter `"speak_language"` matches capability `"speak_language:zh"` → candidate included
- Conjunctive: `["cap_a", "cap_b"]` → candidate must have both
- Candidate with no capabilities → excluded by any capability_filter
- Update agent_capabilities → replaces entire list
- Capabilities visible at stage 1 in search results
- Max 50 capabilities → 51st rejected with `INVALID_INPUT`
- Subscribe with capability_filters → applied to new registration evaluation

---

## Phase 19: Structured Agreements (`schelling.contract`)

**Complexity:** L
**Estimated time:** 3–4 days
**Dependencies:** Phase 1 (schema), Phase 2 (scoring/stages), Phase 9 (reputation integration)

### What's Being Built

Contract lifecycle: propose → accept/reject/counter → active → complete/terminate/expire. Amendment proposals via `schelling.contract_update`. Reputation integration: completed contracts = positive signal, terminated = negative, expired = minor negative.

### DB Schema Changes

```sql
-- Migration: Add contracts and amendments tables
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  proposer_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  responder_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('match', 'service', 'task', 'custom')),
  terms TEXT NOT NULL, -- JSON object
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed', 'counter_proposed', 'accepted', 'active', 
    'completed', 'expired', 'terminated', 'rejected'
  )),
  version INTEGER NOT NULL DEFAULT 1,
  proposed_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  completed_at TEXT,
  terminated_at TEXT,
  terminated_by TEXT,
  termination_reason TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contracts_candidate ON contracts(candidate_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_proposer ON contracts(proposer_token, status);
CREATE INDEX IF NOT EXISTS idx_contracts_responder ON contracts(responder_token, status);
CREATE INDEX IF NOT EXISTS idx_contracts_expiry ON contracts(status, expires_at);

CREATE TABLE IF NOT EXISTS contract_amendments (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  proposer_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  updated_terms TEXT NOT NULL, -- JSON object
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
  proposed_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_amendments_contract ON contract_amendments(contract_id, status);
```

### Files Modified

| File | Change |
|---|---|
| `src/handlers/contract.ts` | **NEW.** Handle propose/accept/reject/counter/complete/terminate/list actions. Validate stage ≥ COMMITTED. Enforce max 5 active contracts per candidate pair. Create `new_contract` pending actions. |
| `src/handlers/contract-update.ts` | **NEW.** Handle amendment proposals. Validate contract is active. Rate limit: 5 amendments per contract per 24h. |
| `src/core/reputation.ts` | **MODIFY.** Add reputation events for contract lifecycle: completed (+positive), terminated (-0.5 negative), expired (-0.25 negative). Tag events with `event_source: "contract"`. |
| `src/handlers/pending.ts` | Add `new_contract`, `contract_amendment` to pending action types. |
| `src/handlers/export-data.ts` | Include contracts and amendments in export. |
| `src/handlers/delete-account.ts` | Anonymize contracts (preserve with `DELETED_USER` sentinel for counterparty's history). Delete amendments. |
| `src/core/background-jobs.ts` | Add `contract_expiry` job: periodic sweep to expire proposals past deadline and active contracts past expires_at. |
| `src/transports/mcp.ts` | Add `schelling.contract`, `schelling.contract_update` tools. |
| `src/transports/rest.ts` | Add 2 new POST endpoints. |

### Handler Signatures

```typescript
// src/handlers/contract.ts
export async function handleContract(input: {
  user_token: string;
  candidate_id?: string;
  action: "propose" | "accept" | "reject" | "counter" | "complete" | "terminate" | "list";
  contract_id?: string;
  terms?: Record<string, any>;
  type?: "match" | "service" | "task" | "custom";
  expires_at?: string;
  reason?: string;
  status?: string; // for list filter
  idempotency_key?: string;
}): Promise<ContractResponse>;

// src/handlers/contract-update.ts
export async function handleContractUpdate(input: {
  user_token: string;
  contract_id: string;
  updated_terms: Record<string, any>;
  idempotency_key?: string;
}): Promise<ContractAmendmentResponse>;
```

### Test Plan

- Propose contract at COMMITTED stage → success, `new_contract` pending action
- Propose at EVALUATED stage → `STAGE_VIOLATION`
- Accept proposal → contract status → `active`
- Reject proposal → contract status → `rejected`
- Counter-propose → new version, `new_contract` pending action
- Accept own proposal → `CANNOT_RESPOND_OWN_PROPOSAL`
- Complete contract (both parties) → positive reputation events created
- Terminate contract → negative reputation event for terminator
- Mutual termination → no reputation impact
- Contract expires → minor negative signal for both
- Amendment proposal on active contract → `amendment_proposed`
- Amendment on non-active contract → `CONTRACT_NOT_ACTIVE`
- 6th amendment in 24h → `RATE_LIMITED`
- List contracts → filtered by candidate_id and/or status
- Delete account → contracts anonymized, amendments deleted
- Export → contracts and amendments included

---

## Phase 20: Lifecycle Events (`schelling.event`)

**Complexity:** M
**Estimated time:** 2–3 days
**Dependencies:** Phase 1 (schema), Phase 19 (contracts, for contract-associated events)

### What's Being Built

Lifecycle event emission, acknowledgment, and retrieval. Events on matches (CONNECTED+) or active contracts. Optional acknowledgment with configurable deadline. Reputation integration: completion events = positive signal, unacknowledged events = minor negative.

### DB Schema Changes

```sql
-- Migration: Add lifecycle events table
CREATE TABLE IF NOT EXISTS lifecycle_events (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  emitter_token TEXT NOT NULL REFERENCES users(user_token) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('milestone', 'update', 'completion', 'issue', 'custom')),
  data TEXT NOT NULL, -- JSON object, max 10KB
  requires_ack INTEGER NOT NULL DEFAULT 0,
  ack_deadline TEXT, -- ISO 8601 timestamp
  status TEXT NOT NULL DEFAULT 'emitted' CHECK (status IN ('emitted', 'pending_ack', 'acknowledged', 'ack_overdue')),
  emitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  ack_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_candidate ON lifecycle_events(candidate_id, emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_contract ON lifecycle_events(contract_id, emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_ack_deadline ON lifecycle_events(status, ack_deadline);
```

### Files Modified

| File | Change |
|---|---|
| `src/handlers/event.ts` | **NEW.** Handle emit/ack/list actions. Validate stage ≥ CONNECTED. If contract_id provided, validate contract is active. Create `new_event` pending actions. For requires_ack: create `event_ack_required` pending action with deadline. |
| `src/core/reputation.ts` | **MODIFY.** Add reputation events for: completion events (+positive, 0.5× weight), unacknowledged events (-minor, 0.1× weight). |
| `src/handlers/pending.ts` | Add `new_event`, `event_ack_required`, `ack_overdue` to pending action types. |
| `src/handlers/export-data.ts` | Include lifecycle events in export. |
| `src/handlers/delete-account.ts` | Delete lifecycle events. |
| `src/core/background-jobs.ts` | Add `event_ack_check` job: periodic sweep to mark events as `ack_overdue` when deadline passes. Create `ack_overdue` pending action for emitter. Create minor negative reputation event for non-acknowledger. |
| `src/transports/mcp.ts` | Add `schelling.event` tool with emit/ack/list schemas. |
| `src/transports/rest.ts` | Add `POST /schelling/event` and `POST /schelling/events` (list alias) endpoints per spec §13.3. |

### Handler Signatures

```typescript
// src/handlers/event.ts
export async function handleEvent(input: {
  user_token: string;
  action: "emit" | "ack" | "list";
  // emit fields
  candidate_id?: string;
  contract_id?: string;
  type?: "milestone" | "update" | "completion" | "issue" | "custom";
  data?: Record<string, any>;
  requires_ack?: boolean;
  ack_window_hours?: number;
  // ack fields
  event_id?: string;
  // list fields
  since?: string;
  limit?: number;
  idempotency_key?: string;
}): Promise<EventEmitResponse | EventAckResponse | EventListResponse>;
```

### Test Plan

- Emit event at CONNECTED stage → success, `new_event` pending action
- Emit at EVALUATED stage → `STAGE_VIOLATION`
- Emit with contract_id on active contract → success, event linked to contract
- Emit with contract_id on non-active contract → `CONTRACT_NOT_ACTIVE`
- Emit with requires_ack → `pending_ack` status, `event_ack_required` pending action with deadline
- Acknowledge event → `acknowledged` status
- Acknowledge after deadline → `ACK_DEADLINE_PASSED`
- Acknowledge already-acknowledged → `EVENT_ALREADY_ACKED`
- Unacknowledged event past deadline → background job marks `ack_overdue`, negative reputation signal
- Completion event → positive reputation signal (0.5× weight)
- List events → filtered by candidate_id, contract_id, type
- List events pagination → limit/since work correctly
- 51st event in an hour → `RATE_LIMITED`
- Event data > 10KB → `INVALID_INPUT`
- Delete account → events deleted
- Export → events included

---

*End of implementation plan.*
