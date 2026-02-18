import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";
import { PROTOCOL_VERSION, DIMENSION_COUNT } from "../types.js";
import { validateEmbedding } from "../matching/privacy.js";

export interface RegisterInput {
  protocol_version: string;
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
  user_token?: string;
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
          user_token, protocol_version, agent_model, embedding_method,
          embedding, city, age_range, intent,
          interests, values_text, description, seeking, identity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        token,
        input.protocol_version,
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
        input.identity ? JSON.stringify(input.identity) : null
      );
  });

  register();

  return {
    ok: true,
    data: {
      user_token: token,
      protocol_version: PROTOCOL_VERSION,
      dimensions: DIMENSION_COUNT,
    },
  };
}
