import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
} from "../types.js";
import { Stage, otherToken } from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface RelayBlockInput {
  user_token: string;
  candidate_id: string;
  blocked: boolean;
}

export interface RelayBlockOutput {
  blocked: boolean;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleRelayBlock(
  input: RelayBlockInput,
  ctx: HandlerContext,
): Promise<HandlerResult<RelayBlockOutput>> {
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
        message: "Both parties must be at CONNECTED stage to manage relay blocks",
      },
    };
  }

  // ── Block or unblock ───────────────────────────────────────────
  const otherUserToken = otherToken(input.user_token, candidate);

  if (input.blocked) {
    // INSERT OR REPLACE block record
    ctx.db
      .prepare(
        `INSERT INTO relay_blocks (id, candidate_id, blocker_token, blocked_token, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(candidate_id, blocker_token) DO UPDATE SET
           blocked_token = excluded.blocked_token,
           created_at = excluded.created_at`,
      )
      .run(randomUUID(), input.candidate_id, input.user_token, otherUserToken);
  } else {
    // DELETE block record
    ctx.db
      .prepare(
        "DELETE FROM relay_blocks WHERE candidate_id = ? AND blocker_token = ?",
      )
      .run(input.candidate_id, input.user_token);
  }

  return {
    ok: true,
    data: { blocked: input.blocked },
  };
}
