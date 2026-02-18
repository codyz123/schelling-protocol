// Vertical descriptor system types

export interface VerticalDescriptor {
  vertical_id: string;
  version: string;
  display_name: string;
  description: string;
  
  // Role system
  roles: Record<string, VerticalRole>;
  symmetric: boolean; // true for matchmaking, false for marketplace
  
  // Embedding configuration
  embedding_schema: EmbeddingSchema;
  
  // Funnel behavior
  funnel_config: FunnelConfig;
  
  // Optional features
  negotiation?: NegotiationConfig;
  exclusive_commitment?: boolean;
  deal_breakers?: DealBreakerConfig;
}

export interface VerticalRole {
  name: string;
  description: string;
  data_schema: string;
  required_fields: string[];
  optional_fields: string[];
}

export interface EmbeddingSchema {
  dimensions: number;
  groups: Record<string, { start: number; end: number }>;
  anchors_reference?: string;
  validation_rules?: EmbeddingValidationRules;
}

export interface EmbeddingValidationRules {
  range: [number, number];
  require_non_zero_norm: boolean;
  allow_nan_infinity: boolean;
}

export interface FunnelConfig {
  discovery_fields: string[];
  evaluation_fields: string[];
  exchange_fields: string[];
  connection_fields: string[];
  mutual_gate_stage: "DISCOVERED" | "EVALUATED" | "EXCHANGED" | "COMMITTED";
}

export interface NegotiationConfig {
  enabled: boolean;
  max_rounds: number;
  timeout_hours: number;
  proposal_schema: Record<string, any>;
}

export interface DealBreakerConfig {
  enabled: boolean;
  hard_filters: string[];
  filter_before_scoring: boolean;
}

// Runtime registry
export interface VerticalRegistry {
  [vertical_id: string]: VerticalDescriptor;
}