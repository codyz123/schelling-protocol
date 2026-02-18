import type { VerticalDescriptor } from "../types.js";
import { DIMENSION_GROUPS } from "../../types.js";

export const matchmakingVertical: VerticalDescriptor = {
  vertical_id: "matchmaking",
  version: "2.0",
  display_name: "Romantic Matchmaking",
  description: "Find compatible romantic partners via personality embedding comparison and progressive disclosure",
  
  // Single symmetric role - everyone is looking for matches
  roles: {
    seeker: {
      name: "Match Seeker",
      description: "Someone looking for romantic connections",
      data_schema: "matchmaking_profile",
      required_fields: ["embedding", "city", "age_range", "intent"],
      optional_fields: ["interests", "values_text", "description", "seeking", "identity"]
    }
  },
  symmetric: true,
  
  // 50-dimension personality embedding
  embedding_schema: {
    dimensions: 50,
    groups: DIMENSION_GROUPS,
    anchors_reference: "matchmaking-anchors-v2.md",
    validation_rules: {
      range: [-1, 1],
      require_non_zero_norm: true,
      allow_nan_infinity: false
    }
  },
  
  // Funnel configuration - what's visible at each stage
  funnel_config: {
    discovery_fields: [
      "compatibility_score", 
      "shared_categories", 
      "intent", 
      "city", 
      "age_range"
    ],
    evaluation_fields: [
      "group_breakdown",
      "shared_interests", 
      "complementary_traits",
      "strongest_alignments"
    ],
    exchange_fields: [
      "description", 
      "seeking", 
      "interests", 
      "values_text"
    ],
    connection_fields: [
      "name", 
      "contact"
    ],
    mutual_gate_stage: "EXCHANGED" // Both sides must reach EXCHANGED before profiles are shared
  },
  
  // Optional features
  negotiation: {
    enabled: false, // Matchmaking doesn't use negotiation
    max_rounds: 0,
    timeout_hours: 0,
    proposal_schema: {}
  },
  
  exclusive_commitment: false, // People can be in multiple conversations
  
  deal_breakers: {
    enabled: true,
    hard_filters: ["city", "age_range", "intent"], // These are hard constraints
    filter_before_scoring: true
  }
};