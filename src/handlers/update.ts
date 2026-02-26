import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  Trait,
  Preference,
} from "../types.js";
import { validateIntentEmbedding } from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface UpdateInput {
  user_token: string;
  traits?: Trait[];
  remove_traits?: string[];            // trait keys to remove
  preferences?: Preference[];
  remove_preferences?: string[];       // trait_key values to remove
  text_profile?: {
    description?: string;
    seeking?: string;
    interests?: string[];
    values_text?: string;
  };
  intent_embedding?: number[];
  intents?: string[];
  personality_embedding?: number[];
  appearance_embedding?: number[];
  status?: "active" | "paused" | "delisted";
  funnel_mode?: "bilateral" | "broadcast" | "group" | "auction";
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
  group_size?: number;
  auto_fill?: boolean;
  group_deadline?: string;
}

export interface UpdateOutput {
  updated: true;
  trait_count: number;
  preference_count: number;
  profile_completeness: number;
  nl_parsed: null;
}

// ─── Helpers ───────────────────────────────────────────────────────

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

function estimateCompleteness(
  traitCount: number,
  preferenceCount: number,
  hasIntentEmbedding: boolean,
  hasTextProfile: boolean,
): number {
  let score = 0;
  score += Math.min(traitCount / 5, 1) * 0.4;
  score += Math.min(preferenceCount / 3, 1) * 0.2;
  if (hasIntentEmbedding) score += 0.2;
  if (hasTextProfile) score += 0.2;
  return Math.min(Math.round(score * 100) / 100, 1.0);
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleUpdate(
  input: UpdateInput,
  ctx: HandlerContext,
): Promise<HandlerResult<UpdateOutput>> {
  // ── Verify user exists ─────────────────────────────────────────
  const existingUser = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!existingUser) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Validate intent_embedding if provided ──────────────────────
  if (input.intent_embedding !== undefined) {
    const embeddingError = validateIntentEmbedding(input.intent_embedding);
    if (embeddingError) {
      return {
        ok: false,
        error: { code: "INVALID_INTENT_EMBEDDING", message: embeddingError },
      };
    }
  }

  // ── Validate status if provided ────────────────────────────────
  if (input.status !== undefined) {
    const validStatuses = ["active", "paused", "delisted"];
    if (!validStatuses.includes(input.status)) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `status must be one of: ${validStatuses.join(", ")}`,
        },
      };
    }
  }

  // ── Validate funnel_mode if provided ───────────────────────────
  if (input.funnel_mode !== undefined) {
    const validModes = ["bilateral", "broadcast", "group", "auction"];
    if (!validModes.includes(input.funnel_mode)) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `funnel_mode must be one of: ${validModes.join(", ")}`,
        },
      };
    }
  }

  // ── Validate traits if provided ────────────────────────────────
  const upsertTraits: Trait[] = input.traits ?? [];
  for (const trait of upsertTraits) {
    if (!valueTypeMatches(trait.value, trait.value_type)) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `Trait "${trait.key}": value_type "${trait.value_type}" does not match actual value type`,
        },
      };
    }
    if (trait.value_type === "enum" && (!trait.enum_values || trait.enum_values.length === 0)) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `Trait "${trait.key}": value_type "enum" requires enum_values`,
        },
      };
    }
  }

  // ── Validate preferences if provided ──────────────────────────
  const upsertPreferences: Preference[] = input.preferences ?? [];
  for (const pref of upsertPreferences) {
    if (pref.weight < 0.0 || pref.weight > 1.0) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `Preference for trait_key "${pref.trait_key}": weight ${pref.weight} is out of [0.0, 1.0] range`,
        },
      };
    }
  }

  // ── Compute final trait count after all changes ────────────────
  // Current trait count
  const currentTraitCount = (
    ctx.db
      .prepare("SELECT COUNT(*) as count FROM traits WHERE user_token = ?")
      .get(input.user_token) as { count: number }
  ).count;

  const removeTraitKeys = new Set(input.remove_traits ?? []);
  const upsertTraitKeys = new Set(upsertTraits.map((t) => t.key));

  // Current trait keys
  const currentTraitKeys = new Set(
    (
      ctx.db
        .prepare("SELECT key FROM traits WHERE user_token = ?")
        .all(input.user_token) as { key: string }[]
    ).map((r) => r.key),
  );

  // Simulate: remove, then upsert
  const afterRemove = new Set([...currentTraitKeys].filter((k) => !removeTraitKeys.has(k)));
  const afterUpsert = new Set([...afterRemove, ...upsertTraitKeys]);

  if (afterUpsert.size < 1) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "At least one trait must remain after the update",
      },
    };
  }

  // ── Execute atomic transaction ─────────────────────────────────
  const doUpdate = ctx.db.transaction(() => {
    // -- Process trait removals first
    if (removeTraitKeys.size > 0) {
      const removePlaceholders = [...removeTraitKeys].map(() => "?").join(", ");
      ctx.db
        .prepare(
          `DELETE FROM traits WHERE user_token = ? AND key IN (${removePlaceholders})`,
        )
        .run(input.user_token, ...[...removeTraitKeys]);
    }

    // -- Upsert traits
    const upsertTrait = ctx.db.prepare(
      `INSERT INTO traits (
        id, user_token, key, value, value_type, visibility, verification,
        display_name, category, enum_values, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT (user_token, key) DO UPDATE SET
        value = excluded.value,
        value_type = excluded.value_type,
        visibility = excluded.visibility,
        verification = excluded.verification,
        display_name = excluded.display_name,
        category = excluded.category,
        enum_values = excluded.enum_values,
        updated_at = datetime('now')`,
    );

    for (const trait of upsertTraits) {
      upsertTrait.run(
        randomUUID(),
        input.user_token,
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

    // -- Process preference removals
    const removePrefKeys = new Set(input.remove_preferences ?? []);
    if (removePrefKeys.size > 0) {
      const removePlaceholders = [...removePrefKeys].map(() => "?").join(", ");
      ctx.db
        .prepare(
          `DELETE FROM preferences WHERE user_token = ? AND trait_key IN (${removePlaceholders})`,
        )
        .run(input.user_token, ...[...removePrefKeys]);
    }

    // -- Upsert preferences
    const upsertPref = ctx.db.prepare(
      `INSERT INTO preferences (
        id, user_token, trait_key, operator, value, weight, label,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT (user_token, trait_key) DO UPDATE SET
        operator = excluded.operator,
        value = excluded.value,
        weight = excluded.weight,
        label = excluded.label,
        updated_at = datetime('now')`,
    );

    for (const pref of upsertPreferences) {
      upsertPref.run(
        randomUUID(),
        input.user_token,
        pref.trait_key,
        pref.operator,
        JSON.stringify(pref.value),
        pref.weight,
        pref.label ?? null,
      );
    }

    // -- Update user record fields that changed
    // Build SET clause dynamically for only the provided fields
    const updates: string[] = [];
    const updateValues: unknown[] = [];

    if (input.text_profile !== undefined) {
      updates.push("text_profile = ?");
      updateValues.push(JSON.stringify(input.text_profile));
    }
    if (input.intent_embedding !== undefined) {
      updates.push("intent_embedding = ?");
      updateValues.push(JSON.stringify(input.intent_embedding));
    }
    if (input.intents !== undefined) {
      updates.push("intents = ?");
      updateValues.push(JSON.stringify(input.intents));
    }
    if (input.personality_embedding !== undefined) {
      updates.push("personality_embedding = ?");
      updateValues.push(JSON.stringify(input.personality_embedding));
    }
    if (input.appearance_embedding !== undefined) {
      updates.push("appearance_embedding = ?");
      updateValues.push(JSON.stringify(input.appearance_embedding));
    }
    if (input.status !== undefined) {
      updates.push("status = ?");
      updateValues.push(input.status);
    }
    if (input.funnel_mode !== undefined) {
      updates.push("funnel_mode = ?");
      updateValues.push(input.funnel_mode);
    }
    if (input.identity !== undefined) {
      updates.push("identity = ?");
      updateValues.push(JSON.stringify(input.identity));
      if (input.identity.phone_hash !== undefined) {
        updates.push("phone_hash = ?");
        updateValues.push(input.identity.phone_hash);
      }
    }
    if (input.agent_model !== undefined) {
      updates.push("agent_model = ?");
      updateValues.push(input.agent_model);
    }
    if (input.agent_capabilities !== undefined) {
      updates.push("agent_capabilities = ?");
      updateValues.push(JSON.stringify(input.agent_capabilities));
    }
    if (input.agent_attestation !== undefined) {
      updates.push("agent_attestation = ?");
      updateValues.push(JSON.stringify(input.agent_attestation));
    }
    if (input.media_refs !== undefined) {
      updates.push("media_refs = ?");
      updateValues.push(JSON.stringify(input.media_refs));
    }
    if (input.auto_interest_opt_out !== undefined) {
      updates.push("auto_interest_opt_out = ?");
      updateValues.push(input.auto_interest_opt_out ? 1 : 0);
    }
    if (input.behavioral_inference_opt_out !== undefined) {
      updates.push("behavioral_inference_opt_out = ?");
      updateValues.push(input.behavioral_inference_opt_out ? 1 : 0);
    }
    if (input.group_size !== undefined) {
      updates.push("group_size = ?");
      updateValues.push(input.group_size);
    }
    if (input.auto_fill !== undefined) {
      updates.push("auto_fill = ?");
      updateValues.push(input.auto_fill ? 1 : 0);
    }
    if (input.group_deadline !== undefined) {
      updates.push("group_deadline = ?");
      updateValues.push(input.group_deadline);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      ctx.db
        .prepare(
          `UPDATE users SET ${updates.join(", ")} WHERE user_token = ?`,
        )
        .run(...updateValues, input.user_token);
    }
  });

  try {
    doUpdate();
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // ── Compute final counts ───────────────────────────────────────
  const finalTraitCount = (
    ctx.db
      .prepare("SELECT COUNT(*) as count FROM traits WHERE user_token = ?")
      .get(input.user_token) as { count: number }
  ).count;

  const finalPrefCount = (
    ctx.db
      .prepare("SELECT COUNT(*) as count FROM preferences WHERE user_token = ?")
      .get(input.user_token) as { count: number }
  ).count;

  // Read updated user to check for embeddings / text profile
  const updatedUser = ctx.db
    .prepare("SELECT intent_embedding, text_profile FROM users WHERE user_token = ?")
    .get(input.user_token) as { intent_embedding: string | null; text_profile: string | null };

  const profileCompleteness = estimateCompleteness(
    finalTraitCount,
    finalPrefCount,
    updatedUser.intent_embedding !== null,
    updatedUser.text_profile !== null,
  );

  return {
    ok: true,
    data: {
      updated: true,
      trait_count: finalTraitCount,
      preference_count: finalPrefCount,
      profile_completeness: profileCompleteness,
      nl_parsed: null,
    },
  };
}
