import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
  TraitRecord,
} from "../types.js";
import { Stage, callerSide, otherToken } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface VerifySubmitInput {
  user_token: string;
  action: "submit";
  trait_key: string;
  evidence_type: "photo" | "document" | "link" | "attestation";
  evidence_data: string;
  requested_tier: "self_verified" | "cross_verified" | "authority_verified";
  idempotency_key?: string;
}

export interface VerifyRequestInput {
  user_token: string;
  action: "request";
  candidate_id: string;
  trait_key: string;
  idempotency_key?: string;
}

export type VerifyInput = VerifySubmitInput | VerifyRequestInput;

export interface VerifySubmitOutput {
  verification_id: string;
  status: string;
  current_tier: string | null;
}

export interface VerifyRequestOutput {
  requested: true;
  request_id: string;
}

export type VerifyOutput = VerifySubmitOutput | VerifyRequestOutput;

// ─── Handler ───────────────────────────────────────────────────────

export async function handleVerify(
  input: VerifyInput,
  ctx: HandlerContext,
): Promise<HandlerResult<VerifyOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<VerifyOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
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

  // ── Validate action ────────────────────────────────────────────
  if (input.action !== "submit" && input.action !== "request") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "action must be 'submit' or 'request'" },
    };
  }

  if (input.action === "submit") {
    return handleVerifySubmit(input as VerifySubmitInput, ctx, caller);
  } else {
    return handleVerifyRequest(input as VerifyRequestInput, ctx, caller);
  }
}

// ─── Submit Action ─────────────────────────────────────────────────

async function handleVerifySubmit(
  input: VerifySubmitInput,
  ctx: HandlerContext,
  caller: UserRecord,
): Promise<HandlerResult<VerifyOutput>> {
  // ── Validate evidence_type ─────────────────────────────────────
  const validTypes = ["photo", "document", "link", "attestation"];
  if (!validTypes.includes(input.evidence_type)) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "evidence_type must be one of: photo, document, link, attestation" },
    };
  }

  // ── Validate requested_tier ────────────────────────────────────
  const validTiers = ["self_verified", "cross_verified", "authority_verified"];
  if (!validTiers.includes(input.requested_tier)) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "requested_tier must be one of: self_verified, cross_verified, authority_verified" },
    };
  }

  // ── Validate evidence_data size (max 10MB) ─────────────────────
  if (!input.evidence_data || input.evidence_data.length > 10 * 1024 * 1024) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "evidence_data is required and must be at most 10MB" },
    };
  }

  // ── No stage gating for submit. Verify trait exists for user ───
  const trait = ctx.db
    .prepare("SELECT * FROM traits WHERE user_token = ? AND key = ?")
    .get(input.user_token, input.trait_key) as TraitRecord | undefined;

  if (!trait) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: `Trait '${input.trait_key}' not found for this user` },
    };
  }

  // ── Determine status and current_tier ──────────────────────────
  // self_verified: auto-approve
  // cross_verified/authority_verified: set to pending
  const now = Date.now();
  const expiresAt = now + 365 * 24 * 60 * 60 * 1000; // 1 year from now

  let status: string;
  let currentTier: string | null = null;

  if (input.requested_tier === "self_verified") {
    status = "approved";
    currentTier = "self_verified";
  } else {
    status = "pending";
    currentTier = null;
  }

  const verificationId = randomUUID();

  ctx.db
    .prepare(
      `INSERT INTO verifications (
        id, user_token, trait_key, action, evidence_type, evidence_data,
        requested_tier, status, current_tier, created_at, expires_at
      ) VALUES (?, ?, ?, 'submit', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      verificationId,
      input.user_token,
      input.trait_key,
      input.evidence_type,
      input.evidence_data,
      input.requested_tier,
      status,
      currentTier,
      now,
      expiresAt,
    );

  // ── If approved (self_verified), update the trait's verification field ─
  if (status === "approved" && currentTier) {
    ctx.db
      .prepare(
        "UPDATE traits SET verification = ?, updated_at = datetime('now') WHERE user_token = ? AND key = ?",
      )
      .run(currentTier, input.user_token, input.trait_key);
  }

  // ── Build result ───────────────────────────────────────────────
  const result: VerifySubmitOutput = {
    verification_id: verificationId,
    status,
    current_tier: currentTier,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "verify_submit", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── Request Action ────────────────────────────────────────────────

async function handleVerifyRequest(
  input: VerifyRequestInput,
  ctx: HandlerContext,
  caller: UserRecord,
): Promise<HandlerResult<VerifyOutput>> {
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

  // ── Stage gating: both at INTERESTED+ ──────────────────────────
  const side = callerSide(input.user_token, candidate);
  const yourStage = side === "a" ? candidate.stage_a : candidate.stage_b;
  const theirStage = side === "a" ? candidate.stage_b : candidate.stage_a;

  if (yourStage < Stage.INTERESTED || theirStage < Stage.INTERESTED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: "Both parties must be at INTERESTED stage or higher to request verification",
      },
    };
  }

  // ── Determine the other party ──────────────────────────────────
  const otherUserToken = otherToken(input.user_token, candidate);

  // ── Insert verification record for the request ─────────────────
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days from now
  const verificationId = randomUUID();

  ctx.db
    .prepare(
      `INSERT INTO verifications (
        id, user_token, candidate_id, trait_key, action,
        requested_from, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, 'request', ?, 'pending', ?, ?)`,
    )
    .run(
      verificationId,
      input.user_token,
      input.candidate_id,
      input.trait_key,
      otherUserToken,
      now,
      expiresAt,
    );

  // ── Insert pending_action for the other party ──────────────────
  const actionId = randomUUID();

  ctx.db
    .prepare(
      `INSERT INTO pending_actions (id, user_token, candidate_id, action_type, details, created_at)
       VALUES (?, ?, ?, 'verification_request', ?, datetime('now'))`,
    )
    .run(
      actionId,
      otherUserToken,
      input.candidate_id,
      JSON.stringify({
        verification_id: verificationId,
        trait_key: input.trait_key,
        requested_by: input.user_token,
      }),
    );

  // ── Build result ───────────────────────────────────────────────
  const result: VerifyRequestOutput = {
    requested: true,
    request_id: verificationId,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "verify_request", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
