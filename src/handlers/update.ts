import type { HandlerContext, HandlerResult, UserRecord } from "../types.js";
import { validateIntentEmbedding, validateTraitEmbedding } from "../matching/intent.js";
import { computeClusterAffinities, getPrimaryCluster } from "../clusters/centroids.js";
import { getCluster } from "../clusters/registry.js";

export interface UpdateInput {
  user_token: string;
  description?: string;
  seeking?: string;
  interests?: string[];
  values_text?: string;
  city?: string;
  age_range?: string;
  deal_breakers?: Record<string, unknown>;
  media_refs?: string[];
  identity?: { name: string; contact: string };
  status?: "active" | "paused";
  agent_model?: string;
  embedding?: number[];
  intent_embedding?: number[];
  intents?: string[];
  intent_tags?: Record<number, string[]>;
  structured_attributes?: Record<string, unknown>;
  recompute_scores?: boolean;
}

export interface UpdateOutput {
  updated: true;
  updated_fields: string[];
  updated_at: string;
  scores_recomputing: boolean;
  primary_cluster?: string;
  cluster_affinities?: Record<string, number>;
}

const IMMUTABLE_FIELDS = new Set(["role", "protocol_version", "verification_level"]);

export async function handleUpdate(
  input: UpdateInput,
  ctx: HandlerContext
): Promise<HandlerResult<UpdateOutput>> {
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  // Check for immutable field attempts
  for (const field of IMMUTABLE_FIELDS) {
    if ((input as any)[field] !== undefined) {
      return { ok: false, error: { code: "IMMUTABLE_FIELD", message: `Cannot update immutable field: ${field}` } };
    }
  }

  // Validate embeddings if provided
  if (input.embedding) {
    if (!input.recompute_scores) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "Must set recompute_scores: true when updating embedding" } };
    }
    const validation = validateTraitEmbedding(input.embedding);
    if (!validation.valid) {
      return { ok: false, error: { code: "INVALID_INPUT", message: validation.errors.join("; ") } };
    }
  }

  let newPrimaryCluster: string | undefined;
  let newAffinities: Record<string, number> | undefined;

  if (input.intent_embedding) {
    if (!input.recompute_scores) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "Must set recompute_scores: true when updating intent_embedding" } };
    }
    const validation = validateIntentEmbedding(input.intent_embedding);
    if (!validation.valid) {
      return { ok: false, error: { code: "INVALID_INTENT_EMBEDDING", message: validation.errors.join("; ") } };
    }

    newPrimaryCluster = getPrimaryCluster(input.intent_embedding);
    newAffinities = computeClusterAffinities(input.intent_embedding);

    // Check active commitment when cluster changes in exclusive-commitment clusters
    const oldCluster = caller.primary_cluster;
    if (newPrimaryCluster !== oldCluster) {
      const newClusterConfig = getCluster(newPrimaryCluster);
      if (newClusterConfig?.exclusive_commitment) {
        const commitments = ctx.db
          .prepare(`SELECT COUNT(*) as count FROM candidates WHERE (user_a_token = ? OR user_b_token = ?) AND (stage_a >= 4 OR stage_b >= 4)`)
          .get(input.user_token, input.user_token) as { count: number };
        if (commitments.count > 0) {
          return { ok: false, error: { code: "ACTIVE_COMMITMENT", message: "Cannot change cluster with active commitments in an exclusive-commitment cluster" } };
        }
      }
    }
  }

  const updatedFields: string[] = [];
  const sets: string[] = [];
  const params: unknown[] = [];

  function addField(name: string, value: unknown, serialize = false) {
    if (value !== undefined) {
      sets.push(`${name} = ?`);
      params.push(serialize ? JSON.stringify(value) : value);
      updatedFields.push(name);
    }
  }

  addField("description", input.description);
  addField("seeking", input.seeking);
  addField("interests", input.interests, true);
  addField("values_text", input.values_text);
  addField("city", input.city);
  addField("age_range", input.age_range);
  addField("deal_breakers", input.deal_breakers, true);
  addField("media_refs", input.media_refs, true);
  addField("identity", input.identity, true);
  addField("status", input.status);
  addField("agent_model", input.agent_model);
  addField("intents", input.intents, true);
  addField("intent_tags", input.intent_tags, true);
  addField("structured_attributes", input.structured_attributes, true);

  if (input.embedding) {
    addField("embedding", input.embedding, true);
    sets.push("last_registered_at = datetime('now')");
  }
  if (input.intent_embedding) {
    addField("intent_embedding", input.intent_embedding, true);
    sets.push("primary_cluster = ?");
    params.push(newPrimaryCluster!);
    sets.push("cluster_affinities = ?");
    params.push(JSON.stringify(newAffinities!));
    updatedFields.push("primary_cluster", "cluster_affinities");
    if (!input.embedding) {
      sets.push("last_registered_at = datetime('now')");
    }
  }

  if (sets.length === 0) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "No fields to update" } };
  }

  sets.push("updated_at = datetime('now')");
  params.push(input.user_token);

  const updateUser = ctx.db.transaction(() => {
    ctx.db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE user_token = ?`).run(...params);

    // Update user_attributes table if structured_attributes changed
    if (input.structured_attributes) {
      ctx.db.prepare("DELETE FROM user_attributes WHERE user_token = ?").run(input.user_token);
      const insertAttr = ctx.db.prepare("INSERT OR REPLACE INTO user_attributes (user_token, attr_key, attr_value) VALUES (?, ?, ?)");
      for (const [key, value] of Object.entries(input.structured_attributes)) {
        if (Array.isArray(value)) {
          for (const v of value) insertAttr.run(input.user_token, key, String(v));
        } else if (value !== null && value !== undefined) {
          insertAttr.run(input.user_token, key, String(value));
        }
      }
    }
  });
  updateUser();

  return {
    ok: true,
    data: {
      updated: true,
      updated_fields: updatedFields,
      updated_at: new Date().toISOString(),
      scores_recomputing: !!input.recompute_scores,
      primary_cluster: newPrimaryCluster,
      cluster_affinities: newAffinities,
    },
  };
}
