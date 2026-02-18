import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";
import { PROTOCOL_VERSION, DIMENSION_COUNT } from "../types.js";
import { validateEmbedding } from "../matching/privacy.js";
import { getVertical } from "../verticals/registry.js";

export interface RegisterInput {
  protocol_version: string;
  vertical_id?: string;
  role?: string; // Role within the vertical (seller/buyer for marketplace, seeker for matchmaking)
  agent_model?: string;
  embedding_method?: string;
  embedding: number[];
  city: string;
  age_range: string;
  intent: string[];
  interests?: string[];
  values_text?: string;
  description?: string;
  seeking?: string;
  identity?: { name: string; contact: string };
  deal_breakers?: {
    no_smoking?: boolean;
    no_pets?: boolean;
    max_distance_miles?: number;
  };
  // v2 identity tier additions
  verification_level?: "anonymous" | "verified" | "attested";
  phone_hash?: string;
  agent_attestation?: {
    model: string;
    method: string;
    interaction_hours: number;
    generated_at: string;
  };
  user_token?: string;
  idempotency_key?: string;
  status?: "active" | "paused" | "delisted"; // For marketplace pause/delist functionality
  
  // Marketplace-specific fields
  category?: string;
  condition?: "new" | "like-new" | "good" | "fair" | "parts";
  price_range?: {
    min_acceptable?: number;
    asking_price?: number;
  };
  budget?: {
    max_price?: number;
    preferred_price?: number;
  };
  location?: string;
  photos?: string[];
  shipping_options?: string[];
  item_attributes?: Record<string, any>;
}

export interface RegisterOutput {
  user_token: string;
  protocol_version: string;
  dimensions: number;
}

export async function handleRegister(
  input: RegisterInput,
  ctx: HandlerContext
): Promise<HandlerResult<RegisterOutput>> {
  const verticalId = input.vertical_id ?? 'matchmaking';
  
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
      error: {
        code: "VERSION_MISMATCH",
        message: `Unsupported protocol version: ${input.protocol_version}. Expected: ${PROTOCOL_VERSION}`,
      },
    };
  }

  // Get vertical configuration and validate role
  const vertical = getVertical(verticalId);
  if (!vertical && verticalId !== "matchmaking") {
    return {
      ok: false,
      error: { code: "INVALID_VERTICAL", message: `Vertical ${verticalId} not found` }
    };
  }

  // Validate role for the vertical
  const role = input.role ?? (verticalId === "matchmaking" ? "seeker" : "seller"); // Default role
  if (vertical && !vertical.roles[role]) {
    return {
      ok: false,
      error: { 
        code: "INVALID_ROLE", 
        message: `Role '${role}' is not valid for vertical '${verticalId}'. Available roles: ${Object.keys(vertical.roles).join(", ")}` 
      }
    };
  }

  // Validate required fields for the role
  if (vertical) {
    const roleConfig = vertical.roles[role];
    for (const field of roleConfig.required_fields) {
      if (!(field in input) || input[field as keyof RegisterInput] === undefined) {
        return {
          ok: false,
          error: { 
            code: "MISSING_REQUIRED_FIELD", 
            message: `Missing required field '${field}' for role '${role}' in vertical '${verticalId}'` 
          }
        };
      }
    }
  }

  // For marketplace, allow empty embedding or array of zeros
  if (verticalId === "marketplace") {
    if (!input.embedding) {
      input.embedding = [0]; // Provide minimal embedding
    } else if (input.embedding.some(v => v !== 0)) {
      return {
        ok: false,
        error: { 
          code: "INVALID_INPUT", 
          message: "Marketplace vertical does not use embeddings. Provide an array of zeros or omit." 
        }
      };
    }
  }

  // For matchmaking, validate embedding
  if (verticalId === "matchmaking") {
    const embeddingError = validateEmbedding(input.embedding);
    if (embeddingError) {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: embeddingError },
      };
    }
  }

  const token = input.user_token ?? randomUUID();

  // Build marketplace-specific data for storage
  let marketplaceData = null;
  if (verticalId === "marketplace") {
    marketplaceData = {
      category: input.category,
      condition: input.condition,
      // Normalize price_range structure for scoring function
      price_range: input.price_range ? {
        min: input.price_range.min_acceptable || 0,
        max: input.price_range.asking_price || 0,
        asking: input.price_range.asking_price || 0
      } : null,
      // Normalize budget structure for scoring function  
      budget: input.budget ? {
        min: 0,
        max: input.budget.max_price || 0
      } : null,
      location: input.location,
      description: input.description,
      urgency: input.urgency,
      preferences: input.preferences,
      condition_minimum: input.condition_minimum,
      item_attributes: input.item_attributes,
    };
  }

  const register = ctx.db.transaction(() => {
    // If re-registering, delete first (CASCADE cleans up candidates, declines, outcomes)
    if (input.user_token) {
      ctx.db
        .prepare("DELETE FROM users WHERE user_token = ?")
        .run(input.user_token);
    }

    ctx.db
      .prepare(
        `INSERT INTO users (
          user_token, protocol_version, vertical_id, role, status, agent_model, embedding_method,
          embedding, city, age_range, intent,
          interests, values_text, description, seeking, identity, deal_breakers,
          verification_level, phone_hash, agent_attestation, media_refs, marketplace_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        token,
        input.protocol_version,
        verticalId,
        role,
        input.status ?? "active",
        input.agent_model ?? null,
        input.embedding_method ?? null,
        JSON.stringify(input.embedding || []),
        input.city ?? null,
        input.age_range ?? null,
        JSON.stringify(input.intent ?? []),
        input.interests ? JSON.stringify(input.interests) : null,
        input.values_text ?? null,
        input.description ?? null,
        input.seeking ?? null,
        input.identity ? JSON.stringify(input.identity) : null,
        input.deal_breakers ? JSON.stringify(input.deal_breakers) : null,
        input.verification_level ?? "anonymous",
        input.phone_hash ?? null,
        input.agent_attestation ? JSON.stringify(input.agent_attestation) : null,
        input.media_refs ? JSON.stringify(input.media_refs) : null,
        marketplaceData ? JSON.stringify(marketplaceData) : null
      );
  });

  register();

  const result: RegisterOutput = {
    user_token: token,
    protocol_version: PROTOCOL_VERSION,
    dimensions: DIMENSION_COUNT,
  };

  // Store idempotency key if provided
  if (input.idempotency_key) {
    ctx.db
      .prepare("INSERT OR REPLACE INTO idempotency_keys (key, operation, user_token, response) VALUES (?, ?, ?, ?)")
      .run(input.idempotency_key, 'register', token, JSON.stringify(result));
  }

  return {
    ok: true,
    data: result,
  };
}
