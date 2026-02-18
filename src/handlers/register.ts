import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";
import { PROTOCOL_VERSION, DIMENSION_COUNT } from "../types.js";
import { validateEmbedding } from "../matching/privacy.js";

export interface RegisterInput {
  protocol_version: string;
  vertical_id?: string;
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

  const embeddingError = validateEmbedding(input.embedding);
  if (embeddingError) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: embeddingError },
    };
  }

  const token = input.user_token ?? randomUUID();

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
          user_token, protocol_version, vertical_id, agent_model, embedding_method,
          embedding, city, age_range, intent,
          interests, values_text, description, seeking, identity, deal_breakers,
          verification_level, phone_hash, agent_attestation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        token,
        input.protocol_version,
        verticalId,
        input.agent_model ?? null,
        input.embedding_method ?? null,
        JSON.stringify(input.embedding),
        input.city,
        input.age_range,
        JSON.stringify(input.intent),
        input.interests ? JSON.stringify(input.interests) : null,
        input.values_text ?? null,
        input.description ?? null,
        input.seeking ?? null,
        input.identity ? JSON.stringify(input.identity) : null,
        input.deal_breakers ? JSON.stringify(input.deal_breakers) : null,
        input.verification_level ?? "anonymous",
        input.phone_hash ?? null,
        input.agent_attestation ? JSON.stringify(input.agent_attestation) : null
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
