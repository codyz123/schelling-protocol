import type { Database } from "bun:sqlite";
import type { HandlerContext, HandlerResult } from "../types.js";
import { disputeExists } from "../core/disputes.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";
import { selectJury } from "../core/jury-selection.js";

interface FileDisputeRequest {
  user_token: string;
  candidate_id: string;
  reason: string;
  evidence?: string; // JSON
  idempotency_key?: string;
}

interface FileDisputeResponse {
  dispute_id: string;
  status: "open" | "jury_selection";
  filed_at: number;
  jury_size?: number;
  verdict_deadline?: string;
}

export async function handleFileDispute(
  params: FileDisputeRequest,
  ctx: HandlerContext
): Promise<HandlerResult<FileDisputeResponse>> {
  const { db } = ctx;
  const { user_token, candidate_id, reason, evidence, idempotency_key } = params;

  // Check idempotency
  if (idempotency_key) {
    const existing = checkIdempotency(db, idempotency_key);
    if (existing) {
      return existing as HandlerResult<FileDisputeResponse>;
    }
  }

  try {
    // Validate user exists
    const getUserQuery = db.query<{ user_token: string; vertical_id: string }>(`
      SELECT user_token, vertical_id FROM users WHERE user_token = ?
    `);
    const user = getUserQuery.get(user_token);
    
    if (!user) {
      const errorResult = { 
        ok: false as const, 
        error: { code: "USER_NOT_FOUND", message: "User not found" } 
      };
      
      if (idempotency_key) {
        recordIdempotency(db, idempotency_key, 'schelling.dispute', user_token, errorResult);
      }
      
      return errorResult;
    }

    // Validate candidate exists and user is part of the pair
    const getCandidateQuery = db.query<{
      id: string;
      user_a_token: string;
      user_b_token: string;
      vertical_id: string;
      stage_a: number;
      stage_b: number;
    }>(`
      SELECT id, user_a_token, user_b_token, vertical_id, stage_a, stage_b 
      FROM candidates 
      WHERE id = ?
    `);
    
    const candidate = getCandidateQuery.get(candidate_id);
    
    if (!candidate) {
      const errorResult = { 
        ok: false as const, 
        error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate not found" } 
      };
      
      if (idempotency_key) {
        recordIdempotency(db, idempotency_key, 'schelling.dispute', user_token, errorResult);
      }
      
      return errorResult;
    }

    // Verify user is part of this candidate pair
    const isUserA = candidate.user_a_token === user_token;
    const isUserB = candidate.user_b_token === user_token;
    
    if (!isUserA && !isUserB) {
      const errorResult = { 
        ok: false as const, 
        error: { code: "NOT_PARTICIPANT", message: "User is not part of this candidate pair" } 
      };
      
      if (idempotency_key) {
        recordIdempotency(db, idempotency_key, 'schelling.dispute', user_token, errorResult);
      }
      
      return errorResult;
    }

    // Check if pair is at CONNECTED+ stage (stage 5+)
    const currentStage = isUserA ? candidate.stage_a : candidate.stage_b;
    const otherStage = isUserA ? candidate.stage_b : candidate.stage_a;
    
    if (currentStage < 5 && otherStage < 5) {
      const errorResult = { 
        ok: false as const, 
        error: { 
          code: "STAGE_TOO_EARLY", 
          message: "Disputes can only be filed at CONNECTED stage (5) or later" 
        } 
      };
      
      if (idempotency_key) {
        recordIdempotency(db, idempotency_key, 'schelling.dispute', user_token, errorResult);
      }
      
      return errorResult;
    }

    const filed_against = isUserA ? candidate.user_b_token : candidate.user_a_token;

    // Check for duplicate dispute
    if (disputeExists(db, candidate_id, user_token)) {
      const errorResult = { 
        ok: false as const, 
        error: { code: "DUPLICATE_DISPUTE", message: "Dispute already filed for this candidate" } 
      };
      
      if (idempotency_key) {
        recordIdempotency(db, idempotency_key, 'schelling.dispute', user_token, errorResult);
      }
      
      return errorResult;
    }

    // Create dispute record
    const dispute_id = `disp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const filed_at = Date.now();
    const maxStage = Math.max(candidate.stage_a, candidate.stage_b);

    const insertDispute = db.query(`
      INSERT INTO disputes (
        id, candidate_id, filed_by, filed_against, vertical_id, 
        stage_at_filing, reason, evidence, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `);

    insertDispute.run(
      dispute_id,
      candidate_id,
      user_token,
      filed_against,
      candidate.vertical_id,
      maxStage,
      reason,
      evidence || null,
      filed_at
    );

    // Create pending action for accused party
    const insertPendingAction = db.query(`
      INSERT INTO pending_actions (
        id, user_token, candidate_id, action_type, created_at
      ) VALUES (?, ?, ?, 'review_dispute', ?)
    `);

    const action_id = `action_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    insertPendingAction.run(action_id, filed_against, candidate_id, Date.now());

    // Attempt jury selection
    let jurySize = 0;
    let verdictDeadline: string | undefined;
    const jurors = selectJury(db, dispute_id, user_token, filed_against, 3);
    if (jurors && jurors.length > 0) {
      jurySize = jurors.length;
      verdictDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      for (const jurorToken of jurors) {
        const juryId = `jury_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        db.query(`
          INSERT INTO jury_assignments (id, dispute_id, juror_token, deadline_at)
          VALUES (?, ?, ?, ?)
        `).run(juryId, dispute_id, jurorToken, verdictDeadline);

        // Create jury_duty pending action
        const juryActionId = `action_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        db.query(`
          INSERT INTO pending_actions (id, user_token, candidate_id, action_type)
          VALUES (?, ?, ?, 'jury_duty')
        `).run(juryActionId, jurorToken, candidate_id);
      }
    }

    const result: HandlerResult<FileDisputeResponse> = {
      ok: true,
      data: {
        dispute_id,
        status: jurySize > 0 ? "jury_selection" : "open",
        filed_at,
        jury_size: jurySize > 0 ? jurySize : undefined,
        verdict_deadline: verdictDeadline,
      }
    };

    // Record idempotency
    if (idempotency_key) {
      recordIdempotency(db, idempotency_key, 'schelling.dispute', user_token, result);
    }

    return result;

  } catch (error) {
    const errorResult = { 
      ok: false as const, 
      error: { 
        code: "INTERNAL_ERROR", 
        message: error instanceof Error ? error.message : "Unknown error" 
      } 
    };

    if (idempotency_key) {
      recordIdempotency(db, idempotency_key, 'schelling.dispute', user_token, errorResult);
    }

    return errorResult;
  }
}