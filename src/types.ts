import type { Database } from "bun:sqlite";

// --- Funnel Stages ---

export const Stage = {
  UNDISCOVERED: 0,
  DISCOVERED: 1,
  EVALUATED: 2,
  EXCHANGED: 3,
  COMMITTED: 4,
  CONNECTED: 5,
  COMPLETED: 6,
} as const;

export const LegacyStage = {
  NONE: 0,
  SEARCHED: 1,
  COMPARED: 2,
  PROFILED: 3,
  PROPOSED: 4,
  INTRODUCED: 5,
} as const;

export type Stage = (typeof Stage)[keyof typeof Stage];

// --- Error Types (§14 — all 44+ error codes) ---

export type ErrorCode =
  | "INVALID_INPUT"
  | "USER_NOT_FOUND"
  | "CANDIDATE_NOT_FOUND"
  | "STAGE_VIOLATION"
  | "STAGE_TOO_EARLY"
  | "MUTUAL_REQUIRED"
  | "UNAUTHORIZED"
  | "VERSION_MISMATCH"
  | "ALREADY_REPORTED"
  | "ALREADY_DECLINED"
  | "NO_ACTIVE_DECLINE"
  | "IDENTITY_NOT_PROVIDED"
  | "INVALID_INTENT_EMBEDDING"
  | "UNKNOWN_CLUSTER"
  | "INVALID_ROLE"
  | "MISSING_REQUIRED_FIELD"
  | "MODULE_FIELD_NOT_ACTIVE"
  | "IMMUTABLE_FIELD"
  | "NEGOTIATION_NOT_ENABLED"
  | "INVALID_STAGE"
  | "MAX_ROUNDS_EXCEEDED"
  | "NO_PROPOSAL_TO_ACCEPT"
  | "CANNOT_ACCEPT_OWN_PROPOSAL"
  | "PROPOSAL_NOT_PENDING"
  | "MISSING_PROPOSAL"
  | "INVALID_PROPOSAL_FIELD"
  | "NOT_PARTICIPANT"
  | "DUPLICATE_DISPUTE"
  | "DISPUTE_NOT_FOUND"
  | "NOT_JUROR"
  | "ALREADY_VOTED"
  | "VERDICT_DEADLINE_PASSED"
  | "NO_PENDING_REQUEST"
  | "ARTIFACTS_REQUIRED"
  | "INVALID_TYPE"
  | "CONFIRMATION_REQUIRED"
  | "MESSAGE_TOO_LONG"
  | "RELAY_DISABLED"
  | "RELAY_BLOCKED"
  | "ACTIVE_COMMITMENT"
  | "PERMANENT_DECLINE"
  | "RATE_LIMITED"
  | "USER_PAUSED"
  | "VERIFICATION_EXPIRED"
  | "JUROR_REPLACED"
  | "QUESTION_TOO_LONG"
  | "ANSWER_TOO_LONG"
  | "INQUIRY_NOT_FOUND"
  | "ALREADY_ANSWERED"
  | "MAX_SUBSCRIPTIONS"
  | "SUBSCRIPTION_NOT_FOUND"
  | "CONTRACT_NOT_FOUND"
  | "CONTRACT_EXPIRED"
  | "CONTRACT_NOT_PENDING"
  | "CONTRACT_NOT_ACTIVE"
  | "CANNOT_RESPOND_OWN_PROPOSAL"
  | "INVALID_CONTRACT_TYPE"
  | "INVALID_CONTRACT_ACTION"
  | "EVENT_NOT_FOUND"
  | "ACK_DEADLINE_PASSED"
  | "INVALID_EVENT_TYPE"
  | "EVENT_ALREADY_ACKED"
  | "CONTRACT_ALREADY_TERMINAL"
  | "INTERNAL_ERROR"
  // Legacy codes kept for backward compat
  | "INVALID_VERTICAL";

export interface ErrorResponse {
  code: ErrorCode;
  message: string;
}

// --- Handler Contract ---

export interface HandlerContext {
  db: Database;
}

export type HandlerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorResponse };

// --- Dimension Specification ---

export const DIMENSION_NAMES = [
  // Personality (0-9)
  "openness", "intellectual_curiosity", "aesthetic_sensitivity",
  "conscientiousness", "self_discipline", "extraversion",
  "social_energy", "assertiveness", "agreeableness", "emotional_stability",
  // Values (10-19)
  "autonomy", "tradition", "achievement", "benevolence", "universalism",
  "security", "stimulation", "hedonism", "power", "conformity",
  // Aesthetic (20-27)
  "minimalism", "nature_affinity", "urban_preference", "visual",
  "auditory", "tactile", "symmetry", "novelty_seeking",
  // Intellectual (28-35)
  "systematic", "abstract", "verbal", "depth_focused",
  "theoretical", "analytical", "creative", "critical",
  // Social (36-43)
  "introversion", "depth_preference", "leadership", "empathy",
  "humor", "conflict_tolerance", "formality", "spontaneity",
  // Communication (44-49)
  "directness", "verbosity", "emotional_expression",
  "listener_vs_talker", "written_preference", "debate_enjoyment",
] as const;

export const DIMENSION_COUNT = 50;
export const INTENT_DIMENSION_COUNT = 16;

export const DIMENSION_GROUPS: Record<string, { start: number; end: number }> = {
  personality: { start: 0, end: 10 },
  values: { start: 10, end: 20 },
  aesthetic: { start: 20, end: 28 },
  intellectual: { start: 28, end: 36 },
  social: { start: 36, end: 44 },
  communication: { start: 44, end: 50 },
};

export const INTENT_DIMENSION_NAMES = [
  "romantic_intent", "social_bonding", "professional_context", "material_exchange",
  "commitment_depth", "urgency", "symmetry_preference", "skill_relevance",
  "compatibility_weight", "trust_requirement", "privacy_sensitivity", "geographic_scope",
  "formality_level", "duration_expectation", "exclusivity", "scope_breadth",
] as const;

export const POLE_LABELS: Record<string, [string, string]> = {
  openness: ["routine-oriented", "novelty-seeking"],
  intellectual_curiosity: ["practically focused", "intellectually curious"],
  aesthetic_sensitivity: ["aesthetically indifferent", "aesthetically sensitive"],
  conscientiousness: ["flexible and spontaneous", "disciplined and organized"],
  self_discipline: ["relaxed about deadlines", "highly self-disciplined"],
  extraversion: ["introverted", "extraverted"],
  social_energy: ["drained by socializing", "energized by socializing"],
  assertiveness: ["deferential", "assertive"],
  agreeableness: ["challenging and direct", "warm and accommodating"],
  emotional_stability: ["emotionally reactive", "emotionally stable"],
  autonomy: ["prefers guidance and structure", "fiercely independent"],
  tradition: ["progressive and change-seeking", "tradition-oriented"],
  achievement: ["process-oriented", "achievement-driven"],
  benevolence: ["self-focused", "other-focused"],
  universalism: ["pragmatic and local-focused", "idealistic and globally-minded"],
  security: ["risk-tolerant", "security-seeking"],
  stimulation: ["calm and steady", "excitement-seeking"],
  hedonism: ["ascetic and restrained", "pleasure-seeking"],
  power: ["egalitarian", "status-seeking"],
  conformity: ["nonconformist", "rule-following"],
  minimalism: ["maximalist", "minimalist"],
  nature_affinity: ["urban-oriented", "nature-oriented"],
  urban_preference: ["rural preference", "urban preference"],
  visual: ["visually indifferent", "visually oriented"],
  auditory: ["auditorily indifferent", "auditorily oriented"],
  tactile: ["tactilely indifferent", "tactilely oriented"],
  symmetry: ["asymmetry-tolerant", "symmetry-seeking"],
  novelty_seeking: ["familiarity-seeking", "novelty-seeking"],
  systematic: ["intuitive thinker", "systematic thinker"],
  abstract: ["concrete thinker", "abstract thinker"],
  verbal: ["non-verbal processor", "verbal processor"],
  depth_focused: ["breadth-focused", "depth-focused"],
  theoretical: ["applied thinker", "theoretical thinker"],
  analytical: ["holistic thinker", "analytical thinker"],
  creative: ["conventional thinker", "creative thinker"],
  critical: ["accepting thinker", "critical thinker"],
  introversion: ["extraverted", "introverted"],
  depth_preference: ["breadth in relationships", "depth in relationships"],
  leadership: ["follower", "leader"],
  empathy: ["low empathy", "high empathy"],
  humor: ["serious", "humorous"],
  conflict_tolerance: ["conflict-avoidant", "conflict-tolerant"],
  formality: ["casual", "formal"],
  spontaneity: ["planner", "spontaneous"],
  directness: ["indirect communicator", "direct communicator"],
  verbosity: ["concise", "verbose"],
  emotional_expression: ["emotionally reserved", "emotionally expressive"],
  listener_vs_talker: ["listener", "talker"],
  written_preference: ["verbal communicator", "written communicator"],
  debate_enjoyment: ["harmony-seeking", "debate-enjoying"],
};

// --- Database Record Interfaces ---

export interface UserRecord {
  user_token: string;
  protocol_version: string;
  agent_model: string | null;
  embedding_method: string | null;
  embedding: string; // JSON array (50-dim)
  intent_embedding: string | null; // JSON array (16-dim)
  intents: string | null; // JSON array of strings
  intent_tags: string | null; // JSON object
  primary_cluster: string | null;
  cluster_affinities: string | null; // JSON object
  city: string | null;
  age_range: string | null;
  intent: string | null; // Legacy — JSON array
  interests: string | null;
  values_text: string | null;
  description: string | null;
  seeking: string | null;
  identity: string | null;
  vertical_id: string;
  deal_breakers: string | null;
  verification_level: "anonymous" | "verified" | "attested";
  phone_hash: string | null;
  agent_attestation: string | null;
  role: string | null;
  status: "active" | "paused" | "suspended" | "delisted";
  media_refs: string | null;
  marketplace_data: string | null;
  structured_attributes: string | null;
  reputation_score: number;
  interaction_count: number;
  last_registered_at: string;
  created_at: string;
  updated_at: string;
}

export interface CandidateRecord {
  id: string;
  user_a_token: string;
  user_b_token: string;
  vertical_id: string;
  score: number;
  shared_categories: string; // JSON array
  stage_a: number;
  stage_b: number;
  score_your_fit: number | null;
  score_their_fit: number | null;
  intent_similarity: number | null;
  combined_score: number | null;
  computed_at: string;
  algorithm_variant: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeclineRecord {
  id: string;
  decliner_token: string;
  declined_token: string;
  vertical_id: string;
  stage_at_decline: number;
  reason: string | null;
  expiry_at: string | null;
  reconsidered: number;
  reconsidered_at: string | null;
  feedback: string | null;
  repeat_count: number;
  created_at: string;
}

export interface OutcomeRecord {
  id: string;
  candidate_id: string;
  reporter_token: string;
  outcome: string;
  met_in_person: number;
  notes: string | null;
  created_at: string;
}

export interface ReputationEventRecord {
  id: string;
  identity_id: string;
  reporter_id: string;
  reporter_reputation: number;
  vertical_id: string;
  event_type: "outcome" | "dispute" | "completion" | "abandonment";
  rating?: "positive" | "neutral" | "negative";
  dimensions?: string;
  notes?: string;
  created_at: number;
}

export interface IdentityRecord {
  id: string;
  token: string;
  verification_level: "anonymous" | "verified" | "attested";
  phone_hash?: string;
  created_at: string;
  last_active_at: string;
}

export interface RegistrationRecord {
  id: string;
  identity_id: string;
  vertical_id: string;
  role?: string;
  embedding?: string;
  profile_data: string;
  identity_data?: string;
  noise_epsilon?: number;
  agent_model?: string;
  embedding_method?: string;
  registered_at: string;
  expires_at: string;
  deal_breakers?: string;
}

export interface AgentAttestation {
  model: string;
  method: string;
  interaction_hours: number;
  generated_at: string;
}

export interface ReputationScore {
  score: number;
  vertical_scores: Record<string, number>;
  breakdown: {
    outcome: number;
    completion: number;
    consistency: number;
    dispute: number;
    tenure: number;
  };
  interaction_count: number;
  verification_level: "anonymous" | "verified" | "attested";
  member_since: string;
}

export interface ReputationResponse {
  score: number;
  vertical_scores?: Record<string, number>;
  breakdown?: {
    outcome: number;
    completion: number;
    consistency: number;
    dispute: number;
    tenure: number;
  };
  interaction_count: number;
  verification_level: "anonymous" | "verified" | "attested";
  member_since: string;
}

export interface DisputeRecord {
  id: string;
  candidate_id: string;
  filed_by: string;
  filed_against: string;
  vertical_id: string;
  stage_at_filing: number;
  reason: string;
  evidence?: string;
  status: "open" | "resolved_for_filer" | "resolved_for_defendant" | "dismissed";
  resolved_at?: string;
  resolution_notes?: string;
  created_at: string;
}

export interface NegotiationRecord {
  id: string;
  candidate_id: string;
  from_identity: string;
  round: number;
  proposal: string;
  status: "pending" | "accepted" | "countered" | "expired";
  created_at: string;
  expires_at: string;
}

export interface PendingActionRecord {
  id: string;
  identity_id: string;
  candidate_id: string;
  action_type: "evaluate" | "exchange" | "respond_proposal" | "review_commitment" |
    "review_dispute" | "provide_verification" | "new_message" | "direct_request" |
    "jury_duty" | "profile_refresh" | "mutual_gate_expired";
  created_at: string;
  consumed_at?: string;
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

export interface FeedbackData {
  dimension_scores?: Record<string, number>;
  rejection_reason?: string;
  rejection_freeform?: string;
  what_i_wanted?: string;
  satisfaction?: "very_satisfied" | "satisfied" | "neutral" | "dissatisfied" | "very_dissatisfied";
  would_recommend?: boolean;
}

export interface BackgroundJob {
  id: string;
  job_type: "score_recompute" | "reputation_update" | "collaborative_filter" | "stale_cleanup";
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed";
  scheduled_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
}

// --- Rate Limiting ---

export const RATE_LIMITS: Record<string, { limit: number; window_seconds: number }> = {
  "schelling.register":   { limit: 5,   window_seconds: 86400 },  // per day
  "schelling.search":     { limit: 10,  window_seconds: 3600 },
  "schelling.evaluate":   { limit: 50,  window_seconds: 3600 },
  "schelling.exchange":   { limit: 20,  window_seconds: 3600 },
  "schelling.message":    { limit: 100, window_seconds: 3600 },
  "schelling.update":     { limit: 20,  window_seconds: 3600 },
  "schelling.commit":     { limit: 10,  window_seconds: 3600 },
  "schelling.feedback":   { limit: 50,  window_seconds: 3600 },
  "schelling.dispute":    { limit: 3,   window_seconds: 86400 },
  "schelling.reconsider": { limit: 10,  window_seconds: 86400 },
  "schelling.relay_block":{ limit: 20,  window_seconds: 3600 },
};

// --- Candidate Pair Helpers ---

export function orderTokens(
  tokenX: string,
  tokenY: string
): { a: string; b: string } {
  return tokenX < tokenY
    ? { a: tokenX, b: tokenY }
    : { a: tokenY, b: tokenX };
}

export function callerSide(
  userToken: string,
  candidate: CandidateRecord
): "a" | "b" {
  return userToken === candidate.user_a_token ? "a" : "b";
}

export function otherToken(
  userToken: string,
  candidate: CandidateRecord
): string {
  return userToken === candidate.user_a_token
    ? candidate.user_b_token
    : candidate.user_a_token;
}

// --- Protocol Constants ---

export const PROTOCOL_VERSION = "schelling-2.0";
export const VALID_AGE_RANGES = [
  "18-24", "25-34", "35-44", "45-54", "55-64", "65+",
] as const;
export const VALID_INTENTS = ["friends", "romance", "collaborators"] as const;

// --- Vertical System Types (kept for backward compatibility) ---

export interface VerticalDescriptor {
  vertical_id: string;
  version: string;
  display_name: string;
  description: string;
  roles: Record<string, VerticalRole>;
  symmetric: boolean;
  embedding_schema: EmbeddingSchema;
  funnel_config: FunnelConfig;
  negotiation?: NegotiationConfig;
  exclusive_commitment?: boolean;
}

export interface VerticalRole {
  data_schema: string;
  required_fields: string[];
  optional_fields?: string[];
}

export interface EmbeddingSchema {
  dimensions: number;
  groups: Record<string, { start: number; end: number }>;
  anchors?: string;
}

export interface FunnelConfig {
  discovery_fields: string[];
  evaluation_fields: string[];
  exchange_fields: string[];
  connection_fields: string[];
  mutual_gate_stage: string;
}

export interface NegotiationConfig {
  enabled: boolean;
  max_rounds: number;
  timeout_hours: number;
  proposal_schema: Record<string, string>;
}
