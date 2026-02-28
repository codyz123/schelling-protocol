import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
} from "../types.js";
import { Stage, callerSide, otherToken } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface DelegationMetadata {
  agent_decided_dimensions: string[];
  user_reviewed_dimensions: string[];
  user_overrode_agent: boolean;
}

export interface ReportInput {
  user_token: string;
  candidate_id: string;
  outcome: "positive" | "neutral" | "negative";
  feedback?: Record<string, unknown>;
  delegation_metadata?: DelegationMetadata;
  idempotency_key?: string;
}

export interface ReportOutput {
  reported: true;
  reported_at: string;
}

// ─── Delegation Priors ─────────────────────────────────────────────

interface DelegationPriors {
  dimension_decidability: Record<string, number>;
  typical_agent_autonomy: number;
  sample_size: number;
}

const EMA_ALPHA = 0.3; // Weight for new observations

function getDefaultPriors(): DelegationPriors {
  return {
    dimension_decidability: {},
    typical_agent_autonomy: 0.5,
    sample_size: 0,
  };
}

function updateDelegationPriors(
  priors: DelegationPriors,
  metadata: DelegationMetadata,
  outcome: "positive" | "neutral" | "negative",
): DelegationPriors {
  const updated: DelegationPriors = {
    dimension_decidability: { ...priors.dimension_decidability },
    typical_agent_autonomy: priors.typical_agent_autonomy,
    sample_size: priors.sample_size + 1,
  };

  const isPositive = outcome === "positive";

  // For agent-decided dimensions with positive outcome: increase decidability
  for (const dim of metadata.agent_decided_dimensions) {
    const current = updated.dimension_decidability[dim] ?? 0.5;
    if (isPositive) {
      updated.dimension_decidability[dim] = current + EMA_ALPHA * (1.0 - current);
    } else {
      updated.dimension_decidability[dim] = current + EMA_ALPHA * (0.0 - current);
    }
  }

  // For user-reviewed dimensions where user overrode agent: decrease decidability
  for (const dim of metadata.user_reviewed_dimensions) {
    const current = updated.dimension_decidability[dim] ?? 0.5;
    if (metadata.user_overrode_agent) {
      updated.dimension_decidability[dim] = current + EMA_ALPHA * (0.0 - current);
    } else if (isPositive) {
      updated.dimension_decidability[dim] = current + EMA_ALPHA * (0.7 - current);
    }
  }

  // Update typical_agent_autonomy: ratio of agent-decided dimensions
  const allDims = metadata.agent_decided_dimensions.length + metadata.user_reviewed_dimensions.length;
  if (allDims > 0) {
    const thisAutonomy = metadata.agent_decided_dimensions.length / allDims;
    updated.typical_agent_autonomy =
      updated.typical_agent_autonomy + EMA_ALPHA * (thisAutonomy - updated.typical_agent_autonomy);
  }

  return updated;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleReport(
  input: ReportInput,
  ctx: HandlerContext,
): Promise<HandlerResult<ReportOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<ReportOutput>(ctx.db, input.idempotency_key);
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

  // ── Requires both at CONNECTED(4) ─────────────────────────────
  if (candidate.stage_a < Stage.CONNECTED || candidate.stage_b < Stage.CONNECTED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: "Outcome can only be reported after mutual connection (both at CONNECTED stage)",
      },
    };
  }

  // ── Prevent duplicate reports ──────────────────────────────────
  const existingReport = ctx.db
    .prepare(
      "SELECT 1 FROM outcomes WHERE candidate_id = ? AND reporter_token = ?",
    )
    .get(input.candidate_id, input.user_token);

  if (existingReport) {
    return {
      ok: false,
      error: { code: "ALREADY_REPORTED", message: "You have already reported an outcome for this candidate pair" },
    };
  }

  // ── Validate outcome value ─────────────────────────────────────
  const validOutcomes = ["positive", "neutral", "negative"];
  if (!validOutcomes.includes(input.outcome)) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: `outcome must be one of: ${validOutcomes.join(", ")}`,
      },
    };
  }

  const reportedAt = new Date().toISOString();
  const otherUserToken = otherToken(input.user_token, candidate);

  // ── Atomic: insert outcome + record reputation event + update delegation priors
  const doReport = ctx.db.transaction(() => {
    ctx.db
      .prepare(
        `INSERT INTO outcomes (id, candidate_id, reporter_token, outcome, feedback, delegation_metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.candidate_id,
        input.user_token,
        input.outcome,
        input.feedback ? JSON.stringify(input.feedback) : null,
        input.delegation_metadata ? JSON.stringify(input.delegation_metadata) : null,
        reportedAt,
      );

    // Record reputation event on the other party
    const eventType = `${input.outcome}_outcome`;
    ctx.db.prepare(
      `INSERT INTO reputation_events (id, identity_id, reporter_id, reporter_reputation, cluster_id, event_type, rating, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      randomUUID(),
      otherUserToken,
      input.user_token,
      null,
      candidate.cluster_id,
      eventType,
      input.outcome,
      input.feedback ? JSON.stringify(input.feedback) : null,
    );

    // ── Update delegation priors on the cluster ───────────────────
    if (input.delegation_metadata) {
      const clusterRow = ctx.db
        .prepare("SELECT delegation_priors FROM clusters WHERE cluster_id = ?")
        .get(candidate.cluster_id) as { delegation_priors: string | null } | undefined;

      let priors: DelegationPriors = getDefaultPriors();
      if (clusterRow?.delegation_priors) {
        try {
          priors = JSON.parse(clusterRow.delegation_priors) as DelegationPriors;
        } catch {
          priors = getDefaultPriors();
        }
      }

      const updatedPriors = updateDelegationPriors(priors, input.delegation_metadata, input.outcome);

      ctx.db
        .prepare("UPDATE clusters SET delegation_priors = ? WHERE cluster_id = ?")
        .run(JSON.stringify(updatedPriors), candidate.cluster_id);
    }
  });

  try {
    doReport();
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // ── Build result ───────────────────────────────────────────────
  const result: ReportOutput = {
    reported: true,
    reported_at: reportedAt,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "report", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
