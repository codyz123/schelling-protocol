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

// Legacy stage aliases for backward compatibility
export const LegacyStage = {
  NONE: 0,
  SEARCHED: 1,
  COMPARED: 2,
  PROFILED: 3,
  PROPOSED: 4,
  INTRODUCED: 5,
} as const;

export type Stage = (typeof Stage)[keyof typeof Stage];

// --- Error Types ---

export type ErrorCode =
  | "INVALID_INPUT"
  | "USER_NOT_FOUND"
  | "CANDIDATE_NOT_FOUND"
  | "STAGE_VIOLATION"
  | "MUTUAL_REQUIRED"
  | "UNAUTHORIZED"
  | "VERSION_MISMATCH"
  | "ALREADY_REPORTED"
  | "ALREADY_DECLINED"
  | "IDENTITY_NOT_PROVIDED";

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
  "openness",
  "intellectual_curiosity",
  "aesthetic_sensitivity",
  "conscientiousness",
  "self_discipline",
  "extraversion",
  "social_energy",
  "assertiveness",
  "agreeableness",
  "emotional_stability",
  // Values (10-19)
  "autonomy",
  "tradition",
  "achievement",
  "benevolence",
  "universalism",
  "security",
  "stimulation",
  "hedonism",
  "power",
  "conformity",
  // Aesthetic (20-27)
  "minimalism",
  "nature_affinity",
  "urban_preference",
  "visual",
  "auditory",
  "tactile",
  "symmetry",
  "novelty_seeking",
  // Intellectual (28-35)
  "systematic",
  "abstract",
  "verbal",
  "depth_focused",
  "theoretical",
  "analytical",
  "creative",
  "critical",
  // Social (36-43)
  "introversion",
  "depth_preference",
  "leadership",
  "empathy",
  "humor",
  "conflict_tolerance",
  "formality",
  "spontaneity",
  // Communication (44-49)
  "directness",
  "verbosity",
  "emotional_expression",
  "listener_vs_talker",
  "written_preference",
  "debate_enjoyment",
] as const;

export const DIMENSION_COUNT = 50;

export const DIMENSION_GROUPS: Record<string, { start: number; end: number }> = {
  personality: { start: 0, end: 10 },
  values: { start: 10, end: 20 },
  aesthetic: { start: 20, end: 28 },
  intellectual: { start: 28, end: 36 },
  social: { start: 36, end: 44 },
  communication: { start: 44, end: 50 },
};

export const POLE_LABELS: Record<string, [string, string]> = {
  // Personality
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
  // Values
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
  // Aesthetic
  minimalism: ["maximalist", "minimalist"],
  nature_affinity: ["urban-oriented", "nature-oriented"],
  urban_preference: ["rural preference", "urban preference"],
  visual: ["visually indifferent", "visually oriented"],
  auditory: ["auditorily indifferent", "auditorily oriented"],
  tactile: ["tactilely indifferent", "tactilely oriented"],
  symmetry: ["asymmetry-tolerant", "symmetry-seeking"],
  novelty_seeking: ["familiarity-seeking", "novelty-seeking"],
  // Intellectual
  systematic: ["intuitive thinker", "systematic thinker"],
  abstract: ["concrete thinker", "abstract thinker"],
  verbal: ["non-verbal processor", "verbal processor"],
  depth_focused: ["breadth-focused", "depth-focused"],
  theoretical: ["applied thinker", "theoretical thinker"],
  analytical: ["holistic thinker", "analytical thinker"],
  creative: ["conventional thinker", "creative thinker"],
  critical: ["accepting thinker", "critical thinker"],
  // Social
  introversion: ["extraverted", "introverted"],
  depth_preference: ["breadth in relationships", "depth in relationships"],
  leadership: ["follower", "leader"],
  empathy: ["low empathy", "high empathy"],
  humor: ["serious", "humorous"],
  conflict_tolerance: ["conflict-avoidant", "conflict-tolerant"],
  formality: ["casual", "formal"],
  spontaneity: ["planner", "spontaneous"],
  // Communication
  directness: ["indirect communicator", "direct communicator"],
  verbosity: ["concise", "verbose"],
  emotional_expression: ["emotionally reserved", "emotionally expressive"],
  listener_vs_talker: ["listener", "talker"],
  written_preference: ["verbal communicator", "written communicator"],
  debate_enjoyment: ["harmony-seeking", "debate-enjoying"],
};

// --- Vertical System Types ---

export interface VerticalDescriptor {
  vertical_id: string;
  version: string;
  display_name: string;
  description: string;
  roles: Record<string, VerticalRole>;
  symmetric: boolean; // true for matchmaking, false for marketplace
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
  anchors?: string; // reference to anchor definitions
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

// --- Database Record Interfaces ---

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
  embedding?: string; // JSON array
  profile_data: string; // JSON object
  identity_data?: string; // JSON object {name, contact}
  noise_epsilon?: number;
  agent_model?: string;
  embedding_method?: string;
  registered_at: string;
  expires_at: string;
  deal_breakers?: string; // JSON object
}

// Legacy UserRecord for backward compatibility
export interface UserRecord {
  user_token: string;
  protocol_version: string;
  agent_model: string | null;
  embedding_method: string | null;
  embedding: string; // JSON array
  city: string;
  age_range: string;
  intent: string; // JSON array
  interests: string | null; // JSON array
  values_text: string | null;
  description: string | null;
  seeking: string | null;
  identity: string | null; // JSON object
  created_at: string;
  updated_at: string;
}

export interface CandidateRecord {
  id: string;
  vertical_id: string;
  identity_a: string;
  identity_b: string;
  score: number;
  shared_categories: string; // JSON array
  stage_a: number;
  stage_b: number;
  created_at: string;
  updated_at: string;
  // Legacy fields for backward compatibility
  user_a_token?: string;
  user_b_token?: string;
}

export interface DeclineRecord {
  id: string;
  decliner_token: string;
  declined_token: string;
  stage_at_decline: number;
  reason: string | null;
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
  dimensions?: string; // JSON object
  notes?: string;
  created_at: string;
}

export interface DisputeRecord {
  id: string;
  candidate_id: string;
  filed_by: string;
  filed_against: string;
  vertical_id: string;
  stage_at_filing: number;
  reason: string;
  evidence?: string; // JSON object
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
  proposal: string; // JSON object
  status: "pending" | "accepted" | "countered" | "expired";
  created_at: string;
  expires_at: string;
}

export interface PendingActionRecord {
  id: string;
  identity_id: string;
  candidate_id: string;
  action_type: "evaluate" | "exchange" | "respond_proposal" | "review_commitment";
  created_at: string;
  consumed_at?: string;
}

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
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
] as const;
export const VALID_INTENTS = ["friends", "romance", "collaborators"] as const;
