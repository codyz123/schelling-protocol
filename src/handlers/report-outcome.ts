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

  // Must be at INTRODUCED stage
  if (
    candidate.stage_a < Stage.INTRODUCED ||
    candidate.stage_b < Stage.INTRODUCED
  ) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: "Outcome can only be reported after mutual introduction (stage 5)",
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

  return { ok: true, data: { recorded: true } };
}
