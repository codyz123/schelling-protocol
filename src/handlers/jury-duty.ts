import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  DisputeRecord,
} from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface JuryDutyInput {
  user_token: string;
}

export interface JuryCase {
  dispute_id: string;
  dispute_type: "standard" | "deliverable";
  filer_evidence: {
    statement: string;
    traits: Array<{ trait_key: string; claimed_value: string; actual_value: string }>;
    timeline: unknown[];
  };
  defendant_evidence: {
    statement: string | null;
    traits: unknown[];
    timeline: unknown[];
  };
  context: {
    cluster_id: string;
    contract_terms: unknown | null;
    deliverable_metadata: unknown | null;
  };
  deliverable_content: unknown | null;
  deadline: string;
  filed_at: string;
}

export interface JuryDutyOutput {
  cases: JuryCase[];
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleJuryDuty(
  input: JuryDutyInput,
  ctx: HandlerContext,
): Promise<HandlerResult<JuryDutyOutput>> {
  // ── Verify user exists ─────────────────────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Query pending jury assignments ─────────────────────────────
  // Find assignments where this user has not yet submitted a verdict
  const assignments = ctx.db
    .prepare(
      `SELECT ja.dispute_id, ja.deadline
       FROM jury_assignments ja
       WHERE ja.juror_token = ?
         AND ja.replaced = 0
         AND NOT EXISTS (
           SELECT 1 FROM jury_verdicts jv
           WHERE jv.dispute_id = ja.dispute_id AND jv.juror_token = ja.juror_token
         )`,
    )
    .all(input.user_token) as Array<{
      dispute_id: string;
      deadline: string;
    }>;

  // ── Build case details for each assignment ─────────────────────
  const cases: JuryCase[] = [];

  for (const assignment of assignments) {
    const dispute = ctx.db
      .prepare("SELECT * FROM disputes WHERE id = ?")
      .get(assignment.dispute_id) as DisputeRecord | undefined;

    if (!dispute) continue;

    // Parse stored JSON fields
    let traitClaims: Array<{ trait_key: string; claimed_value: string; actual_value: string }> = [];
    if (dispute.trait_claims) {
      try {
        traitClaims = JSON.parse(dispute.trait_claims);
      } catch {
        traitClaims = [];
      }
    }

    let deliveryClaims: Array<{ delivery_id: string; issue: string }> = [];
    if (dispute.delivery_claims) {
      try {
        deliveryClaims = JSON.parse(dispute.delivery_claims);
      } catch {
        deliveryClaims = [];
      }
    }

    // Determine dispute type based on delivery_claims presence
    const disputeType: "standard" | "deliverable" =
      deliveryClaims.length > 0 ? "deliverable" : "standard";

    cases.push({
      dispute_id: dispute.id,
      dispute_type: disputeType,
      filer_evidence: {
        statement: dispute.reason,
        traits: traitClaims,
        timeline: [],
      },
      defendant_evidence: {
        statement: null,
        traits: [],
        timeline: [],
      },
      context: {
        cluster_id: dispute.cluster_id,
        contract_terms: null,
        deliverable_metadata: null,
      },
      deliverable_content: null,
      deadline: assignment.deadline,
      filed_at: new Date(dispute.created_at).toISOString(),
    });
  }

  return {
    ok: true,
    data: { cases },
  };
}
