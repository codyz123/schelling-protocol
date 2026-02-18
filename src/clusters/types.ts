/**
 * Cluster configuration types — replaces src/verticals/types.ts
 */

export interface IntentClusterConfig {
  cluster_id: string;
  version: string;
  display_name: string;
  description: string;
  centroid: number[]; // 16-dim intent embedding centroid
  roles: Record<string, ClusterRole>;
  symmetric: boolean;
  embedding_schema: {
    dimensions: number;
    groups: Record<string, { start: number; end: number }>;
  };
  funnel_config: ClusterFunnelConfig;
  negotiation?: {
    enabled: boolean;
    max_rounds: number;
    timeout_hours: number;
    proposal_schema: Record<string, string>;
  };
  exclusive_commitment: boolean;
  deal_breakers?: ClusterDealBreakerConfig;
  identity_required: boolean;
  mutual_gate: boolean;
}

export interface ClusterRole {
  name: string;
  description: string;
  data_schema: string;
  required_fields: string[];
  optional_fields: string[];
}

export interface ClusterFunnelConfig {
  discovery_fields: string[];
  evaluation_fields: string[];
  exchange_fields: string[];
  connection_fields: string[];
  mutual_gate_stage: "DISCOVERED" | "EVALUATED" | "EXCHANGED" | "COMMITTED";
}

export interface ClusterDealBreakerConfig {
  enabled: boolean;
  hard_filters: string[];
  filter_before_scoring: boolean;
}
