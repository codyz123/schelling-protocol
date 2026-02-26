import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  DisputeRecord,
} from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface JuryVerdictInput {
  user_token: string;
  dispute_id: string;
  verdict: "for_filer" | "for_defendant" | "dismissed";
  reasoning: string;
  idempotency_key?: string;
}

export interface JuryVerdictOutput {
  verdict_recorded: true;
  dispute_status: string;
  all_verdicts_in: boolean;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleJuryVerdict(
  input: JuryVerdictInput,
  ctx: HandlerContext,
): Promise<HandlerResult<JuryVerdictOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<JuryVerdictOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

  // ── Validate input ─────────────────────────────────────────────
  const validVerdicts = ["for_filer", "for_defendant", "dismissed"];
  if (!validVerdicts.includes(input.verdict)) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Verdict must be one of: for_filer, for_defendant, dismissed" },
    };
  }

  if (!input.reasoning || input.reasoning.length > 5000) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Reasoning is required and must be at most 5000 characters" },
    };
  }

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

  // ── Verify dispute exists ──────────────────────────────────────
  const dispute = ctx.db
    .prepare("SELECT * FROM disputes WHERE id = ?")
    .get(input.dispute_id) as DisputeRecord | undefined;

  if (!dispute) {
    return {
      ok: false,
      error: { code: "DISPUTE_NOT_FOUND", message: "Dispute not found" },
    };
  }

  // ── Verify user is assigned juror ──────────────────────────────
  const assignment = ctx.db
    .prepare(
      `SELECT * FROM jury_assignments
       WHERE dispute_id = ? AND juror_token = ? AND replaced = 0`,
    )
    .get(input.dispute_id, input.user_token) as
    | { id: string; deadline: string }
    | undefined;

  if (!assignment) {
    return {
      ok: false,
      error: { code: "NOT_JUROR", message: "You are not assigned as a juror for this dispute" },
    };
  }

  // ── Check if already voted ─────────────────────────────────────
  const existingVerdict = ctx.db
    .prepare(
      "SELECT 1 FROM jury_verdicts WHERE dispute_id = ? AND juror_token = ?",
    )
    .get(input.dispute_id, input.user_token);

  if (existingVerdict) {
    return {
      ok: false,
      error: { code: "ALREADY_VOTED", message: "You have already submitted a verdict for this dispute" },
    };
  }

  // ── Check deadline ─────────────────────────────────────────────
  const now = new Date();
  const deadline = new Date(assignment.deadline);
  if (now > deadline) {
    return {
      ok: false,
      error: { code: "VERDICT_DEADLINE_PASSED", message: "The deadline for submitting a verdict has passed" },
    };
  }

  // ── Record verdict ─────────────────────────────────────────────
  ctx.db
    .prepare(
      `INSERT INTO jury_verdicts (id, dispute_id, juror_token, verdict, reasoning, submitted_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(randomUUID(), input.dispute_id, input.user_token, input.verdict, input.reasoning);

  // ── Check if all jurors have voted (or deadline passed) ────────
  const totalAssignments = ctx.db
    .prepare(
      "SELECT COUNT(*) as count FROM jury_assignments WHERE dispute_id = ? AND replaced = 0",
    )
    .get(input.dispute_id) as { count: number };

  const totalVerdicts = ctx.db
    .prepare(
      "SELECT COUNT(*) as count FROM jury_verdicts WHERE dispute_id = ?",
    )
    .get(input.dispute_id) as { count: number };

  const allVerdictsIn = totalVerdicts.count >= totalAssignments.count;

  let disputeStatus = dispute.status;

  if (allVerdictsIn) {
    // ── Tally verdicts and resolve ─────────────────────────────
    const verdicts = ctx.db
      .prepare("SELECT verdict FROM jury_verdicts WHERE dispute_id = ?")
      .all(input.dispute_id) as Array<{ verdict: string }>;

    const tally: Record<string, number> = {
      for_filer: 0,
      for_defendant: 0,
      dismissed: 0,
    };

    for (const v of verdicts) {
      tally[v.verdict] = (tally[v.verdict] || 0) + 1;
    }

    // Determine majority
    let majorityVerdict = "dismissed";
    let majorityCount = 0;
    for (const [verdict, count] of Object.entries(tally)) {
      if (count > majorityCount) {
        majorityCount = count;
        majorityVerdict = verdict;
      }
    }

    // ── Apply reputation consequences ────────────────────────
    const resolvedAt = Date.now();

    if (majorityVerdict === "for_filer") {
      // Defendant loses reputation: -0.15
      ctx.db
        .prepare(
          `INSERT INTO reputation_events (id, identity_id, reporter_id, reporter_reputation, cluster_id, event_type, rating, notes, created_at)
           VALUES (?, ?, 'system', 1.0, ?, 'dispute', 'negative', ?, ?)`,
        )
        .run(
          randomUUID(),
          dispute.filed_against,
          dispute.cluster_id,
          "Dispute resolved against defendant",
          resolvedAt,
        );
    } else if (majorityVerdict === "for_defendant") {
      // Filer loses reputation: -0.10
      ctx.db
        .prepare(
          `INSERT INTO reputation_events (id, identity_id, reporter_id, reporter_reputation, cluster_id, event_type, rating, notes, created_at)
           VALUES (?, ?, 'system', 1.0, ?, 'dispute', 'negative', ?, ?)`,
        )
        .run(
          randomUUID(),
          dispute.filed_by,
          dispute.cluster_id,
          "Dispute resolved against filer",
          resolvedAt,
        );
    }
    // dismissed: no reputation change

    // ── Reward jurors in majority with +0.02 ─────────────────
    for (const v of verdicts) {
      if (v.verdict === majorityVerdict) {
        const jurorVerdict = ctx.db
          .prepare(
            "SELECT juror_token FROM jury_verdicts WHERE dispute_id = ? AND verdict = ?",
          )
          .all(input.dispute_id, majorityVerdict) as Array<{ juror_token: string }>;

        for (const jv of jurorVerdict) {
          ctx.db
            .prepare(
              `INSERT INTO reputation_events (id, identity_id, reporter_id, reporter_reputation, cluster_id, event_type, notes, created_at)
               VALUES (?, ?, 'system', 1.0, ?, 'jury_majority', 'Juror voted with majority', ?)`,
            )
            .run(randomUUID(), jv.juror_token, dispute.cluster_id, resolvedAt);
        }
        break; // Only insert once for all majority jurors
      }
    }

    // ── Update dispute status ────────────────────────────────
    disputeStatus = "resolved";
    const resolutionNotes = `Majority verdict: ${majorityVerdict} (${majorityCount}/${verdicts.length})`;

    ctx.db
      .prepare(
        `UPDATE disputes SET status = 'resolved', resolved_at = ?, resolution_notes = ? WHERE id = ?`,
      )
      .run(resolvedAt, resolutionNotes, input.dispute_id);
  }

  // ── Build result ───────────────────────────────────────────────
  const result: JuryVerdictOutput = {
    verdict_recorded: true,
    dispute_status: disputeStatus,
    all_verdicts_in: allVerdictsIn,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "jury_verdict", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
