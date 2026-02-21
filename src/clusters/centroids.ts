/**
 * Pre-defined cluster centroid vectors (canonical, from the protocol spec).
 */

import { cosineSimilarity16 } from "../matching/intent.js";

/** Affinity threshold — clusters with cosine sim > this value apply. */
export const AFFINITY_THRESHOLD = 0.5;

export const CLUSTER_CENTROIDS: Record<string, number[]> = {
  matchmaking: [+0.85, +0.60, -0.80, -0.70, +0.80, -0.60, +0.80, -0.20, +0.85, +0.80, +0.75, +0.60, -0.40, +0.20, +0.80, +0.20],
  marketplace: [-0.90, -0.80, -0.20, +0.90, -0.85, +0.50, -0.40, +0.40, -0.85, -0.85, -0.40, -0.85, +0.60, +0.70, -0.80, -0.70],
  talent:      [-0.85, -0.40, +0.90, +0.40, +0.30, +0.65, -0.20, +0.70, -0.60, -0.30, +0.30, -0.60, +0.30, -0.40, +0.30, -0.40],
  roommates:   [-0.40, +0.50, -0.60, +0.10, +0.50, -0.60, -0.10, -0.20, +0.30, +0.30, +0.40, +0.85, +0.30, +0.90, +0.80, +0.10],
};

export const CLUSTER_IDS = Object.keys(CLUSTER_CENTROIDS);

/**
 * Compute cosine similarity between an intent embedding and every cluster centroid.
 * Returns a map of { cluster_id: similarity }.
 */
export function computeClusterAffinities(intentEmbedding: number[]): Record<string, number> {
  const affinities: Record<string, number> = {};
  for (const [id, centroid] of Object.entries(CLUSTER_CENTROIDS)) {
    affinities[id] = cosineSimilarity16(intentEmbedding, centroid);
  }
  return affinities;
}

/**
 * Return the cluster ID with highest cosine similarity, or "default" if none > AFFINITY_THRESHOLD.
 */
export function getPrimaryCluster(intentEmbedding: number[]): string {
  const affinities = computeClusterAffinities(intentEmbedding);
  let best = "";
  let bestSim = -Infinity;
  for (const [id, sim] of Object.entries(affinities)) {
    if (sim > bestSim) {
      bestSim = sim;
      best = id;
    }
  }
  return bestSim > AFFINITY_THRESHOLD ? best : "default";
}
