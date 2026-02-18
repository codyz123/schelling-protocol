import type { HandlerContext, HandlerResult } from "../types.js";
import { recordReputationEvent } from "../core/reputation.js";

export interface JuryVerdictInput {
  user_token: string;
  dispute_id: string;
  verdict: "for_filer" | "for_defendant" | "dismissed";
  reasoning: string;
}

export interface JuryVerdictOutput {
  recorded: boolean;
  verdict_count: number;
  verdict_threshold: number;
  resolved: boolean;
  resolution?: string;
}

export async function handleJuryVerdict(
  input: JuryVerdictInput,
  ctx: HandlerContext
): Promise<HandlerResult<JuryVerdictOutput>> {
  const { db } = ctx;

  // Validate user
  const user = db.prepare("SELECT user_token FROM users WHERE user_token = ?")
    .get(input.user_token) as { user_token: string } | undefined;
  if (!user) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  // Validate assignment exists
  const assignment = db.prepare(`
    SELECT id, verdict, replaced, deadline_at FROM jury_assignments
    WHERE dispute_id = ? AND juror_token = ?
  `).get(input.dispute_id, input.user_token) as {
    id: string; verdict: string | null; replaced: number; deadline_at: string | null;
  } | undefined;

  if (!assignment) {
    return { ok: false, error: { code: "NOT_JUROR", message: "You are not assigned as a juror for this dispute" } };
  }
  if (assignment.replaced) {
    return { ok: false, error: { code: "JUROR_REPLACED", message: "You have been replaced as juror" } };
  }
  if (assignment.verdict) {
    return { ok: false, error: { code: "ALREADY_VOTED", message: "You have already submitted a verdict" } };
  }

  // Check deadline
  if (assignment.deadline_at && new Date(assignment.deadline_at) < new Date()) {
    return { ok: false, error: { code: "VERDICT_DEADLINE_PASSED", message: "The verdict deadline has passed" } };
  }

  // Record verdict
  db.prepare(`
    UPDATE jury_assignments
    SET verdict = ?, reasoning = ?, voted_at = datetime('now')
    WHERE id = ?
  `).run(input.verdict, input.reasoning, assignment.id);

  // Check if majority reached
  const dispute = db.prepare(`
    SELECT id, filed_by, filed_against, vertical_id, candidate_id FROM disputes WHERE id = ?
  `).get(input.dispute_id) as {
    id: string; filed_by: string; filed_against: string; vertical_id: string; candidate_id: string;
  };

  const allVotes = db.prepare(`
    SELECT verdict FROM jury_assignments
    WHERE dispute_id = ? AND replaced = 0
  `).all(input.dispute_id) as Array<{ verdict: string | null }>;

  const totalJurors = allVotes.length;
  const threshold = Math.ceil(totalJurors / 2);
  const votedCount = allVotes.filter(v => v.verdict !== null).length;

  // Count verdicts
  const verdictCounts: Record<string, number> = {};
  for (const v of allVotes) {
    if (v.verdict) {
      verdictCounts[v.verdict] = (verdictCounts[v.verdict] || 0) + 1;
    }
  }

  let resolved = false;
  let resolution: string | undefined;

  // Check for majority
  for (const [verdict, count] of Object.entries(verdictCounts)) {
    if (count >= threshold) {
      resolved = true;
      resolution = verdict;

      // Resolve the dispute
      const status = verdict === "for_filer" ? "resolved_for_filer"
        : verdict === "for_defendant" ? "resolved_for_defendant"
        : "dismissed";

      db.prepare(`
        UPDATE disputes SET status = ?, resolved_at = ?, resolution_notes = ?
        WHERE id = ?
      `).run(status, Date.now(), `Jury verdict: ${verdict} (${count}/${totalJurors})`, input.dispute_id);

      // Apply reputation consequences
      if (verdict === "for_filer") {
        recordReputationEvent(db, {
          identity_id: dispute.filed_against,
          reporter_id: "jury",
          reporter_reputation: 1.0,
          vertical_id: dispute.vertical_id,
          event_type: "dispute",
          rating: "negative",
          notes: `Lost dispute (jury ${count}/${totalJurors})`,
        });
      } else if (verdict === "for_defendant") {
        recordReputationEvent(db, {
          identity_id: dispute.filed_by,
          reporter_id: "jury",
          reporter_reputation: 1.0,
          vertical_id: dispute.vertical_id,
          event_type: "dispute",
          rating: "negative",
          notes: `Frivolous dispute filing (jury ${count}/${totalJurors})`,
        });
      }

      // Boost majority jurors' reputation
      const majorityJurors = db.prepare(`
        SELECT juror_token FROM jury_assignments
        WHERE dispute_id = ? AND verdict = ? AND replaced = 0
      `).all(input.dispute_id, verdict) as Array<{ juror_token: string }>;

      for (const juror of majorityJurors) {
        recordReputationEvent(db, {
          identity_id: juror.juror_token,
          reporter_id: "system",
          reporter_reputation: 1.0,
          vertical_id: dispute.vertical_id,
          event_type: "completion",
          rating: "positive",
          notes: "Jury duty completed (majority verdict)",
        });
      }

      break;
    }
  }

  return {
    ok: true,
    data: {
      recorded: true,
      verdict_count: votedCount,
      verdict_threshold: threshold,
      resolved,
      resolution,
    },
  };
}
