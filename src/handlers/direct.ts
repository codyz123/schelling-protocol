import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
} from "../types.js";
import { Stage, otherToken } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface DirectInput {
  user_token: string;
  candidate_id: string;
  contact_info: string;
  idempotency_key?: string;
}

export interface DirectOutput {
  shared: true;
  mutual: boolean;
  their_contact: string | null;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleDirect(
  input: DirectInput,
  ctx: HandlerContext,
): Promise<HandlerResult<DirectOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<DirectOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

  // ── Validate contact_info length ───────────────────────────────
  if (!input.contact_info || input.contact_info.length > 500) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Contact info must be between 1 and 500 characters",
      },
    };
  }

  // ── Verify user exists and is active ──────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  if (caller.status === "paused") {
    return {
      ok: false,
      error: { code: "USER_PAUSED", message: "Your account is paused" },
    };
  }

  if (caller.status === "delisted") {
    return {
      ok: false,
      error: { code: "USER_SUSPENDED", message: "Your account is suspended" },
    };
  }

  // ── Verify candidate pair exists and user is a participant ─────
  const candidate = ctx.db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(input.candidate_id) as CandidateRecord | undefined;

  if (!candidate) {
    return {
      ok: false,
      error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate pair not found" },
    };
  }

  if (
    input.user_token !== candidate.user_a_token &&
    input.user_token !== candidate.user_b_token
  ) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "You are not a participant in this candidate pair" },
    };
  }

  // ── Both parties must be at CONNECTED (stage 4) ────────────────
  if (candidate.stage_a < Stage.CONNECTED || candidate.stage_b < Stage.CONNECTED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: "Both parties must be at CONNECTED stage to share direct contact info",
      },
    };
  }

  // ── INSERT OR REPLACE caller's contact info ────────────────────
  const otherUserToken = otherToken(input.user_token, candidate);

  ctx.db
    .prepare(
      `INSERT INTO direct_contacts (id, candidate_id, user_token, contact_info, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(candidate_id, user_token) DO UPDATE SET
         contact_info = excluded.contact_info,
         created_at = excluded.created_at`,
    )
    .run(randomUUID(), input.candidate_id, input.user_token, input.contact_info);

  // ── Check if the other party also shared contact info ──────────
  const otherContact = ctx.db
    .prepare(
      "SELECT contact_info FROM direct_contacts WHERE candidate_id = ? AND user_token = ?",
    )
    .get(input.candidate_id, otherUserToken) as { contact_info: string } | undefined;

  const mutual = !!otherContact;

  // ── Build result ───────────────────────────────────────────────
  const result: DirectOutput = {
    shared: true,
    mutual,
    their_contact: mutual ? otherContact!.contact_info : null,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "direct", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
