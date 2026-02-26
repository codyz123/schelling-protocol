import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
  ReputationEventRecord,
} from "../types.js";
import { callerSide, otherToken } from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface ReputationInput {
  user_token: string;
  candidate_id?: string;
}

export interface ReputationOutput {
  score: number;
  interaction_count: number;
  positive_rate: number;
  verification_level: string;
  dispute_history: {
    filed: number;
    lost: number;
    won: number;
  };
  member_since: string;
  enforcement_history: Array<{
    id: string;
    level: number;
    reason: string;
    created_at: string;
  }>;
  deliverable_stats: {
    delivered: number;
    accepted: number;
    rejected: number;
  };
}

// ─── Reputation Event Impact Map ───────────────────────────────────

const EVENT_IMPACTS: Record<string, number> = {
  positive_outcome: 0.05,
  negative_outcome: -0.08,
  neutral_outcome: 0.01,
  contract_completed: 0.05,
  contract_terminated: -0.04,
  deliverable_accepted: 0.03,
  deliverable_rejected: -0.02,
  dispute_lost: -0.15,
  jury_majority: 0.02,
  frivolous_filing: -0.10,
  enforcement_warning: -0.05,
  enforcement_action: -0.10,
  abandonment: -0.03,
  completion: 0.03,
};

// ─── Handler ───────────────────────────────────────────────────────

export async function handleReputation(
  input: ReputationInput,
  ctx: HandlerContext,
): Promise<HandlerResult<ReputationOutput>> {
  // ── Verify caller exists ───────────────────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Determine target user ──────────────────────────────────────
  let targetToken = input.user_token;

  if (input.candidate_id) {
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

    targetToken = otherToken(input.user_token, candidate);
  }

  // ── Load target user record ────────────────────────────────────
  const targetUser = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(targetToken) as UserRecord | undefined;

  if (!targetUser) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "Target user not found" },
    };
  }

  // ── Compute reputation score from reputation_events ────────────
  const events = ctx.db
    .prepare("SELECT * FROM reputation_events WHERE identity_id = ?")
    .all(targetToken) as ReputationEventRecord[];

  const now = Date.now();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const twoYearsMs = 730 * 24 * 60 * 60 * 1000;

  let score = 0.5;

  for (const evt of events) {
    const ageMs = now - evt.created_at;

    let impact = 0;

    // Map event_type + rating to impact
    if (evt.event_type === "outcome") {
      if (evt.rating === "positive") impact = EVENT_IMPACTS.positive_outcome;
      else if (evt.rating === "negative") impact = EVENT_IMPACTS.negative_outcome;
      else if (evt.rating === "neutral") impact = EVENT_IMPACTS.neutral_outcome;
    } else if (evt.event_type === "contract_completed") {
      impact = EVENT_IMPACTS.contract_completed;
    } else if (evt.event_type === "contract_terminated") {
      impact = EVENT_IMPACTS.contract_terminated;
    } else if (evt.event_type === "contract_expired") {
      impact = EVENT_IMPACTS.contract_terminated; // treat same as terminated
    } else if (evt.event_type === "deliverable_accepted") {
      impact = EVENT_IMPACTS.deliverable_accepted;
    } else if (evt.event_type === "deliverable_rejected") {
      impact = EVENT_IMPACTS.deliverable_rejected;
    } else if (evt.event_type === "dispute") {
      if (evt.rating === "negative") impact = EVENT_IMPACTS.dispute_lost;
    } else if (evt.event_type === "jury_majority") {
      impact = EVENT_IMPACTS.jury_majority;
    } else if (evt.event_type === "frivolous_filing") {
      impact = EVENT_IMPACTS.frivolous_filing;
    } else if (evt.event_type === "enforcement_warning") {
      impact = EVENT_IMPACTS.enforcement_warning;
    } else if (evt.event_type === "enforcement_action") {
      impact = EVENT_IMPACTS.enforcement_action;
    } else if (evt.event_type === "abandonment") {
      impact = EVENT_IMPACTS.abandonment;
    } else if (evt.event_type === "completion") {
      impact = EVENT_IMPACTS.completion;
    }

    // Apply time decay
    if (ageMs > twoYearsMs) {
      impact *= 0.25; // quartered
    } else if (ageMs > oneYearMs) {
      impact *= 0.5; // halved
    }

    score += impact;
  }

  // Clamp to [0.0, 1.0]
  score = Math.max(0.0, Math.min(1.0, score));

  // ── Compute interaction_count ──────────────────────────────────
  const outcomeEvents = events.filter((e) => e.event_type === "outcome");
  const interactionCount = outcomeEvents.length;

  // ── Compute positive_rate ──────────────────────────────────────
  const positiveOutcomes = outcomeEvents.filter((e) => e.rating === "positive").length;
  const positiveRate = interactionCount > 0 ? positiveOutcomes / interactionCount : 0;

  // ── Determine verification_level ───────────────────────────────
  // Check highest verification tier from traits
  const traits = ctx.db
    .prepare("SELECT verification FROM traits WHERE user_token = ?")
    .all(targetToken) as Array<{ verification: string }>;

  let verificationLevel = "unverified";
  const tierOrder = ["unverified", "self_verified", "cross_verified", "authority_verified"];

  for (const t of traits) {
    const idx = tierOrder.indexOf(t.verification);
    if (idx > tierOrder.indexOf(verificationLevel)) {
      verificationLevel = t.verification;
    }
  }

  // ── Compute dispute_history ────────────────────────────────────
  const disputesFiled = ctx.db
    .prepare("SELECT COUNT(*) as count FROM disputes WHERE filed_by = ?")
    .get(targetToken) as { count: number };

  const disputesLost = ctx.db
    .prepare(
      `SELECT COUNT(*) as count FROM disputes
       WHERE (filed_by = ? AND status IN ('resolved_for_defendant'))
          OR (filed_against = ? AND status IN ('resolved_for_filer'))`,
    )
    .get(targetToken, targetToken) as { count: number };

  const disputesWon = ctx.db
    .prepare(
      `SELECT COUNT(*) as count FROM disputes
       WHERE (filed_by = ? AND status IN ('resolved_for_filer', 'resolved'))
          OR (filed_against = ? AND status IN ('resolved_for_defendant'))`,
    )
    .get(targetToken, targetToken) as { count: number };

  const disputeHistory = {
    filed: disputesFiled.count,
    lost: disputesLost.count,
    won: disputesWon.count,
  };

  // ── Get member_since ───────────────────────────────────────────
  const memberSince = targetUser.created_at;

  // ── Get enforcement_history ────────────────────────────────────
  const enforcements = ctx.db
    .prepare("SELECT id, level, reason, created_at FROM enforcement_actions WHERE user_token = ?")
    .all(targetToken) as Array<{
      id: string;
      level: number;
      reason: string;
      created_at: string;
    }>;

  // ── Get deliverable_stats ──────────────────────────────────────
  const delivered = ctx.db
    .prepare("SELECT COUNT(*) as count FROM deliverables WHERE deliverer_token = ?")
    .get(targetToken) as { count: number };

  const accepted = ctx.db
    .prepare(
      "SELECT COUNT(*) as count FROM deliverables WHERE deliverer_token = ? AND status = 'accepted'",
    )
    .get(targetToken) as { count: number };

  const rejected = ctx.db
    .prepare(
      "SELECT COUNT(*) as count FROM deliverables WHERE deliverer_token = ? AND status = 'rejected'",
    )
    .get(targetToken) as { count: number };

  const deliverableStats = {
    delivered: delivered.count,
    accepted: accepted.count,
    rejected: rejected.count,
  };

  // ── Build result ───────────────────────────────────────────────
  return {
    ok: true,
    data: {
      score,
      interaction_count: interactionCount,
      positive_rate: positiveRate,
      verification_level: verificationLevel,
      dispute_history: disputeHistory,
      member_since: memberSince,
      enforcement_history: enforcements,
      deliverable_stats: deliverableStats,
    },
  };
}
