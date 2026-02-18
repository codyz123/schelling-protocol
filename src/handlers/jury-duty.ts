import type { HandlerContext, HandlerResult } from "../types.js";

export interface JuryDutyInput {
  user_token: string;
}

export interface JuryCase {
  dispute_id: string;
  reason: string;
  evidence: string | null;
  filer_reputation: number;
  defendant_reputation: number;
  stage_at_filing: number;
  filed_at: string;
  deadline_at: string | null;
  defendant_response: string | null;
}

export interface JuryDutyOutput {
  cases: JuryCase[];
}

export async function handleJuryDuty(
  input: JuryDutyInput,
  ctx: HandlerContext
): Promise<HandlerResult<JuryDutyOutput>> {
  const { db } = ctx;

  const user = db.prepare("SELECT user_token FROM users WHERE user_token = ?")
    .get(input.user_token) as { user_token: string } | undefined;
  if (!user) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  // Get all active jury assignments for this user
  const assignments = db.prepare(`
    SELECT ja.dispute_id, ja.deadline_at,
           d.reason, d.evidence, d.filed_by, d.filed_against,
           d.stage_at_filing, d.created_at as filed_at,
           d.resolution_notes as defendant_response
    FROM jury_assignments ja
    JOIN disputes d ON ja.dispute_id = d.id
    WHERE ja.juror_token = ?
      AND ja.verdict IS NULL
      AND ja.replaced = 0
      AND d.status = 'open'
  `).all(input.user_token) as Array<{
    dispute_id: string;
    deadline_at: string | null;
    reason: string;
    evidence: string | null;
    filed_by: string;
    filed_against: string;
    stage_at_filing: number;
    filed_at: string;
    defendant_response: string | null;
  }>;

  const cases: JuryCase[] = assignments.map(a => {
    // Get anonymized reputation scores
    const filerRep = (db.prepare("SELECT reputation_score FROM users WHERE user_token = ?")
      .get(a.filed_by) as { reputation_score: number } | undefined)?.reputation_score ?? 0.5;
    const defRep = (db.prepare("SELECT reputation_score FROM users WHERE user_token = ?")
      .get(a.filed_against) as { reputation_score: number } | undefined)?.reputation_score ?? 0.5;

    return {
      dispute_id: a.dispute_id,
      reason: a.reason,
      evidence: a.evidence,
      filer_reputation: Math.round(filerRep * 100) / 100,
      defendant_reputation: Math.round(defRep * 100) / 100,
      stage_at_filing: a.stage_at_filing,
      filed_at: a.filed_at,
      deadline_at: a.deadline_at,
      defendant_response: a.defendant_response,
    };
  });

  return { ok: true, data: { cases } };
}
