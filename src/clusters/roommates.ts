import type { IntentClusterConfig } from "./types.js";
import { CLUSTER_CENTROIDS } from "./centroids.js";

export const roommatesCluster: IntentClusterConfig = {
  cluster_id: "roommates",
  version: "2.0",
  display_name: "Roommate Matching",
  description: "Find compatible roommates based on lifestyle, preferences, and practical needs",
  centroid: CLUSTER_CENTROIDS.roommates,
  roles: {
    seeker: {
      name: "Roommate Seeker",
      description: "Someone looking for a roommate",
      data_schema: "roommate_profile",
      required_fields: ["intent_embedding"],
      optional_fields: ["description", "seeking", "structured_attributes", "city"],
    },
  },
  symmetric: true,
  embedding_schema: { dimensions: 50, groups: {} },
  funnel_config: {
    discovery_fields: ["location", "budget_range", "move_in_date", "lifestyle_summary"],
    evaluation_fields: ["detailed_preferences", "schedule", "habits"],
    exchange_fields: ["full_profile", "photos", "references"],
    connection_fields: ["name", "contact", "viewing_details"],
    mutual_gate_stage: "EXCHANGED",
  },
  negotiation: { enabled: false, max_rounds: 0, timeout_hours: 0, proposal_schema: {} },
  exclusive_commitment: false,
  deal_breakers: { enabled: true, hard_filters: ["city", "budget_range", "pet_policy"], filter_before_scoring: true },
  identity_required: false,
  mutual_gate: true,
};
