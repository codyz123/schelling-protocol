import type { Database } from "bun:sqlite";

// ─── Funnel Stages (v3) ─────────────────────────────────────────────
// v3 simplified: 4 stages instead of v2's 7

export const Stage = {
  UNDISCOVERED: 0,   // Not yet in a candidate pair
  DISCOVERED: 1,     // Aware of the other party (via search)
  INTERESTED: 2,     // Expressed interest
  COMMITTED: 3,      // Committed to proceeding
  CONNECTED: 4,      // Mutual commitment achieved (auto-elevated)
} as const;

export type Stage = (typeof Stage)[keyof typeof Stage];

// v2 stage aliases for backward compatibility mapping
export const V2Stage = {
  UNDISCOVERED: 0,
  DISCOVERED: 1,
  EVALUATED: 2,
  EXCHANGED: 3,
  COMMITTED: 4,
  CONNECTED: 5,
  COMPLETED: 6,
} as const;

// ─── Error Types ────────────────────────────────────────────────────

export type ErrorCode =
  // Core
  | "INVALID_INPUT"
  | "USER_NOT_FOUND"
  | "CANDIDATE_NOT_FOUND"
  | "STAGE_VIOLATION"
  | "MUTUAL_REQUIRED"
  | "UNAUTHORIZED"
  | "VERSION_MISMATCH"
  | "INTERNAL_ERROR"
  // Cluster
  | "UNKNOWN_CLUSTER"
  | "INVALID_CLUSTER_ID"
  | "INVALID_ROLE"
  // Registration
  | "INVALID_INTENT_EMBEDDING"
  | "ACTIVE_COMMITMENT"
  | "MAX_REGISTRATIONS"
  | "AGE_VERIFICATION_REQUIRED"
  // Funnel
  | "ALREADY_REPORTED"
  | "ALREADY_DECLINED"
  | "NO_ACTIVE_DECLINE"
  | "PERMANENT_DECLINE"
  | "USER_PAUSED"
  | "USER_SUSPENDED"
  | "GROUP_FULL"
  | "AUCTION_CLOSED"
  // Communication
  | "MESSAGE_TOO_LONG"
  | "RELAY_DISABLED"
  | "RELAY_BLOCKED"
  | "QUESTION_TOO_LONG"
  | "ANSWER_TOO_LONG"
  | "INQUIRY_NOT_FOUND"
  | "ALREADY_ANSWERED"
  // Subscriptions
  | "MAX_SUBSCRIPTIONS"
  | "SUBSCRIPTION_NOT_FOUND"
  // Contracts
  | "CONTRACT_NOT_FOUND"
  | "CONTRACT_EXPIRED"
  | "CONTRACT_NOT_PENDING"
  | "CONTRACT_NOT_ACTIVE"
  | "CONTRACT_ALREADY_TERMINAL"
  | "CANNOT_RESPOND_OWN_PROPOSAL"
  | "INVALID_CONTRACT_TYPE"
  | "INVALID_CONTRACT_ACTION"
  | "AMENDMENT_NOT_FOUND"
  | "MAX_ROUNDS_EXCEEDED"
  // Events
  | "EVENT_NOT_FOUND"
  | "INVALID_EVENT_TYPE"
  | "EVENT_ALREADY_ACKED"
  | "ACK_DEADLINE_PASSED"
  // Disputes
  | "DUPLICATE_DISPUTE"
  | "DISPUTE_NOT_FOUND"
  | "NOT_JUROR"
  | "ALREADY_VOTED"
  | "VERDICT_DEADLINE_PASSED"
  | "JUROR_REPLACED"
  // Verification
  | "VERIFICATION_EXPIRED"
  | "NO_PENDING_REQUEST"
  // Tools
  | "TOOL_NOT_FOUND"
  | "TOOL_ID_TAKEN"
  | "TOOL_ERROR"
  | "TOOL_TIMEOUT"
  | "TOOL_BILLING_REQUIRED"
  | "INVALID_ENDPOINT"
  | "TOOL_SCOPE_RESTRICTED"
  // Deliverables
  | "DELIVERY_NOT_FOUND"
  | "DELIVERY_EXPIRED"
  | "DELIVERABLE_TOO_LARGE"
  | "INVALID_DELIVERABLE_TYPE"
  | "ALREADY_RESPONDED"
  | "MILESTONE_NOT_FOUND"
  | "STORAGE_LIMIT_EXCEEDED"
  // Fast-path
  | "INCOMPATIBLE_CLUSTERS"
  | "PROGRESSIVE_DISCLOSURE_CONFLICT"
  // NL
  | "NL_PARSE_FAILED"
  | "FEATURE_NOT_SUPPORTED"
  // Privacy
  | "CONFIRMATION_REQUIRED"
  // Rate limiting
  | "RATE_LIMITED"
  // Admin
  | "UNAUTHORIZED_ADMIN"
  // Legacy (deprecated, kept for v2 compat)
  | "IDENTITY_NOT_PROVIDED";

export interface ErrorResponse {
  code: string;
  message: string;
}

// ─── Handler Contract ───────────────────────────────────────────────

export interface HandlerContext {
  db: Database;
}

export type HandlerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorResponse };

// ─── Trait & Preference Types ───────────────────────────────────────

export interface Trait {
  key: string;
  value: string | number | boolean | string[];
  value_type: "string" | "number" | "boolean" | "enum" | "array";
  visibility: Visibility;
  verification?: VerificationTier;
  display_name?: string;
  category?: string;
  enum_values?: string[];
}

export type Visibility =
  | "public"
  | "after_interest"
  | "after_commit"
  | "after_connect"
  | "private";

export type VerificationTier =
  | "unverified"
  | "self_verified"
  | "cross_verified"
  | "authority_verified";

export const VERIFICATION_TRUST: Record<VerificationTier, number> = {
  unverified: 0.0,
  self_verified: 0.3,
  cross_verified: 0.6,
  authority_verified: 1.0,
};

export type PreferenceOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "in" | "contains" | "exists" | "range"
  | "contains_any" | "regex" | "contains_all";

export interface Preference {
  trait_key: string;
  operator: PreferenceOperator;
  value: string | number | boolean | string[] | number[];
  weight: number;
  label?: string;
}

// ─── Funnel Mode ────────────────────────────────────────────────────

export type FunnelMode = "bilateral" | "broadcast" | "group" | "auction";

// ─── Capability ─────────────────────────────────────────────────────

export interface Capability {
  capability: string;
  parameters?: Record<string, unknown>;
  confidence?: number;
}

// ─── Agent Attestation ──────────────────────────────────────────────

export interface AgentAttestation {
  model: string;
  method: string;
  interaction_hours: number;
  generated_at: string;
}

// ─── Text Profile ───────────────────────────────────────────────────

export interface TextProfile {
  description?: string;
  seeking?: string;
  interests?: string[];
  values_text?: string;
}

// ─── Identity ───────────────────────────────────────────────────────

export interface Identity {
  name?: string;
  contact?: string;
  phone_hash?: string;
}

// ─── Database Record Interfaces ─────────────────────────────────────

export interface UserRecord {
  user_token: string;
  protocol_version: string;
  cluster_id: string;
  role: string | null;
  funnel_mode: string;
  group_size: number | null;
  auto_fill: number;
  group_deadline: string | null;
  intent_embedding: string | null;
  intents: string | null;
  personality_embedding: string | null;
  appearance_embedding: string | null;
  text_profile: string | null;
  identity: string | null;
  phone_hash: string | null;
  agent_model: string | null;
  agent_capabilities: string | null;
  agent_attestation: string | null;
  media_refs: string | null;
  auto_interest_opt_out: number;
  behavioral_inference_opt_out: number;
  status: "active" | "paused" | "delisted";
  created_at: string;
  updated_at: string;
}

export interface TraitRecord {
  id: string;
  user_token: string;
  key: string;
  value: string;       // JSON-encoded
  value_type: string;
  visibility: string;
  verification: string;
  display_name: string | null;
  category: string | null;
  enum_values: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreferenceRecord {
  id: string;
  user_token: string;
  trait_key: string;
  operator: string;
  value: string;       // JSON-encoded
  weight: number;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateRecord {
  id: string;
  user_a_token: string;
  user_b_token: string;
  cluster_id: string;
  funnel_mode: string;
  score: number;
  fit_a: number;
  fit_b: number;
  intent_similarity: number | null;
  stage_a: number;
  stage_b: number;
  created_at: string;
  updated_at: string;
}

export interface ClusterRecord {
  cluster_id: string;
  display_name: string | null;
  description: string | null;
  created_by: string | null;
  symmetric: number;
  exclusive_commitment: number;
  age_restricted: number;
  default_funnel_mode: string;
  max_negotiation_rounds: number;
  proposal_timeout_hours: number;
  population: number;
  phase: string;
  metadata: string | null;
  created_at: string;
  last_activity: string;
}

export interface ContractRecord {
  contract_id: string;
  candidate_id: string;
  proposed_by: string;
  type: string;
  terms: string;
  terms_schema_version: string | null;
  milestones: string | null;
  dispute_content_disclosure: number;
  safe_types: string | null;
  status: string;
  supersedes: string | null;
  round: number;
  proposed_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  expires_at: string;
}

export interface DeliverableRecord {
  delivery_id: string;
  contract_id: string;
  deliverer_token: string;
  milestone_id: string | null;
  type: string;
  content: string;
  content_type: string | null;
  filename: string | null;
  metadata: string | null;
  checksum: string | null;
  message: string | null;
  status: string;
  feedback: string | null;
  rating: number | null;
  delivered_at: string;
  responded_at: string | null;
  expires_at: string;
}

export interface InquiryRecord {
  id: string;
  candidate_id: string;
  from_token: string;
  question: string;
  category: string | null;
  required: number;
  answer: string | null;
  answer_confidence: number | null;
  answer_source: string | null;
  status: string;
  created_at: string;
  answered_at: string | null;
}

export interface DisputeRecord {
  id: string;
  candidate_id: string;
  filed_by: string;
  filed_against: string;
  cluster_id: string;
  stage_at_filing: number;
  reason: string;
  evidence: string | null;
  trait_claims: string | null;
  delivery_claims: string | null;
  status: string;
  jury_size: number | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
}

export interface DeclineRecord {
  id: string;
  decliner_token: string;
  declined_token: string;
  cluster_id: string;
  candidate_id: string | null;
  stage_at_decline: number;
  reason: string | null;
  feedback: string | null;
  permanent: number;
  expires_at: string | null;
  created_at: string;
}

export interface OutcomeRecord {
  id: string;
  candidate_id: string;
  reporter_token: string;
  outcome: string;
  feedback: string | null;
  created_at: string;
}

export interface SubscriptionRecord {
  subscription_id: string;
  user_token: string;
  cluster_filter: string | null;
  intent_embedding: string | null;
  threshold: number;
  trait_filters: string | null;
  capability_filters: string | null;
  mode_filter: string | null;
  max_notifications_per_day: number;
  notification_count: number;
  created_at: string;
  expires_at: string;
}

export interface EventRecord {
  event_id: string;
  candidate_id: string;
  contract_id: string | null;
  emitter_token: string;
  event_type: string;
  payload: string | null;
  requires_ack: number;
  ack_deadline: string | null;
  acked: number;
  acked_at: string | null;
  ack_response: string | null;
  emitted_at: string;
}

export interface MessageRecord {
  id: string;
  candidate_id: string;
  sender_token: string;
  content: string;
  sent_at: string;
}

export interface ToolRecord {
  tool_id: string;
  display_name: string;
  description: string;
  one_line_description: string;
  type: string;
  endpoint: string | null;
  input_schema: string;
  output_schema: string;
  owner_token: string | null;
  version: string;
  cluster_scope: string | null;
  pricing: string | null;
  health_check_endpoint: string | null;
  reputation: number;
  usage_count: number;
  status: string;
  registered_at: string;
}

export interface ReputationEventRecord {
  id: string;
  identity_id: string;
  reporter_id: string;
  reporter_reputation: number | null;
  cluster_id: string;
  event_type: string;
  rating?: string | null;
  dimensions?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface PendingActionRecord {
  id: string;
  user_token: string;
  candidate_id: string | null;
  action_type: string;
  details: string | null;
  created_at: string;
  consumed_at: string | null;
}

// ─── Candidate Pair Helpers ─────────────────────────────────────────

export function orderTokens(
  tokenX: string,
  tokenY: string,
): { a: string; b: string } {
  return tokenX < tokenY
    ? { a: tokenX, b: tokenY }
    : { a: tokenY, b: tokenX };
}

export function callerSide(
  userToken: string,
  candidate: CandidateRecord,
): "a" | "b" {
  return userToken === candidate.user_a_token ? "a" : "b";
}

export function otherToken(
  userToken: string,
  candidate: CandidateRecord,
): string {
  return userToken === candidate.user_a_token
    ? candidate.user_b_token
    : candidate.user_a_token;
}

// ─── Visibility Helpers ─────────────────────────────────────────────

const VISIBILITY_ORDER: Record<Visibility, number> = {
  public: 1,
  after_interest: 2,
  after_commit: 3,
  after_connect: 4,
  private: 5,
};

/** Returns the minimum mutual stage required to see a trait at the given visibility tier */
export function visibilityToMinStage(vis: Visibility): number {
  switch (vis) {
    case "public": return Stage.DISCOVERED;
    case "after_interest": return Stage.INTERESTED;
    case "after_commit": return Stage.COMMITTED;
    case "after_connect": return Stage.CONNECTED;
    case "private": return Infinity;
  }
}

/** Check if a trait with given visibility is visible to a party at the given mutual minimum stage */
export function isTraitVisible(visibility: Visibility, mutualMinStage: number): boolean {
  return mutualMinStage >= visibilityToMinStage(visibility);
}

// ─── Protocol Constants ─────────────────────────────────────────────

export const PROTOCOL_VERSION = "3.0";
export const SERVER_VERSION = "3.0.0";
export const SERVER_NAME = "Schelling Protocol Reference Server";

// Intent embedding spec
export const INTENT_EMBEDDING_DIM = 16;

// ─── Cluster ID Validation ──────────────────────────────────────────

const CLUSTER_ID_REGEX = /^[a-z0-9]+(\.[a-z0-9]+)*$/;
const RESERVED_PREFIXES = ["schelling.", "_system."];

export function isValidClusterId(clusterId: string): boolean {
  if (!clusterId || clusterId.length > 255) return false;
  if (!CLUSTER_ID_REGEX.test(clusterId)) return false;
  const segments = clusterId.split(".");
  if (segments.length > 5) return false;
  if (segments.some(s => s.length > 50 || s.length === 0)) return false;
  if (RESERVED_PREFIXES.some(p => clusterId.startsWith(p))) return false;
  return true;
}

// ─── Intent Embedding Validation ────────────────────────────────────

export function validateIntentEmbedding(embedding: number[]): string | null {
  if (!Array.isArray(embedding) || embedding.length !== INTENT_EMBEDDING_DIM) {
    return `Intent embedding must have exactly ${INTENT_EMBEDDING_DIM} dimensions`;
  }
  for (const v of embedding) {
    if (typeof v !== "number" || !isFinite(v)) return "All values must be finite numbers";
    if (v < -1.0 || v > 1.0) return "All values must be in [-1.0, 1.0]";
  }
  const l2 = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  if (l2 < 0.5) return "L2 norm must be >= 0.5";
  const significantDims = embedding.filter(v => Math.abs(v) > 0.1).length;
  if (significantDims < 3) return "At least 3 dimensions must have |value| > 0.1";
  return null;
}

// ─── Preference Evaluation ──────────────────────────────────────────

/**
 * Evaluate whether a candidate's trait value satisfies a preference.
 * Returns { pass: boolean, score: number } where score is 0-1.
 */
export function evaluatePreference(
  pref: { operator: string; value: unknown; weight: number },
  traitValue: unknown,
  traitMissing: boolean,
): { pass: boolean; score: number } {
  // Missing trait handling
  if (traitMissing || traitValue === null || traitValue === undefined) {
    if (pref.weight === 1.0) return { pass: false, score: 0 }; // Hard filter: exclude
    return { pass: true, score: 0 }; // Soft: skip (neutral)
  }

  const op = pref.operator;
  const target = pref.value;

  let pass = false;
  let score = 0;

  switch (op) {
    case "eq":
      pass = traitValue === target;
      score = pass ? 1.0 : 0.0;
      break;
    case "neq":
      pass = traitValue !== target;
      score = pass ? 1.0 : 0.0;
      break;
    case "gt":
      pass = (traitValue as number) > (target as number);
      score = pass ? Math.min(1.0, 0.5 + ((traitValue as number) - (target as number)) / (Math.abs(target as number) || 1) * 0.5) : 0.0;
      break;
    case "gte":
      pass = (traitValue as number) >= (target as number);
      score = pass ? Math.min(1.0, 0.5 + ((traitValue as number) - (target as number)) / (Math.abs(target as number) || 1) * 0.5) : 0.0;
      break;
    case "lt":
      pass = (traitValue as number) < (target as number);
      score = pass ? Math.min(1.0, 0.5 + ((target as number) - (traitValue as number)) / (Math.abs(target as number) || 1) * 0.5) : 0.0;
      break;
    case "lte":
      pass = (traitValue as number) <= (target as number);
      score = pass ? Math.min(1.0, 0.5 + ((target as number) - (traitValue as number)) / (Math.abs(target as number) || 1) * 0.5) : 0.0;
      break;
    case "in":
      pass = Array.isArray(target) && target.includes(traitValue as string);
      score = pass ? 1.0 : 0.0;
      break;
    case "contains":
      pass = Array.isArray(traitValue) && (traitValue as string[]).includes(target as string);
      score = pass ? 1.0 : 0.0;
      break;
    case "contains_all":
      if (Array.isArray(traitValue) && Array.isArray(target)) {
        const tv = traitValue as string[];
        pass = (target as string[]).every(v => tv.includes(v));
        score = pass ? 1.0 : (target as string[]).filter(v => tv.includes(v)).length / (target as string[]).length;
      }
      break;
    case "contains_any":
      if (Array.isArray(traitValue) && Array.isArray(target)) {
        const tv = traitValue as string[];
        const matches = (target as string[]).filter(v => tv.includes(v)).length;
        pass = matches > 0;
        score = matches / (target as string[]).length;
      }
      break;
    case "exists":
      pass = true; // We already handled missing above
      score = 1.0;
      break;
    case "range":
      if (Array.isArray(target) && target.length === 2) {
        const v = traitValue as number;
        const [min, max] = target as [number, number];
        pass = v >= min && v <= max;
        if (pass) {
          score = 1.0;
        } else {
          const dist = v < min ? min - v : v - max;
          const range = max - min || 1;
          score = Math.max(0, 1.0 - dist / range);
        }
      }
      break;
    case "regex":
      try {
        if (typeof target === "string" && target.length <= 200) {
          pass = new RegExp(target).test(String(traitValue));
        }
        score = pass ? 1.0 : 0.0;
      } catch {
        pass = false;
        score = 0.0;
      }
      break;
    default:
      pass = false;
      score = 0.0;
  }

  return { pass, score };
}
