import type { IntentClusterConfig } from "./types.js";
import { CLUSTER_CENTROIDS } from "./centroids.js";
import { DIMENSION_GROUPS } from "../types.js";

export const matchmakingCluster: IntentClusterConfig = {
  cluster_id: "matchmaking",
  version: "2.0",
  display_name: "Romantic Matchmaking",
  description: "Find compatible romantic partners via personality embedding comparison and progressive disclosure",
  centroid: CLUSTER_CENTROIDS.matchmaking,
  roles: {
    seeker: {
      name: "Match Seeker",
      description: "Someone looking for romantic connections",
      data_schema: "matchmaking_profile",
      required_fields: ["embedding", "intent_embedding"],
      optional_fields: ["interests", "values_text", "description", "seeking", "identity", "city", "age_range"],
    },
  },
  symmetric: true,
  embedding_schema: { dimensions: 50, groups: DIMENSION_GROUPS },
  funnel_config: {
    discovery_fields: ["compatibility_score", "shared_categories", "intent", "city", "age_range"],
    evaluation_fields: ["group_breakdown", "shared_interests", "complementary_traits", "strongest_alignments"],
    exchange_fields: ["description", "seeking", "interests", "values_text"],
    connection_fields: ["name", "contact"],
    mutual_gate_stage: "EXCHANGED",
  },
  negotiation: { enabled: false, max_rounds: 0, timeout_hours: 0, proposal_schema: {} },
  exclusive_commitment: false,
  deal_breakers: { enabled: true, hard_filters: ["city", "age_range"], filter_before_scoring: true },
  identity_required: false,
  mutual_gate: true,
  recommended_attributes: ["city", "age_range", "languages_spoken"],
  decline_ttl_days: 90,
};
