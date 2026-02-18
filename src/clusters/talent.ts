import type { IntentClusterConfig } from "./types.js";
import { CLUSTER_CENTROIDS } from "./centroids.js";

export const talentCluster: IntentClusterConfig = {
  cluster_id: "talent",
  version: "2.0",
  display_name: "Talent & Hiring",
  description: "Find talent or opportunities — freelancers, employees, collaborators",
  centroid: CLUSTER_CENTROIDS.talent,
  roles: {
    seeker: {
      name: "Talent Seeker",
      description: "Someone looking to hire or collaborate",
      data_schema: "talent_seeker",
      required_fields: ["intent_embedding"],
      optional_fields: ["description", "seeking", "structured_attributes"],
    },
    talent: {
      name: "Talent",
      description: "Someone offering skills or services",
      data_schema: "talent_profile",
      required_fields: ["intent_embedding"],
      optional_fields: ["description", "structured_attributes"],
    },
  },
  symmetric: false,
  embedding_schema: { dimensions: 50, groups: {} },
  funnel_config: {
    discovery_fields: ["skills", "experience", "rate_range"],
    evaluation_fields: ["portfolio", "references", "availability"],
    exchange_fields: ["detailed_proposal", "terms", "timeline"],
    connection_fields: ["name", "contact", "contract_details"],
    mutual_gate_stage: "EVALUATED",
  },
  negotiation: { enabled: true, max_rounds: 5, timeout_hours: 72, proposal_schema: { rate: "number", scope: "string" } },
  exclusive_commitment: false,
  deal_breakers: { enabled: true, hard_filters: ["skills", "location", "rate_range"], filter_before_scoring: true },
  identity_required: true,
  mutual_gate: true,
};
