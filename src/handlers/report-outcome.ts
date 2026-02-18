import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
} from "../types.js";
import { Stage } from "../types.js";

export interface ReportOutcomeInput {
  user_token: string;
  candidate_id: string;
  outcome: "positive" | "neutral" | "negative";
  met_in_person?: boolean;
  notes?: string;
}

export interface ReportOutcomeOutput {
  recorded: true;
}

export async function handleReportOutcome(
  input: ReportOutcomeInput,
  ctx: HandlerContext
): Promise<HandlerResult<ReportOutcomeOutput>> {
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

  // Must be at CONNECTED stage
  if (
    candidate.stage_a < Stage.CONNECTED ||
    candidate.stage_b < Stage.CONNECTED
  ) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: "Outcome can only be reported after mutual connection (stage 5)",
      },
    };
  }

  // Check for duplicate report
  const existingOutcome = ctx.db
    .prepare(
      "SELECT 1 FROM outcomes WHERE candidate_id = ? AND reporter_token = ?"
    )
    .get(input.candidate_id, input.user_token);

  if (existingOutcome) {
    return {
      ok: false,
      error: {
        code: "ALREADY_REPORTED",
        message: "Outcome already reported for this candidate pair",
      },
    };
  }

  // Record outcome and advance reporter to COMPLETED stage
  const recordOutcome = ctx.db.transaction(() => {
    ctx.db
      .prepare(
        `INSERT INTO outcomes (id, candidate_id, reporter_token, outcome, met_in_person, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        input.candidate_id,
        input.user_token,
        input.outcome,
        input.met_in_person ? 1 : 0,
        input.notes ?? null
      );

    // Advance the reporter's stage to COMPLETED
    const side = input.user_token === candidate.user_a_token ? "a" : "b";
    const col = side === "a" ? "stage_a" : "stage_b";
    ctx.db
      .prepare(`UPDATE candidates SET ${col} = MAX(${col}, ?), updated_at = datetime('now') WHERE id = ?`)
      .run(Stage.COMPLETED, input.candidate_id);
  });

  recordOutcome();

  return { ok: true, data: { recorded: true } };
}
