import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult, Trait, Preference } from "../types.js";
import { PROTOCOL_VERSION, isValidClusterId, validateIntentEmbedding } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface RegisterInput {
  protocol_version: string;
  cluster_id: string;
  role?: string;
  funnel_mode?: "bilateral" | "broadcast" | "group" | "auction";
  group_size?: number;
  auto_fill?: boolean;
  group_deadline?: string;
  traits?: Trait[];
  natural_language?: string;
  preferences?: Preference[];
  intent_embedding?: number[];
  intents?: string[];
  personality_embedding?: number[];
  appearance_embedding?: number[];
  text_profile?: {
    description?: string;
    seeking?: string;
    interests?: string[];
    values_text?: string;
  };
  identity?: {
    name?: string;
    contact?: string;
    phone_hash?: string;
  };
  agent_model?: string;
  agent_capabilities?: unknown[];
  agent_attestation?: {
    model: string;
    method: string;
    interaction_hours: number;
    generated_at: string;
  };
  media_refs?: string[];
  auto_interest_opt_out?: boolean;
  behavioral_inference_opt_out?: boolean;
  user_token?: string;       // Present for re-registration
  idempotency_key?: string;
}

export interface RegisterOutput {
  user_token: string;
  protocol_version: "3.0";
  cluster_id: string;
  cluster_created: boolean;
  trait_count: number;
  preference_count: number;
  profile_completeness: number;
  suggested_additions: string[];
  nl_parsed: null;
}

// ─── Helpers ───────────────────────────────────────────────────────

function clusterPhase(population: number): "nascent" | "growing" | "active" | "popular" {
  if (population >= 500) return "popular";
  if (population >= 50) return "active";
  if (population >= 10) return "growing";
  return "nascent";
}

function clusterDisplayName(clusterId: string): string {
  return clusterId
    .split(".")
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(" > ");
}

function valueTypeMatches(
  value: string | number | boolean | string[],
  value_type: string,
): boolean {
  switch (value_type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "enum": return typeof value === "string";
    case "array": return Array.isArray(value);
    default: return false;
  }
}

/**
 * Rough completeness estimate: rewards having traits, preferences,
 * an intent_embedding, and a text_profile.
 */
function estimateCompleteness(
  traitCount: number,
  preferenceCount: number,
  hasIntentEmbedding: boolean,
  hasTextProfile: boolean,
): number {
  let score = 0;
  // Traits: up to 0.4 (saturates at 5 traits)
  score += Math.min(traitCount / 5, 1) * 0.4;
  // Preferences: up to 0.2 (saturates at 3 preferences)
  score += Math.min(preferenceCount / 3, 1) * 0.2;
  // Intent embedding: 0.2
  if (hasIntentEmbedding) score += 0.2;
  // Text profile: 0.2
  if (hasTextProfile) score += 0.2;
  return Math.min(Math.round(score * 100) / 100, 1.0);
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleRegister(
  input: RegisterInput,
  ctx: HandlerContext,
): Promise<HandlerResult<RegisterOutput>> {
  // ── Idempotency check ──────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<RegisterOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

  // ── Validate protocol_version ──────────────────────────────────
  if (input.protocol_version !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error: {
        code: "VERSION_MISMATCH",
        message: `Unsupported protocol version: ${input.protocol_version}. Expected: ${PROTOCOL_VERSION}`,
        hint: 'Include "protocol_version": "3.0" in your request body. Or use quick_seek/quick_offer which handle this automatically.',
      },
    };
  }

  // ── Validate cluster_id ────────────────────────────────────────
  if (!isValidClusterId(input.cluster_id)) {
    return {
      ok: false,
      error: {
        code: "INVALID_CLUSTER_ID",
        message: `Invalid cluster_id: "${input.cluster_id}". Must match [a-z0-9]+(\.[a-z0-9]+)*, max 5 segments, max 255 chars total.`,
      },
    };
  }

  // ── At least one trait required ────────────────────────────────
  const traits: Trait[] = input.traits ?? [];
  const hasNaturalLanguage = typeof input.natural_language === "string" && input.natural_language.trim().length > 0;

  if (traits.length === 0 && !hasNaturalLanguage) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "At least one trait is required (provide traits[] or natural_language).",
      },
    };
  }

  // ── Trait key uniqueness ───────────────────────────────────────
  const traitKeys = traits.map((t) => t.key);
  const uniqueKeys = new Set(traitKeys);
  if (uniqueKeys.size !== traitKeys.length) {
    const dupes = traitKeys.filter((k, i) => traitKeys.indexOf(k) !== i);
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: `Duplicate trait keys: ${[...new Set(dupes)].join(", ")}.`,
      },
    };
  }

  // ── Validate trait value_type consistency ──────────────────────
  for (const trait of traits) {
    if (!valueTypeMatches(trait.value, trait.value_type)) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `Trait "${trait.key}": value_type "${trait.value_type}" does not match actual value type.`,
        },
      };
    }
    if (trait.value_type === "enum" && (!trait.enum_values || trait.enum_values.length === 0)) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `Trait "${trait.key}": value_type "enum" requires enum_values to be provided.`,
        },
      };
    }
  }

  // ── Validate preferences ───────────────────────────────────────
  const preferences: Preference[] = input.preferences ?? [];
  for (const pref of preferences) {
    if (pref.weight < 0.0 || pref.weight > 1.0) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `Preference for trait_key "${pref.trait_key}": weight ${pref.weight} is out of [0.0, 1.0] range.`,
        },
      };
    }
  }

  // ── Validate intent_embedding ──────────────────────────────────
  if (input.intent_embedding !== undefined) {
    const embeddingError = validateIntentEmbedding(input.intent_embedding);
    if (embeddingError) {
      return {
        ok: false,
        error: {
          code: "INVALID_INTENT_EMBEDDING",
          message: embeddingError,
        },
      };
    }
  }

  // ── Validate funnel_mode ───────────────────────────────────────
  const funnelMode = input.funnel_mode ?? "bilateral";
  const validFunnelModes = ["bilateral", "broadcast", "group", "auction"];
  if (!validFunnelModes.includes(funnelMode)) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: `funnel_mode must be one of: ${validFunnelModes.join(", ")}.`,
      },
    };
  }

  // ── Validate group_size when funnel_mode=group ─────────────────
  if (funnelMode === "group") {
    if (input.group_size === undefined || input.group_size === null) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `group_size is required when funnel_mode is "group".`,
        },
      };
    }
    if (!Number.isInteger(input.group_size) || input.group_size < 2 || input.group_size > 50) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `group_size must be an integer between 2 and 50 (got ${input.group_size}).`,
        },
      };
    }
  }

  // ── Resolve user_token (re-registration vs new) ────────────────
  const isReRegistration = !!input.user_token;
  let userToken: string;

  if (isReRegistration) {
    const existing = ctx.db
      .prepare("SELECT user_token FROM users WHERE user_token = ?")
      .get(input.user_token) as { user_token: string } | undefined;

    if (!existing) {
      return {
        ok: false,
        error: {
          code: "USER_NOT_FOUND",
          message: `No user found with user_token "${input.user_token}". Omit user_token to create a new registration.`,
        },
      };
    }
    userToken = input.user_token!;
  } else {
    userToken = randomUUID();
  }

  // ── Execute atomic transaction ─────────────────────────────────
  let clusterCreated = false;

  const run = ctx.db.transaction(() => {
    // -- Cluster: check existence or create implicitly
    const existingCluster = ctx.db
      .prepare("SELECT cluster_id FROM clusters WHERE cluster_id = ?")
      .get(input.cluster_id) as { cluster_id: string } | undefined;

    if (!existingCluster) {
      clusterCreated = true;
      const ageRestricted = input.cluster_id.startsWith("dating.") ? 1 : 0;
      const displayName = clusterDisplayName(input.cluster_id);
      ctx.db
        .prepare(
          `INSERT INTO clusters (
            cluster_id, display_name, created_by, age_restricted,
            population, phase, created_at, last_activity
          ) VALUES (?, ?, ?, ?, 0, 'nascent', datetime('now'), datetime('now'))`,
        )
        .run(input.cluster_id, displayName, userToken, ageRestricted);
    }

    // -- Re-registration: delete old traits and preferences (user row re-inserted below)
    if (isReRegistration) {
      ctx.db.prepare("DELETE FROM traits WHERE user_token = ?").run(userToken);
      ctx.db.prepare("DELETE FROM preferences WHERE user_token = ?").run(userToken);
      ctx.db.prepare("DELETE FROM users WHERE user_token = ?").run(userToken);
    }

    // -- Insert user
    ctx.db
      .prepare(
        `INSERT INTO users (
          user_token, protocol_version, cluster_id, role,
          funnel_mode, group_size, auto_fill, group_deadline,
          intent_embedding, intents,
          personality_embedding, appearance_embedding,
          text_profile, identity, phone_hash,
          agent_model, agent_capabilities, agent_attestation,
          media_refs,
          auto_interest_opt_out, behavioral_inference_opt_out,
          status, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?,
          ?, ?,
          'active', datetime('now'), datetime('now')
        )`,
      )
      .run(
        userToken,
        PROTOCOL_VERSION,
        input.cluster_id,
        input.role ?? null,
        funnelMode,
        input.group_size ?? null,
        input.auto_fill !== undefined ? (input.auto_fill ? 1 : 0) : 1,
        input.group_deadline ?? null,
        input.intent_embedding ? JSON.stringify(input.intent_embedding) : null,
        input.intents ? JSON.stringify(input.intents) : null,
        input.personality_embedding ? JSON.stringify(input.personality_embedding) : null,
        input.appearance_embedding ? JSON.stringify(input.appearance_embedding) : null,
        input.text_profile ? JSON.stringify(input.text_profile) : null,
        input.identity ? JSON.stringify(input.identity) : null,
        input.identity?.phone_hash ?? null,
        input.agent_model ?? null,
        input.agent_capabilities ? JSON.stringify(input.agent_capabilities) : null,
        input.agent_attestation ? JSON.stringify(input.agent_attestation) : null,
        input.media_refs ? JSON.stringify(input.media_refs) : null,
        input.auto_interest_opt_out ? 1 : 0,
        input.behavioral_inference_opt_out ? 1 : 0,
      );

    // -- Insert traits
    const insertTrait = ctx.db.prepare(
      `INSERT INTO traits (
        id, user_token, key, value, value_type, visibility, verification,
        display_name, category, enum_values, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    );

    for (const trait of traits) {
      insertTrait.run(
        randomUUID(),
        userToken,
        trait.key,
        JSON.stringify(trait.value),
        trait.value_type,
        trait.visibility ?? "public",
        trait.verification ?? "unverified",
        trait.display_name ?? null,
        trait.category ?? null,
        trait.enum_values ? JSON.stringify(trait.enum_values) : null,
      );
    }

    // -- Insert preferences
    const insertPref = ctx.db.prepare(
      `INSERT INTO preferences (
        id, user_token, trait_key, operator, value, weight, label,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    );

    for (const pref of preferences) {
      insertPref.run(
        randomUUID(),
        userToken,
        pref.trait_key,
        pref.operator,
        JSON.stringify(pref.value),
        pref.weight,
        pref.label ?? null,
      );
    }

    // -- Update cluster: increment population, update last_activity, recalculate phase
    ctx.db
      .prepare(
        `UPDATE clusters
         SET population = population + 1,
             last_activity = datetime('now')
         WHERE cluster_id = ?`,
      )
      .run(input.cluster_id);

    const { population: newPop } = ctx.db
      .prepare("SELECT population FROM clusters WHERE cluster_id = ?")
      .get(input.cluster_id) as { population: number };

    ctx.db
      .prepare("UPDATE clusters SET phase = ? WHERE cluster_id = ?")
      .run(clusterPhase(newPop), input.cluster_id);

    // -- Update cluster_norms for each trait provided
    const upsertNorm = ctx.db.prepare(
      `INSERT INTO cluster_norms (
        id, cluster_id, trait_key, value_type, enum_values, display_name,
        frequency, signal_strength, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))
      ON CONFLICT (cluster_id, trait_key) DO UPDATE SET
        frequency = frequency + 1,
        value_type = COALESCE(excluded.value_type, value_type),
        enum_values = COALESCE(excluded.enum_values, enum_values),
        display_name = COALESCE(excluded.display_name, display_name),
        updated_at = datetime('now')`,
    );

    for (const trait of traits) {
      upsertNorm.run(
        randomUUID(),
        input.cluster_id,
        trait.key,
        trait.value_type,
        trait.enum_values ? JSON.stringify(trait.enum_values) : null,
        trait.display_name ?? null,
      );
    }
  });

  try {
    run();
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // ── Compute suggested_additions ────────────────────────────────
  // Trait keys present in cluster_norms but not in this user's traits
  const userTraitKeys = new Set(traits.map((t) => t.key));
  const normRows = ctx.db
    .prepare(
      `SELECT trait_key FROM cluster_norms
       WHERE cluster_id = ?
       ORDER BY frequency DESC
       LIMIT 20`,
    )
    .all(input.cluster_id) as { trait_key: string }[];

  const suggestedAdditions = normRows
    .map((r) => r.trait_key)
    .filter((k) => !userTraitKeys.has(k));

  // ── Build result ───────────────────────────────────────────────
  const result: RegisterOutput = {
    user_token: userToken,
    protocol_version: "3.0",
    cluster_id: input.cluster_id,
    cluster_created: clusterCreated,
    trait_count: traits.length,
    preference_count: preferences.length,
    profile_completeness: estimateCompleteness(
      traits.length,
      preferences.length,
      input.intent_embedding !== undefined,
      input.text_profile !== undefined,
    ),
    suggested_additions: suggestedAdditions,
    nl_parsed: null,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "register", userToken, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
