import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";
import { PROTOCOL_VERSION, DIMENSION_COUNT } from "../types.js";
import { validateIntentEmbedding, validateTraitEmbedding } from "../matching/intent.js";
import { computeClusterAffinities, getPrimaryCluster, CLUSTER_CENTROIDS } from "../clusters/centroids.js";
import { getCluster } from "../clusters/registry.js";

export interface RegisterInput {
  protocol_version: string;
  vertical_id?: string; // Legacy — maps to cluster
  role?: string;
  agent_model?: string;
  embedding_method?: string;
  embedding: number[];
  intent_embedding?: number[];
  intents?: string[];
  intent_tags?: Record<number, string[]>;
  city?: string;
  age_range?: string;
  intent?: string[]; // Legacy field
  interests?: string[];
  values_text?: string;
  description?: string;
  seeking?: string;
  identity?: { name: string; contact: string };
  deal_breakers?: Record<string, unknown>;
  structured_attributes?: Record<string, unknown>;
  verification_level?: "anonymous" | "verified" | "attested";
  phone_hash?: string;
  agent_attestation?: {
    model: string;
    method: string;
    interaction_hours: number;
    generated_at: string;
  };
  media_refs?: string[];
  user_token?: string;
  idempotency_key?: string;
  status?: "active" | "paused" | "delisted";
  agent_capabilities?: Array<{ capability: string; parameters?: Record<string, any>; confidence?: number }>;
  // Marketplace-specific fields (legacy compat)
  category?: string;
  condition?: "new" | "like-new" | "good" | "fair" | "parts";
  price_range?: { min_acceptable?: number; asking_price?: number };
  budget?: { max_price?: number; preferred_price?: number };
  location?: string;
  photos?: string[];
  shipping_options?: string[];
  item_attributes?: Record<string, unknown>;
}

export interface RegisterOutput {
  user_token: string;
  protocol_version: string;
  dimensions: number;
  primary_cluster: string;
  cluster_affinities: Record<string, number>;
}

export async function handleRegister(
  input: RegisterInput,
  ctx: HandlerContext
): Promise<HandlerResult<RegisterOutput>> {
  // Check idempotency
  if (input.idempotency_key) {
    const existing = ctx.db
      .prepare("SELECT response FROM idempotency_keys WHERE key = ? AND operation = 'register'")
      .get(input.idempotency_key) as { response: string } | undefined;
    if (existing) {
      return { ok: true, data: JSON.parse(existing.response) };
    }
  }

  if (input.protocol_version !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error: { code: "VERSION_MISMATCH", message: `Unsupported protocol version: ${input.protocol_version}. Expected: ${PROTOCOL_VERSION}` },
    };
  }

  // --- Resolve intent embedding ---
  let intentEmbedding: number[];
  if (input.intent_embedding) {
    const validation = validateIntentEmbedding(input.intent_embedding);
    if (!validation.valid) {
      return {
        ok: false,
        error: { code: "INVALID_INTENT_EMBEDDING", message: validation.errors.join("; ") },
      };
    }
    intentEmbedding = input.intent_embedding;
  } else if (input.vertical_id && CLUSTER_CENTROIDS[input.vertical_id]) {
    // Backward compat: use cluster centroid when no intent_embedding provided
    intentEmbedding = CLUSTER_CENTROIDS[input.vertical_id];
  } else {
    // Default to matchmaking centroid
    intentEmbedding = CLUSTER_CENTROIDS.matchmaking;
  }

  // Compute cluster assignment
  const primaryCluster = getPrimaryCluster(intentEmbedding);
  const clusterAffinities = computeClusterAffinities(intentEmbedding);
  const cluster = getCluster(primaryCluster);

  // Validate role
  const role = input.role ?? (cluster?.symmetric ? Object.keys(cluster.roles)[0] : "participant");
  if (cluster && !cluster.roles[role]) {
    return {
      ok: false,
      error: { code: "INVALID_ROLE", message: `Role '${role}' not valid for cluster '${primaryCluster}'. Available: ${Object.keys(cluster.roles).join(", ")}` },
    };
  }

  // --- Validate trait embedding ---
  // For marketplace with no real embedding, allow zeros
  const isMarketplace = primaryCluster === "marketplace";
  if (!isMarketplace) {
    const traitValidation = validateTraitEmbedding(input.embedding);
    if (!traitValidation.valid) {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: traitValidation.errors.join("; ") },
      };
    }
  } else if (!input.embedding || input.embedding.length === 0) {
    input.embedding = new Array(DIMENSION_COUNT).fill(0);
  }

  // --- Check active commitments on re-registration ---
  if (input.user_token && cluster?.exclusive_commitment) {
    const commitments = ctx.db
      .prepare(`
        SELECT COUNT(*) as count FROM candidates
        WHERE (user_a_token = ? OR user_b_token = ?)
          AND (stage_a >= 4 OR stage_b >= 4)
      `)
      .get(input.user_token, input.user_token) as { count: number };
    if (commitments.count > 0) {
      return {
        ok: false,
        error: { code: "ACTIVE_COMMITMENT", message: "Cannot re-register with active commitments in an exclusive-commitment cluster" },
      };
    }
  }

  // Validate agent_capabilities
  if (input.agent_capabilities && input.agent_capabilities.length > 50) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Maximum 50 agent capabilities allowed" } };
  }

  const token = input.user_token ?? randomUUID();
  const verticalId = input.vertical_id ?? primaryCluster;

  // Build marketplace data for legacy compat
  let marketplaceData: string | null = null;
  if (isMarketplace && (input.category || input.price_range || input.budget)) {
    marketplaceData = JSON.stringify({
      category: input.category,
      condition: input.condition,
      price_range: input.price_range,
      budget: input.budget,
      location: input.location,
    });
  }

  // Intents: merge legacy `intent` field with new `intents`
  const intents = input.intents ?? input.intent ?? [];

  const register = ctx.db.transaction(() => {
    // Re-registration: delete old record (CASCADE cleans up)
    if (input.user_token) {
      ctx.db.prepare("DELETE FROM users WHERE user_token = ?").run(input.user_token);
    }

    ctx.db
      .prepare(
        `INSERT INTO users (
          user_token, protocol_version, vertical_id, role, status,
          agent_model, embedding_method, embedding,
          intent_embedding, intents, intent_tags, primary_cluster, cluster_affinities,
          city, age_range, intent, interests, values_text, description, seeking,
          identity, deal_breakers, structured_attributes,
          verification_level, phone_hash, agent_attestation, media_refs,
          marketplace_data, last_registered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(
        token,
        PROTOCOL_VERSION,
        verticalId,
        role,
        input.status ?? "active",
        input.agent_model ?? null,
        input.embedding_method ?? null,
        JSON.stringify(input.embedding),
        JSON.stringify(intentEmbedding),
        JSON.stringify(intents),
        input.intent_tags ? JSON.stringify(input.intent_tags) : null,
        primaryCluster,
        JSON.stringify(clusterAffinities),
        input.city ?? null,
        input.age_range ?? null,
        JSON.stringify(intents), // legacy intent column
        input.interests ? JSON.stringify(input.interests) : null,
        input.values_text ?? null,
        input.description ?? null,
        input.seeking ?? null,
        input.identity ? JSON.stringify(input.identity) : null,
        input.deal_breakers ? JSON.stringify(input.deal_breakers) : null,
        input.structured_attributes ? JSON.stringify(input.structured_attributes) : null,
        input.verification_level ?? "anonymous",
        input.phone_hash ?? null,
        input.agent_attestation ? JSON.stringify(input.agent_attestation) : null,
        input.media_refs ? JSON.stringify(input.media_refs) : null,
        marketplaceData
      );

    // Store agent_capabilities
    if (input.agent_capabilities) {
      // Update users column
      ctx.db.prepare("UPDATE users SET agent_capabilities = ? WHERE user_token = ?")
        .run(JSON.stringify(input.agent_capabilities), token);
      // Populate normalized table
      const insertCap = ctx.db.prepare(
        "INSERT OR REPLACE INTO agent_capabilities (user_token, capability, parameters, confidence) VALUES (?, ?, ?, ?)"
      );
      for (const cap of input.agent_capabilities) {
        insertCap.run(token, cap.capability, cap.parameters ? JSON.stringify(cap.parameters) : null, cap.confidence ?? 1.0);
      }
    }

    // Populate user_attributes for structured attribute filtering
    if (input.structured_attributes) {
      const insertAttr = ctx.db.prepare(
        "INSERT OR REPLACE INTO user_attributes (user_token, attr_key, attr_value) VALUES (?, ?, ?)"
      );
      for (const [key, value] of Object.entries(input.structured_attributes)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            insertAttr.run(token, key, String(v));
          }
        } else if (value !== null && value !== undefined) {
          insertAttr.run(token, key, String(value));
        }
      }
    }
  });

  register();

  // Phase 17: Evaluate new registration against active subscriptions
  try {
    const activeSubs = ctx.db.prepare(
      "SELECT * FROM subscriptions WHERE status = 'active' AND expires_at > datetime('now') AND user_token != ?"
    ).all(token) as any[];

    for (const sub of activeSubs) {
      const subIntentEmb: number[] = JSON.parse(sub.intent_embedding);
      // Compute intent similarity
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < 16; i++) {
        dot += intentEmbedding[i] * subIntentEmb[i];
        normA += intentEmbedding[i] ** 2;
        normB += subIntentEmb[i] ** 2;
      }
      const intentSim = (normA > 0 && normB > 0) ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
      const combined = (intentSim + 1) / 2; // map to [0,1]

      if (combined < sub.threshold) continue;

      // Check hard_filters
      if (sub.hard_filters) {
        const filters = JSON.parse(sub.hard_filters);
        let pass = true;
        for (const [key, values] of Object.entries(filters)) {
          const valArr = Array.isArray(values) ? values : [values as string];
          const hasMatch = ctx.db.prepare(
            `SELECT 1 FROM user_attributes WHERE user_token = ? AND attr_key = ? AND attr_value IN (${valArr.map(() => "?").join(",")})`
          ).get(token, key, ...valArr);
          if (!hasMatch) { pass = false; break; }
        }
        if (!pass) continue;
      }

      // Check capability_filters
      if (sub.capability_filters) {
        const capFilters: string[] = JSON.parse(sub.capability_filters);
        let pass = true;
        for (const filter of capFilters) {
          const hasMatch = ctx.db.prepare(
            "SELECT 1 FROM agent_capabilities WHERE user_token = ? AND (capability = ? OR capability LIKE ?)"
          ).get(token, filter, filter + ":%");
          if (!hasMatch) { pass = false; break; }
        }
        if (!pass) continue;
      }

      // Check daily notification limit
      const today = new Date().toISOString().split("T")[0];
      if (sub.last_notification_date !== today) {
        ctx.db.prepare("UPDATE subscriptions SET notifications_today = 0, last_notification_date = ? WHERE id = ?").run(today, sub.id);
        sub.notifications_today = 0;
      }
      if (sub.notifications_today >= sub.max_notifications_per_day) continue;

      // Create notification
      const genUUID = randomUUID;
      ctx.db.prepare(
        "INSERT INTO subscription_notifications (id, subscription_id, matched_user_token, combined_score, intent_similarity) VALUES (?, ?, ?, ?, ?)"
      ).run(genUUID(), sub.id, token, combined, intentSim);
      ctx.db.prepare("UPDATE subscriptions SET notifications_today = notifications_today + 1 WHERE id = ?").run(sub.id);
    }
  } catch (_) {
    // Subscription evaluation is best-effort; don't fail registration
  }

  const result: RegisterOutput = {
    user_token: token,
    protocol_version: PROTOCOL_VERSION,
    dimensions: DIMENSION_COUNT,
    primary_cluster: primaryCluster,
    cluster_affinities: clusterAffinities,
  };

  if (input.idempotency_key) {
    ctx.db
      .prepare("INSERT OR REPLACE INTO idempotency_keys (key, operation, user_token, response) VALUES (?, ?, ?, ?)")
      .run(input.idempotency_key, "register", token, JSON.stringify(result));
  }

  return { ok: true, data: result };
}
