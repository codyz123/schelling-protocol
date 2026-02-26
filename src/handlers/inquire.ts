import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
  InquiryRecord,
} from "../types.js";
import { Stage, otherToken } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface InquireAskInput {
  user_token: string;
  candidate_id: string;
  action: "ask";
  question: string;
  category?: "dealbreakers" | "logistics" | "compensation" | "lifestyle" | "custom";
  required?: boolean;
  idempotency_key?: string;
}

export interface InquireAnswerInput {
  user_token: string;
  candidate_id: string;
  action: "answer";
  inquiry_id: string;
  answer: string;
  confidence?: number;
  source?: "agent_knowledge" | "human_confirmed";
  idempotency_key?: string;
}

export interface InquireListInput {
  user_token: string;
  candidate_id: string;
  action: "list";
}

export type InquireInput = InquireAskInput | InquireAnswerInput | InquireListInput;

export interface InquireAskOutput {
  inquiry_id: string;
  status: "pending";
}

export interface InquireAnswerOutput {
  inquiry_id: string;
  status: "answered";
  answered_at: string;
}

export interface InquireListItem {
  inquiry_id: string;
  direction: "from_you" | "to_you";
  question: string;
  category: string | null;
  required: boolean;
  answer: string | null;
  answer_confidence: number | null;
  answer_source: string | null;
  status: string;
  created_at: string;
  answered_at: string | null;
}

export interface InquireListOutput {
  inquiries: InquireListItem[];
}

export type InquireOutput = InquireAskOutput | InquireAnswerOutput | InquireListOutput;

// ─── Handler ───────────────────────────────────────────────────────

export async function handleInquire(
  input: InquireInput,
  ctx: HandlerContext,
): Promise<HandlerResult<InquireOutput>> {
  // ── Idempotency (for ask and answer actions) ───────────────────
  if ("idempotency_key" in input && input.idempotency_key) {
    const cached = checkIdempotency<InquireOutput>(ctx.db, input.idempotency_key);
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

  if (caller.status === "paused") {
    return {
      ok: false,
      error: { code: "USER_PAUSED", message: "Your account is paused" },
    };
  }

  if (caller.status === "delisted") {
    return {
      ok: false,
      error: { code: "USER_SUSPENDED", message: "Your account is suspended" },
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

  // ── Both parties must be at INTERESTED (stage 2) or higher ─────
  if (candidate.stage_a < Stage.INTERESTED || candidate.stage_b < Stage.INTERESTED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: "Both parties must be at INTERESTED stage or higher to use inquiries",
      },
    };
  }

  // ── Dispatch by action ─────────────────────────────────────────
  switch (input.action) {
    case "ask":
      return handleAsk(input, candidate, ctx);
    case "answer":
      return handleAnswer(input, candidate, ctx);
    case "list":
      return handleList(input, candidate, ctx);
    default:
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: "action must be 'ask', 'answer', or 'list'" },
      };
  }
}

// ─── Ask ──────────────────────────────────────────────────────────

async function handleAsk(
  input: InquireAskInput,
  candidate: CandidateRecord,
  ctx: HandlerContext,
): Promise<HandlerResult<InquireAskOutput>> {
  // ── Validate question length ───────────────────────────────────
  if (!input.question || input.question.length > 2000) {
    return {
      ok: false,
      error: {
        code: "QUESTION_TOO_LONG",
        message: "Question must be between 1 and 2000 characters",
      },
    };
  }

  // ── Rate limit: 5 questions per counterparty per 24 hours ──────
  const recentCount = ctx.db
    .prepare(
      `SELECT COUNT(*) as count FROM inquiries
       WHERE candidate_id = ? AND from_token = ?
       AND created_at > datetime('now', '-24 hours')`,
    )
    .get(input.candidate_id, input.user_token) as { count: number };

  if (recentCount.count >= 5) {
    return {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Maximum 5 questions per counterparty per 24 hours",
      },
    };
  }

  // ── Insert inquiry ─────────────────────────────────────────────
  const inquiryId = randomUUID();

  ctx.db
    .prepare(
      `INSERT INTO inquiries (id, candidate_id, from_token, question, category, required, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
    )
    .run(
      inquiryId,
      input.candidate_id,
      input.user_token,
      input.question,
      input.category ?? null,
      input.required ? 1 : 0,
    );

  // ── Build result ───────────────────────────────────────────────
  const result: InquireAskOutput = {
    inquiry_id: inquiryId,
    status: "pending",
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "inquire_ask", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── Answer ───────────────────────────────────────────────────────

async function handleAnswer(
  input: InquireAnswerInput,
  candidate: CandidateRecord,
  ctx: HandlerContext,
): Promise<HandlerResult<InquireAnswerOutput>> {
  // ── Validate answer length ─────────────────────────────────────
  if (!input.answer || input.answer.length > 2000) {
    return {
      ok: false,
      error: {
        code: "ANSWER_TOO_LONG",
        message: "Answer must be between 1 and 2000 characters",
      },
    };
  }

  // ── Look up the inquiry ────────────────────────────────────────
  const inquiry = ctx.db
    .prepare("SELECT * FROM inquiries WHERE id = ?")
    .get(input.inquiry_id) as InquiryRecord | undefined;

  if (!inquiry) {
    return {
      ok: false,
      error: { code: "INQUIRY_NOT_FOUND", message: "Inquiry not found" },
    };
  }

  // ── Verify the inquiry belongs to this candidate pair ──────────
  if (inquiry.candidate_id !== input.candidate_id) {
    return {
      ok: false,
      error: { code: "INQUIRY_NOT_FOUND", message: "Inquiry not found for this candidate pair" },
    };
  }

  // ── Answerer must be the OTHER party (not the one who asked) ───
  const otherUserToken = otherToken(input.user_token, candidate);
  if (inquiry.from_token !== otherUserToken) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "You can only answer questions directed to you" },
    };
  }

  // ── Check not already answered ─────────────────────────────────
  if (inquiry.status === "answered") {
    return {
      ok: false,
      error: { code: "ALREADY_ANSWERED", message: "This inquiry has already been answered" },
    };
  }

  // ── Update inquiry with answer ─────────────────────────────────
  const answeredAt = new Date().toISOString();
  const confidence = input.confidence ?? 1.0;
  const source = input.source ?? "agent_knowledge";

  ctx.db
    .prepare(
      `UPDATE inquiries
       SET answer = ?, answer_confidence = ?, answer_source = ?,
           status = 'answered', answered_at = ?
       WHERE id = ?`,
    )
    .run(input.answer, confidence, source, answeredAt, input.inquiry_id);

  // ── Build result ───────────────────────────────────────────────
  const result: InquireAnswerOutput = {
    inquiry_id: input.inquiry_id,
    status: "answered",
    answered_at: answeredAt,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "inquire_answer", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── List ─────────────────────────────────────────────────────────

async function handleList(
  input: InquireListInput,
  candidate: CandidateRecord,
  ctx: HandlerContext,
): Promise<HandlerResult<InquireListOutput>> {
  const rows = ctx.db
    .prepare(
      "SELECT * FROM inquiries WHERE candidate_id = ? ORDER BY created_at ASC",
    )
    .all(input.candidate_id) as InquiryRecord[];

  const inquiries: InquireListItem[] = rows.map((row) => ({
    inquiry_id: row.id,
    direction: row.from_token === input.user_token ? "from_you" : "to_you",
    question: row.question,
    category: row.category,
    required: row.required === 1,
    answer: row.answer,
    answer_confidence: row.answer_confidence,
    answer_source: row.answer_source,
    status: row.status,
    created_at: row.created_at,
    answered_at: row.answered_at,
  }));

  return {
    ok: true,
    data: { inquiries },
  };
}
