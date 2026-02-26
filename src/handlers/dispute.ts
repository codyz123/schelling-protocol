import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
  DisputeRecord,
} from "../types.js";
import { Stage, callerSide, otherToken } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface DisputeInput {
  user_token: string;
  candidate_id: string;
  reason: string;
  evidence?: string[];
  trait_claims?: Array<{
    trait_key: string;
    claimed_value: string;
    actual_value: string;
  }>;
  delivery_claims?: Array<{
    delivery_id: string;
    issue: string;
  }>;
  idempotency_key?: string;
}

export interface DisputeOutput {
  dispute_id: string;
  status: string;
  jury_size: number | null;
  filed_at: string;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleDispute(
  input: DisputeInput,
  ctx: HandlerContext,
): Promise<HandlerResult<DisputeOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<DisputeOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

  // ── Validate input ─────────────────────────────────────────────
  if (!input.reason || input.reason.length > 5000) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Reason is required and must be at most 5000 characters" },
    };
  }

  if (input.evidence && input.evidence.length > 10) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Evidence array must contain at most 10 items" },
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

  // ── Stage gating: both must be at CONNECTED (4) ────────────────
  if (candidate.stage_a < Stage.CONNECTED || candidate.stage_b < Stage.CONNECTED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: "Disputes can only be filed at CONNECTED stage (both parties must be at stage 4)",
      },
    };
  }

  // ── Check for duplicate open dispute ───────────────────────────
  const existingDispute = ctx.db
    .prepare(
      `SELECT 1 FROM disputes
       WHERE candidate_id = ? AND filed_by = ?
       AND status NOT IN ('resolved', 'resolved_for_filer', 'resolved_for_defendant', 'dismissed')`,
    )
    .get(input.candidate_id, input.user_token);

  if (existingDispute) {
    return {
      ok: false,
      error: { code: "DUPLICATE_DISPUTE", message: "You already have an open dispute for this candidate pair" },
    };
  }

  // ── Determine filed_against ────────────────────────────────────
  const filedAgainst = otherToken(input.user_token, candidate);

  // ── Insert dispute ─────────────────────────────────────────────
  const disputeId = randomUUID();
  const filedAt = Date.now();

  ctx.db
    .prepare(
      `INSERT INTO disputes (
        id, candidate_id, filed_by, filed_against, cluster_id,
        stage_at_filing, reason, evidence, trait_claims, delivery_claims,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'filed', ?)`,
    )
    .run(
      disputeId,
      input.candidate_id,
      input.user_token,
      filedAgainst,
      candidate.cluster_id,
      Stage.CONNECTED,
      input.reason,
      input.evidence ? JSON.stringify(input.evidence) : null,
      input.trait_claims ? JSON.stringify(input.trait_claims) : null,
      input.delivery_claims ? JSON.stringify(input.delivery_claims) : null,
      filedAt,
    );

  // ── Select jurors ──────────────────────────────────────────────
  // Criteria:
  //   1. No shared candidates with either party
  //   2. Reputation >= 0.6 (computed from reputation_events)
  //   3. Different agent_model from either party
  //   4. Not on jury in last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoIso = ninetyDaysAgo.toISOString();

  // Get agent models of both parties to exclude
  const filedAgainstUser = ctx.db
    .prepare("SELECT agent_model FROM users WHERE user_token = ?")
    .get(filedAgainst) as { agent_model: string | null } | undefined;

  const callerModel = caller.agent_model;
  const defendantModel = filedAgainstUser?.agent_model ?? null;

  // Find eligible jurors: active users not involved with either party
  const potentialJurors = ctx.db
    .prepare(
      `SELECT u.user_token FROM users u
       WHERE u.status = 'active'
         AND u.user_token != ?
         AND u.user_token != ?
         AND u.user_token NOT IN (
           SELECT user_a_token FROM candidates WHERE user_b_token IN (?, ?)
           UNION
           SELECT user_b_token FROM candidates WHERE user_a_token IN (?, ?)
         )
         AND u.user_token NOT IN (
           SELECT ja.juror_token FROM jury_assignments ja
           WHERE ja.assigned_at > ?
         )`,
    )
    .all(
      input.user_token,
      filedAgainst,
      input.user_token, filedAgainst,
      input.user_token, filedAgainst,
      ninetyDaysAgoIso,
    ) as Array<{ user_token: string }>;

  // Filter by agent_model difference and reputation >= 0.6
  const eligibleJurors: string[] = [];
  for (const pj of potentialJurors) {
    // Check agent_model
    const jurorUser = ctx.db
      .prepare("SELECT agent_model FROM users WHERE user_token = ?")
      .get(pj.user_token) as { agent_model: string | null } | undefined;

    const jurorModel = jurorUser?.agent_model ?? null;
    if (jurorModel && (jurorModel === callerModel || jurorModel === defendantModel)) {
      continue;
    }

    // Compute reputation from reputation_events
    const repEvents = ctx.db
      .prepare(
        `SELECT event_type, rating FROM reputation_events WHERE identity_id = ?`,
      )
      .all(pj.user_token) as Array<{ event_type: string; rating: string | null }>;

    let score = 0.5;
    for (const evt of repEvents) {
      if (evt.event_type === "outcome") {
        if (evt.rating === "positive") score += 0.05;
        else if (evt.rating === "negative") score -= 0.08;
        else if (evt.rating === "neutral") score += 0.01;
      } else if (evt.event_type === "contract_completed") {
        score += 0.05;
      } else if (evt.event_type === "contract_terminated") {
        score -= 0.04;
      } else if (evt.event_type === "deliverable_accepted") {
        score += 0.03;
      } else if (evt.event_type === "deliverable_rejected") {
        score -= 0.02;
      } else if (evt.event_type === "dispute") {
        if (evt.rating === "negative") score -= 0.15;
      }
    }
    score = Math.max(0.0, Math.min(1.0, score));

    if (score >= 0.6) {
      eligibleJurors.push(pj.user_token);
    }

    if (eligibleJurors.length >= 3) break;
  }

  let status: string;
  let jurySize: number | null;

  if (eligibleJurors.length < 3) {
    // Not enough jurors — escalate to operator review
    status = "operator_review";
    jurySize = null;
    ctx.db
      .prepare("UPDATE disputes SET status = 'operator_review' WHERE id = ?")
      .run(disputeId);
  } else {
    // Assign jurors
    status = "jury_selected";
    jurySize = eligibleJurors.length;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);
    const deadlineIso = deadline.toISOString();

    for (const jurorToken of eligibleJurors) {
      ctx.db
        .prepare(
          `INSERT INTO jury_assignments (id, dispute_id, juror_token, assigned_at, deadline)
           VALUES (?, ?, ?, datetime('now'), ?)`,
        )
        .run(randomUUID(), disputeId, jurorToken, deadlineIso);
    }

    ctx.db
      .prepare("UPDATE disputes SET status = 'jury_selected', jury_size = ? WHERE id = ?")
      .run(jurySize, disputeId);
  }

  // ── Build result ───────────────────────────────────────────────
  const result: DisputeOutput = {
    dispute_id: disputeId,
    status,
    jury_size: jurySize,
    filed_at: new Date(filedAt).toISOString(),
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "dispute", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
