import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult, CandidateRecord } from "../types.js";
import { Stage, callerSide, otherToken } from "../types.js";

export interface InquireInput {
  user_token: string;
  candidate_id: string;
  action: "ask" | "answer" | "list";
  question?: string;
  category?: string;
  required?: boolean;
  inquiry_id?: string;
  answer?: string;
  confidence?: number;
  source?: "agent_knowledge" | "human_confirmed";
  idempotency_key?: string;
}

export interface InquiryRecord {
  id: string;
  candidate_id: string;
  asker_token: string;
  question: string;
  category: string | null;
  required: number;
  asked_at: string;
  answer: string | null;
  confidence: number | null;
  source: string | null;
  answered_at: string | null;
  expired: number;
}

export async function handleInquire(
  input: InquireInput,
  ctx: HandlerContext
): Promise<HandlerResult<any>> {
  const caller = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?").get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  const candidate = ctx.db.prepare("SELECT * FROM candidates WHERE id = ?").get(input.candidate_id) as CandidateRecord | undefined;
  if (!candidate) {
    return { ok: false, error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate not found" } };
  }

  // Must be a participant
  if (candidate.user_a_token !== input.user_token && candidate.user_b_token !== input.user_token) {
    return { ok: false, error: { code: "NOT_PARTICIPANT", message: "Not a participant in this match" } };
  }

  const side = callerSide(input.user_token, candidate);
  const myStage = side === "a" ? candidate.stage_a : candidate.stage_b;

  if (input.action === "ask") {
    if (myStage < Stage.EVALUATED) {
      return { ok: false, error: { code: "STAGE_VIOLATION", message: "Must be at EVALUATED stage or later to ask questions" } };
    }
    if (!input.question) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "question is required" } };
    }
    if (input.question.length > 2000) {
      return { ok: false, error: { code: "QUESTION_TOO_LONG", message: "Question must be 2000 chars or less" } };
    }

    // Rate limit: 5 questions per counterparty per 24h
    const counterparty = otherToken(input.user_token, candidate);
    const recentCount = ctx.db.prepare(
      "SELECT COUNT(*) as count FROM inquiries WHERE asker_token = ? AND candidate_id = ? AND asked_at > datetime('now', '-24 hours')"
    ).get(input.user_token, input.candidate_id) as { count: number };

    if (recentCount.count >= 5) {
      return { ok: false, error: { code: "RATE_LIMITED", message: "Maximum 5 questions per counterparty per 24 hours" } };
    }

    const id = randomUUID();
    ctx.db.prepare(
      "INSERT INTO inquiries (id, candidate_id, asker_token, question, category, required) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, input.candidate_id, input.user_token, input.question, input.category ?? null, input.required ? 1 : 0);

    // Create pending action for counterparty
    ctx.db.prepare(
      "INSERT INTO pending_actions (id, user_token, candidate_id, action_type) VALUES (?, ?, ?, 'new_message')"
    ).run(randomUUID(), counterparty, input.candidate_id);

    return { ok: true, data: { inquiry_id: id, status: "asked" } };
  }

  if (input.action === "answer") {
    if (!input.inquiry_id) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "inquiry_id is required" } };
    }
    if (!input.answer) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "answer is required" } };
    }
    if (input.answer.length > 5000) {
      return { ok: false, error: { code: "ANSWER_TOO_LONG", message: "Answer must be 5000 chars or less" } };
    }

    const inquiry = ctx.db.prepare("SELECT * FROM inquiries WHERE id = ?").get(input.inquiry_id) as InquiryRecord | undefined;
    if (!inquiry) {
      return { ok: false, error: { code: "INQUIRY_NOT_FOUND", message: "Inquiry not found" } };
    }
    if (inquiry.answer) {
      return { ok: false, error: { code: "ALREADY_ANSWERED", message: "This inquiry has already been answered" } };
    }
    // The answerer must be the counterparty (not the asker)
    if (inquiry.asker_token === input.user_token) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "Cannot answer your own question" } };
    }

    ctx.db.prepare(
      "UPDATE inquiries SET answer = ?, confidence = ?, source = ?, answered_at = datetime('now') WHERE id = ?"
    ).run(input.answer, input.confidence ?? null, input.source ?? null, input.inquiry_id);

    return { ok: true, data: { inquiry_id: input.inquiry_id, status: "answered" } };
  }

  if (input.action === "list") {
    const inquiries = ctx.db.prepare(
      "SELECT * FROM inquiries WHERE candidate_id = ? ORDER BY asked_at DESC"
    ).all(input.candidate_id) as InquiryRecord[];

    return {
      ok: true,
      data: {
        inquiries: inquiries.map(i => ({
          id: i.id,
          asker_token: i.asker_token,
          question: i.question,
          category: i.category,
          required: i.required === 1,
          asked_at: i.asked_at,
          answer: i.answer,
          confidence: i.confidence,
          source: i.source,
          answered_at: i.answered_at,
          expired: i.expired === 1,
        })),
      },
    };
  }

  return { ok: false, error: { code: "INVALID_INPUT", message: `Unknown action: ${input.action}` } };
}
