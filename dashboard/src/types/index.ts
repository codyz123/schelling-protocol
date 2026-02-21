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

export interface IntentCluster {
  cluster_id: string;
  version: string;
  display_name: string;
  description: string;
  centroid: number[];
  roles: Record<string, {
    name: string;
    description: string;
    data_schema: string;
    required_fields: string[];
    optional_fields: string[];
  }>;
  symmetric: boolean;
}

export interface SearchResult {
  candidate_id: string;
  combined_score: number;
  your_fit: number;
  their_fit: number;
  intent_similarity: number;
  primary_cluster: string;
  intents: string[];
}

export interface EvaluateResult {
  candidate_id: string;
  your_fit: number;
  their_fit: number;
  combined_score: number;
  breakdown: {
    trait_similarity: number;
    intent_similarity: number;
    preference_alignment?: number;
    deal_breaker: number;
    collaborative?: number;
  };
  shared_interests: string[];
  complementary_traits: Array<{
    dimension: string;
    your_value: number;
    their_value: number;
    complementary: boolean;
  }>;
  narrative_summary: string;
  predicted_friction: string[];
  conversation_starters: string[];
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

// Cluster centroid values from the server
export const CLUSTER_CENTROIDS: Record<string, number[]> = {
  matchmaking: [+0.85, +0.60, -0.80, -0.70, +0.80, -0.60, +0.80, -0.20, +0.85, +0.80, +0.75, +0.60, -0.40, +0.20, +0.80, +0.20],
  marketplace: [-0.90, -0.80, -0.20, +0.90, -0.85, +0.50, -0.40, +0.40, -0.85, -0.85, -0.40, -0.85, +0.60, +0.70, -0.80, -0.70],
  talent: [-0.85, -0.40, +0.90, +0.40, +0.30, +0.65, -0.20, +0.70, -0.60, -0.30, +0.30, -0.60, +0.30, -0.40, +0.30, -0.40],
  roommates: [-0.40, +0.50, -0.60, +0.10, +0.50, -0.60, -0.10, -0.20, +0.30, +0.30, +0.40, +0.85, +0.30, +0.90, +0.80, +0.10],
};

// Intent embedding dimension labels
export const INTENT_DIMENSIONS = [
  'romantic_intent',
  'social_bonding', 
  'professional_context',
  'transaction_focus',
  'emotional_depth',
  'formality',
  'collaboration',
  'individual_agency',
  'commitment',
  'reciprocity',
  'compatibility_importance',
  'long_term_orientation',
  'urgency',
  'flexibility',
  'scope_breadth',
  'novelty_seeking'
];

// Trait embedding groups (50 dimensions total)
export const TRAIT_GROUPS = {
  'Personality': Array.from({length: 10}, (_, i) => `personality_${i}`),
  'Values': Array.from({length: 8}, (_, i) => `values_${i}`),
  'Lifestyle': Array.from({length: 8}, (_, i) => `lifestyle_${i}`),
  'Communication': Array.from({length: 8}, (_, i) => `communication_${i}`),
  'Interests': Array.from({length: 8}, (_, i) => `interests_${i}`),
  'Preferences': Array.from({length: 8}, (_, i) => `preferences_${i}`),
};