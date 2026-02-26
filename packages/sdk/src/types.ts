// ─── Core Types ──────────────────────────────────────────────────────

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

export type PreferenceOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "in" | "contains" | "exists" | "range"
  | "contains_any" | "regex" | "contains_all";

export type FunnelMode = "bilateral" | "broadcast" | "group" | "auction";

export type FunnelStage = 0 | 1 | 2 | 3 | 4;

export const Stage = {
  UNDISCOVERED: 0 as FunnelStage,
  DISCOVERED: 1 as FunnelStage,
  INTERESTED: 2 as FunnelStage,
  COMMITTED: 3 as FunnelStage,
  CONNECTED: 4 as FunnelStage,
} as const;

// ─── Data Objects ────────────────────────────────────────────────────

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

export interface Preference {
  trait_key: string;
  operator: PreferenceOperator;
  value: string | number | boolean | string[] | number[];
  weight: number;
  label?: string;
}

export interface TextProfile {
  description?: string;
  seeking?: string;
  interests?: string[];
  values_text?: string;
}

export interface Identity {
  name?: string;
  contact?: string;
  phone_hash?: string;
}

export interface Capability {
  capability: string;
  parameters?: Record<string, unknown>;
  confidence?: number;
}

export interface Deliverable {
  type: string;
  content: string;
  content_type?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
  checksum?: string;
}

export interface Milestone {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  deliverable_types?: string[];
}

export interface Budget {
  min?: number;
  max?: number;
  currency?: string;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface RegisterParams {
  protocol_version?: string;
  cluster_id: string;
  role?: string;
  agent_model?: string;
  traits?: Trait[];
  preferences?: Preference[];
  intent_embedding?: number[];
  intents?: string[];
  phone_hash?: string;
  identity?: Identity;
  text_profile?: TextProfile;
  agent_capabilities?: Capability[];
  funnel_mode?: FunnelMode;
  group_size?: number;
  media_refs?: string[];
  user_token?: string;
  idempotency_key?: string;
}

export interface UpdateParams {
  user_token: string;
  traits?: Trait[];
  remove_traits?: string[];
  preferences?: Preference[];
  remove_preferences?: string[];
  intent_embedding?: number[];
  intents?: string[];
  text_profile?: TextProfile;
  status?: "active" | "paused";
  idempotency_key?: string;
}

export interface SearchParams {
  user_token: string;
  cluster_id?: string;
  natural_language?: string;
  preference_overrides?: Preference[];
  trait_filters?: Preference[];
  capability_filters?: string[];
  mode_filter?: FunnelMode;
  min_advisory_score?: number;
  max_results?: number;
  cursor?: string;
  idempotency_key?: string;
}

export interface QuickSeekParams {
  intent: string;
  user_token?: string;
  cluster_id?: string;
  constraints?: Preference[];
  max_results?: number;
  auto_advance?: boolean;
  deadline?: string;
  budget?: Budget;
}

export interface QuickOfferParams {
  intent: string;
  user_token?: string;
  cluster_id?: string;
  traits?: Trait[] | Record<string, unknown>;
  available_until?: string;
  auto_subscribe?: boolean;
  notification_threshold?: number;
}

export interface ContractParams {
  user_token: string;
  action: "propose" | "accept" | "reject" | "counter" | "complete" | "terminate" | "list";
  candidate_id?: string;
  contract_id?: string;
  terms?: Record<string, unknown>;
  type?: "match" | "service" | "task" | "custom";
  milestones?: Milestone[];
  dispute_content_disclosure?: boolean;
  safe_types?: string[];
  terms_schema_version?: string;
  expires_at?: string;
  reason?: string;
  status?: string;
  idempotency_key?: string;
}

export interface SubscribeParams {
  user_token: string;
  action?: "create" | "list";
  threshold?: number;
  intent_embedding?: number[];
  trait_filters?: Preference[];
  capability_filters?: string[];
  cluster_filter?: string;
  mode_filter?: string;
  max_notifications_per_day?: number;
  ttl_days?: number;
  idempotency_key?: string;
}

// ─── Response Types ──────────────────────────────────────────────────

export interface DescribeResponse {
  protocol_version: string;
  server_version: string;
  server_name: string;
  description: string;
  clusters: Array<{
    cluster_id: string;
    display_name: string | null;
    population: number;
    phase: string;
  }>;
  capabilities: string[];
  [key: string]: unknown;
}

export interface RegisterResponse {
  user_token: string;
  cluster_id: string;
  role: string;
  status: string;
  [key: string]: unknown;
}

export interface OnboardResponse {
  suggested_cluster: string;
  template: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SearchResult {
  candidate_id: string;
  counterpart_token: string;
  advisory_score: number;
  traits: Trait[];
  text_profile?: TextProfile;
  [key: string]: unknown;
}

export interface SearchResponse {
  candidates: SearchResult[];
  cursor?: string;
  total?: number;
  [key: string]: unknown;
}

export interface QuickSeekResponse {
  user_token: string;
  cluster_id: string;
  candidates: SearchResult[];
  [key: string]: unknown;
}

export interface QuickOfferResponse {
  user_token: string;
  cluster_id: string;
  subscription_id?: string;
  [key: string]: unknown;
}

export interface ConnectionsResponse {
  connections: Array<{
    candidate_id: string;
    counterpart_token: string;
    my_stage: number;
    their_stage: number;
    traits: Trait[];
    [key: string]: unknown;
  }>;
  cursor?: string;
}

export interface ContractResponse {
  contract_id?: string;
  status?: string;
  contracts?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ReputationResponse {
  identity_id: string;
  score: number;
  events: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

// ─── Error Types ─────────────────────────────────────────────────────

export interface SchellingErrorBody {
  code: string;
  message: string;
}
