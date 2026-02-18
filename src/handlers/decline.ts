import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  FeedbackData,
} from "../types.js";
import { callerSide, otherToken } from "../types.js";
import { getCluster } from "../clusters/registry.js";

export interface DeclineInput {
  user_token: string;
  candidate_id: string;
  reason?: string;
  feedback?: FeedbackData;
}

export interface DeclineOutput {
  declined: true;
  expires_at: string | null;
  repeat_count: number;
}

export async function handleDecline(
  input: DeclineInput,
  ctx: HandlerContext
): Promise<HandlerResult<DeclineOutput>> {
  // Verify user exists
  const caller = ctx.db
    .prepare("SELECT 1 FROM users WHERE user_token = ?")
    .get(input.user_token);

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  const candidate = ctx.db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(input.candidate_id) as CandidateRecord | undefined;

  if (!candidate) {
    return {
      ok: false,
      error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate not found" },
    };
  }

  if (
    input.user_token !== candidate.user_a_token &&
    input.user_token !== candidate.user_b_token
  ) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "You are not part of this candidate pair" },
    };
  }

  const other = otherToken(input.user_token, candidate);

  // Check for existing active decline (not reconsidered, not expired)
  const existingDecline = ctx.db
    .prepare(
      `SELECT id, reconsidered, expiry_at FROM declines WHERE decliner_token = ? AND declined_token = ? AND vertical_id = ?`
    )
    .get(input.user_token, other, candidate.vertical_id) as { id: string; reconsidered: number; expiry_at: string | null } | undefined;

  if (existingDecline) {
    // If reconsidered or expired, delete old row to allow re-decline
    const isActive = existingDecline.reconsidered === 0 &&
      (existingDecline.expiry_at === null || new Date(existingDecline.expiry_at) > new Date());
    if (isActive) {
      return {
        ok: false,
        error: { code: "ALREADY_DECLINED", message: "Candidate was already declined" },
      };
    }
    // Remove stale decline to allow re-decline
    ctx.db.prepare("DELETE FROM declines WHERE id = ?").run(existingDecline.id);
  }

  const side = callerSide(input.user_token, candidate);
  const stageAtDecline = side === "a" ? candidate.stage_a : candidate.stage_b;

  // Get/update decline pair history for escalating cooldowns
  const history = ctx.db
    .prepare("SELECT total_declines, permanent FROM decline_pair_history WHERE decliner_token = ? AND declined_token = ?")
    .get(input.user_token, other) as { total_declines: number; permanent: number } | undefined;

  const prevDeclines = history?.total_declines ?? 0;

  // Check permanent decline
  if (history?.permanent) {
    return {
      ok: false,
      error: { code: "PERMANENT_DECLINE", message: "This person has been permanently declined (3+ declines)" },
    };
  }

  const repeatCount = prevDeclines + 1;
  const isPermanent = repeatCount >= 3;

  // Compute expiry_at based on cluster TTL and escalation
  let expiryAt: string | null = null;
  if (!isPermanent) {
    const cluster = getCluster(candidate.vertical_id);
    const baseTTLDays = cluster?.decline_ttl_days ?? 90;
    const multiplier = repeatCount; // 1st = 1x, 2nd = 2x
    const ttlDays = baseTTLDays * multiplier;
    expiryAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const declineCandidate = ctx.db.transaction(() => {
    ctx.db
      .prepare(
        `INSERT INTO declines (id, decliner_token, declined_token, vertical_id, stage_at_decline, reason, expiry_at, feedback, repeat_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        input.user_token,
        other,
        candidate.vertical_id,
        stageAtDecline,
        input.reason ?? null,
        expiryAt,
        input.feedback ? JSON.stringify(input.feedback) : null,
        repeatCount
      );

    // Update decline pair history
    ctx.db
      .prepare(
        `INSERT INTO decline_pair_history (decliner_token, declined_token, total_declines, last_declined_at, permanent)
         VALUES (?, ?, ?, datetime('now'), ?)
         ON CONFLICT (decliner_token, declined_token)
         DO UPDATE SET total_declines = total_declines + 1, last_declined_at = datetime('now'), permanent = ?`
      )
      .run(input.user_token, other, repeatCount, isPermanent ? 1 : 0, isPermanent ? 1 : 0);

    ctx.db
      .prepare("DELETE FROM candidates WHERE id = ?")
      .run(input.candidate_id);
  });

  declineCandidate();

  return { ok: true, data: { declined: true, expires_at: expiryAt, repeat_count: repeatCount } };
}
