// API Types (matching the server)
export interface ServerInfo {
  protocol_version: string;
  server_version: string;
  total_users: number;
  total_candidates: number;
  uptime_seconds: number;
  supported_verticals: string[];
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  protocol_version: string;
  server_version: string;
  total_users: number;
  total_candidates: number;
  uptime_seconds: number;
  supported_verticals: string[];
  error?: string;
}

export interface AnalyticsResponse {
  funnel_metrics: {
    total_users: number;
    discovered: number;
    evaluated: number;
    exchanged: number;
    committed: number;
    connected: number;
    completed: number;
  };
  outcome_metrics: {
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    positive_rate: number;
    confidence_interval: { lower: number; upper: number };
  };
  match_rate: number;
  response_rate: number;
  average_score: number;
  ab_test_results: Record<string, {
    user_count: number;
    positive_outcomes: number;
    total_outcomes: number;
    avg_score: number;
  }>;
  ab_test_significance?: { z: number; p_value: number; significant: boolean };
  users?: Array<{
    user_id_hash: string;
    intent_embedding: number[];
    primary_cluster: string;
    reputation_score: number;
    status: string;
    last_registered_at: string;
  }>;
}

// Server returns clusters with `id` field (not `cluster_id`)
export interface IntentCluster {
  id: string;
  version: string;
  display_name: string;
  description: string;
  centroid: number[];
  roles: Array<{ id: string; name: string; description: string }>;
  symmetric: boolean;
  exclusive_commitment: boolean;
  peer_roles?: string[];
  recommended_attributes?: string[];
  decline_ttl_days?: number;
  user_count: number;
  active_candidates: number;
}

// Matches server's SearchCandidate from handleSearch
export interface SearchResult {
  candidate_id: string;
  compatibility_score: number;
  combined_score?: number;
  your_fit?: number;
  their_fit?: number;
  intent_similarity?: number;
  shared_categories?: string[];
  intent?: string[];       // Server uses 'intent' not 'intents'
  city?: string | null;
  age_range?: string | null;
  reputation_score?: number;
  verification_level?: string;
  interaction_count?: number;
  stale?: boolean;
  computed_at?: string;
}

// Matches server's ComparisonResult from handleCompare
export interface EvaluateResult {
  candidate_id: string;
  compatibility_score: number;
  breakdown: Record<string, number>;
  shared_interests: string[];
  complementary_traits: Array<{
    dimension: string;
    you: number;
    them: number;
    label: string;
  }>;
  strongest_alignments: string[];
  narrative_summary: string;
  predicted_friction: string[];
  conversation_starters: string[];
  intent_explanation?: { aligned: string[]; misaligned: string[] };
}

// Dashboard state types
export interface User {
  user_id_hash?: string;
  user_token?: string;
  intent_embedding: number[];
  trait_embedding: number[];
  intents: string[];
  primary_cluster: string;
  reputation_score: number;
  status: string;
  last_registered_at: string;
  profile?: {
    name?: string;
    city?: string;
    age_range?: string;
    description?: string;
    seeking?: string;
    interests?: string[];
    values_text?: string;
  };
}

export interface SyntheticUser extends User {
  user_token: string;
  template_name?: string;
}

// Cluster centroid values from the server — must match src/clusters/centroids.ts
export const CLUSTER_CENTROIDS: Record<string, number[]> = {
  matchmaking: [+0.85, +0.60, -0.80, -0.70, +0.80, -0.60, +0.80, -0.20, +0.85, +0.80, +0.75, +0.60, -0.40, +0.20, +0.80, +0.20],
  marketplace: [-0.90, -0.80, -0.20, +0.90, -0.85, +0.50, -0.40, +0.40, -0.85, -0.85, -0.40, -0.85, +0.60, +0.70, -0.80, -0.70],
  talent: [-0.85, -0.40, +0.90, +0.40, +0.30, +0.65, -0.20, +0.70, -0.60, -0.30, +0.30, -0.60, +0.30, -0.40, +0.30, -0.40],
  roommates: [-0.40, +0.50, -0.60, +0.10, +0.50, -0.60, -0.10, -0.20, +0.30, +0.30, +0.40, +0.85, +0.30, +0.90, +0.80, +0.10],
};

// Intent embedding dimension labels — must match protocol/intent-embedding-spec.md
export const INTENT_DIMENSIONS = [
  'romantic_intent',       // 0
  'social_bonding',        // 1
  'professional_context',  // 2
  'material_exchange',     // 3
  'commitment_duration',   // 4
  'relationship_symmetry', // 5
  'exclusivity',           // 6
  'formality',             // 7
  'emotional_depth',       // 8
  'identity_specificity',  // 9
  'vulnerability_level',   // 10
  'shared_lifestyle',      // 11
  'urgency',               // 12
  'locality_requirement',  // 13
  'interaction_frequency', // 14
  'scope_breadth',         // 15
];

// Trait embedding dimension names — must match protocol/embedding-spec.md (50 dimensions)
export const TRAIT_DIMENSION_NAMES = [
  // Personality (0–9)
  'openness', 'intellectual_curiosity', 'aesthetic_sensitivity', 'conscientiousness',
  'self_discipline', 'extraversion', 'social_energy', 'assertiveness',
  'agreeableness', 'emotional_stability',
  // Values (10–19)
  'autonomy', 'tradition', 'achievement', 'benevolence', 'universalism',
  'security', 'stimulation', 'hedonism', 'power', 'conformity',
  // Aesthetic (20–27)
  'minimalism', 'nature_affinity', 'urban_preference', 'visual',
  'auditory', 'tactile', 'symmetry', 'novelty_seeking',
  // Intellectual (28–35)
  'systematic', 'abstract', 'verbal', 'depth_focused',
  'theoretical', 'analytical', 'creative', 'critical',
  // Social (36–43)
  'introversion', 'depth_preference', 'leadership', 'empathy',
  'humor', 'conflict_tolerance', 'formality', 'spontaneity',
  // Communication (44–49)
  'directness', 'verbosity', 'emotional_expression',
  'listener_vs_talker', 'written_preference', 'debate_enjoyment',
];

// Trait embedding groups — must match src/types.ts DIMENSION_GROUPS
export const TRAIT_GROUPS: Record<string, { start: number; end: number; dimensions: string[] }> = {
  Personality: {
    start: 0, end: 10,
    dimensions: TRAIT_DIMENSION_NAMES.slice(0, 10),
  },
  Values: {
    start: 10, end: 20,
    dimensions: TRAIT_DIMENSION_NAMES.slice(10, 20),
  },
  Aesthetic: {
    start: 20, end: 28,
    dimensions: TRAIT_DIMENSION_NAMES.slice(20, 28),
  },
  Intellectual: {
    start: 28, end: 36,
    dimensions: TRAIT_DIMENSION_NAMES.slice(28, 36),
  },
  Social: {
    start: 36, end: 44,
    dimensions: TRAIT_DIMENSION_NAMES.slice(36, 44),
  },
  Communication: {
    start: 44, end: 50,
    dimensions: TRAIT_DIMENSION_NAMES.slice(44, 50),
  },
};
