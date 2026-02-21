import type { HandlerContext, HandlerResult, UserRecord } from "../types.js";
import { computeCompatibility } from "../matching/compatibility.js";
import { cosineSimilarity16 } from "../matching/intent.js";
import { getCluster } from "../clusters/registry.js";

export interface GroupEvaluateInput {
  user_token: string;
  cluster_id: string;
  member_tokens: string[];
}

export interface PairScore {
  user_a: string;
  user_b: string;
  trait_similarity: number;
  intent_similarity: number;
  combined: number;
}

export interface GroupEvaluateOutput {
  cluster_id: string;
  member_count: number;
  pairwise_scores: PairScore[];
  min_score: number;
  mean_score: number;
  weakest_pair: [string, string];
  viable: boolean;
}

export async function handleGroupEvaluate(
  input: GroupEvaluateInput,
  ctx: HandlerContext
): Promise<HandlerResult<GroupEvaluateOutput>> {
  const cluster = getCluster(input.cluster_id);
  if (!cluster) {
    return { ok: false, error: { code: "UNKNOWN_CLUSTER", message: `Unknown cluster: ${input.cluster_id}` } };
  }

  if (!cluster.group_size) {
    return { ok: false, error: { code: "INVALID_INPUT", message: `Cluster '${input.cluster_id}' does not support groups` } };
  }

  // Caller must be registered
  const caller = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?").get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  const allTokens = input.member_tokens;
  if (allTokens.length < cluster.group_size.min || allTokens.length > cluster.group_size.max) {
    return { ok: false, error: { code: "INVALID_INPUT", message: `Group size must be between ${cluster.group_size.min} and ${cluster.group_size.max}` } };
  }

  // Load all members
  const users: UserRecord[] = [];
  for (const token of allTokens) {
    const user = ctx.db.prepare("SELECT * FROM users WHERE user_token = ?").get(token) as UserRecord | undefined;
    if (!user) {
      return { ok: false, error: { code: "USER_NOT_FOUND", message: `User ${token} not found` } };
    }
    users.push(user);
  }

  // Compute pairwise scores
  const pairScores: PairScore[] = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const a = users[i];
      const b = users[j];
      const embA: number[] = a.embedding ? JSON.parse(a.embedding) : [];
      const embB: number[] = b.embedding ? JSON.parse(b.embedding) : [];
      const intentA: number[] = a.intent_embedding ? JSON.parse(a.intent_embedding) : [];
      const intentB: number[] = b.intent_embedding ? JSON.parse(b.intent_embedding) : [];

      const traitResult = computeCompatibility(embA, embB);
      const intentSim = intentA.length === 16 && intentB.length === 16
        ? cosineSimilarity16(intentA, intentB)
        : 0;
      const combined = 0.6 * traitResult.overall_score + 0.4 * ((intentSim + 1) / 2);

      pairScores.push({
        user_a: a.user_token,
        user_b: b.user_token,
        trait_similarity: Math.round(traitResult.overall_score * 100) / 100,
        intent_similarity: Math.round(intentSim * 100) / 100,
        combined: Math.round(combined * 100) / 100,
      });
    }
  }

  const scores = pairScores.map(p => p.combined);
  const minScore = Math.min(...scores);
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const weakestPair = pairScores.reduce((a, b) => a.combined < b.combined ? a : b);
  const minPairwise = cluster.group_min_pairwise ?? 0;
  const viable = minScore >= minPairwise;

  return {
    ok: true,
    data: {
      cluster_id: input.cluster_id,
      member_count: allTokens.length,
      pairwise_scores: pairScores,
      min_score: Math.round(minScore * 100) / 100,
      mean_score: Math.round(meanScore * 100) / 100,
      weakest_pair: [weakestPair.user_a, weakestPair.user_b],
      viable,
    },
  };
}
