/**
 * Cluster registry — replaces src/verticals/registry.ts
 */

import type { IntentClusterConfig } from "./types.js";
import { matchmakingCluster } from "./matchmaking.js";
import { marketplaceCluster } from "./marketplace.js";
import { talentCluster } from "./talent.js";
import { roommatesCluster } from "./roommates.js";

let _registry: Record<string, IntentClusterConfig> = {};

/** Default cluster config for intents that don't match any centroid. */
const defaultCluster: IntentClusterConfig = {
  cluster_id: "default",
  version: "2.0",
  display_name: "General",
  description: "Default cluster for unclassified intents",
  centroid: new Array(16).fill(0),
  roles: {
    participant: {
      name: "Participant",
      description: "General participant",
      data_schema: "general_profile",
      required_fields: ["intent_embedding"],
      optional_fields: ["description", "seeking", "structured_attributes"],
    },
  },
  symmetric: true,
  embedding_schema: { dimensions: 50, groups: {} },
  funnel_config: {
    discovery_fields: ["compatibility_score", "intent"],
    evaluation_fields: ["group_breakdown", "shared_interests"],
    exchange_fields: ["description", "seeking"],
    connection_fields: ["name", "contact"],
    mutual_gate_stage: "EXCHANGED",
  },
  exclusive_commitment: false,
  identity_required: false,
  mutual_gate: true,
};

export function resetClusterRegistry(): void {
  _registry = {};
}

export function initClusterRegistry(): void {
  resetClusterRegistry();
  registerCluster(matchmakingCluster);
  registerCluster(marketplaceCluster);
  registerCluster(talentCluster);
  registerCluster(roommatesCluster);
  registerCluster(defaultCluster);
}

export function registerCluster(config: IntentClusterConfig): void {
  _registry[config.cluster_id] = config;
}

export function getCluster(clusterId: string): IntentClusterConfig | null {
  return _registry[clusterId] ?? null;
}

export function listClusters(): IntentClusterConfig[] {
  return Object.values(_registry);
}

export function getClusterIds(): string[] {
  return Object.keys(_registry);
}

/**
 * Backward-compat shim: maps old vertical_id lookups to cluster lookups.
 */
export function getVertical(verticalId: string): IntentClusterConfig | null {
  return getCluster(verticalId);
}
