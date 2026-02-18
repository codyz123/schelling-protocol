import type { IntentClusterConfig } from "./types.js";
import { CLUSTER_CENTROIDS } from "./centroids.js";

export const marketplaceCluster: IntentClusterConfig = {
  cluster_id: "marketplace",
  version: "2.0",
  display_name: "Buy/Sell Marketplace",
  description: "Find buyers or sellers for items through asymmetric matching with price negotiation",
  centroid: CLUSTER_CENTROIDS.marketplace,
  roles: {
    seller: {
      name: "Seller",
      description: "Someone selling an item",
      data_schema: "marketplace_listing",
      required_fields: ["intent_embedding"],
      optional_fields: ["description", "structured_attributes"],
    },
    buyer: {
      name: "Buyer",
      description: "Someone looking to buy an item",
      data_schema: "marketplace_preference",
      required_fields: ["intent_embedding"],
      optional_fields: ["description", "structured_attributes"],
    },
  },
  symmetric: false,
  embedding_schema: { dimensions: 50, groups: {} },
  funnel_config: {
    discovery_fields: ["category", "condition", "price_range", "location", "reputation_score"],
    evaluation_fields: ["description", "photos_watermarked", "item_condition_details"],
    exchange_fields: ["photos_full_resolution", "exact_condition_description", "payment_methods"],
    connection_fields: ["seller_name", "seller_contact", "payment_details"],
    mutual_gate_stage: "EXCHANGED",
  },
  negotiation: { enabled: true, max_rounds: 5, timeout_hours: 48, proposal_schema: { price: "number", terms: "string" } },
  exclusive_commitment: true,
  deal_breakers: { enabled: true, hard_filters: ["category", "location", "price_range"], filter_before_scoring: true },
  identity_required: true,
  mutual_gate: true,
  recommended_attributes: ["category", "location", "condition"],
  decline_ttl_days: 30,
};
