import type { HandlerContext, HandlerResult } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

interface VerifyRequest {
  user_token: string;
  candidate_id: string;
  verification_type: "request" | "provide";
  artifacts?: string; // JSON metadata for photos, receipts, etc.
  idempotency_key?: string;
}

interface VerifyResponse {
  status: "requested" | "provided";
  verification_id: string;
}

export async function handleVerify(
  params: VerifyRequest,
  ctx: HandlerContext
): Promise<HandlerResult<VerifyResponse>> {
  const { db } = ctx;
  const { user_token, candidate_id, verification_type, artifacts, idempotency_key } = params;

  // Check idempotency
  if (idempotency_key) {
    const existing = checkIdempotency(db, idempotency_key);
    if (existing) {
      return existing as HandlerResult<VerifyResponse>;
    }
  }

  try {
    // Validate user exists
    const getUserQuery = db.query<{ user_token: string }>(`
      SELECT user_token FROM users WHERE user_token = ?
    `);
    const user = getUserQuery.get(user_token);
    
    if (!user) {
      const errorResult = { 
        ok: false as const, 
        error: { code: "USER_NOT_FOUND", message: "User not found" } 
      };
      
      if (idempotency_key) {
        recordIdempotency(db, idempotency_key, 'schelling.verify', user_token, errorResult);
      }
      
      return errorResult;
    }

    // Validate candidate exists and user is part of the pair
    const getCandidateQuery = db.query<{
      id: string;
      user_a_token: string;
      user_b_token: string;
      stage_a: number;
      stage_b: number;
    }>(`
      SELECT id, user_a_token, user_b_token, stage_a, stage_b 
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
        recordIdempotency(db, idempotency_key, 'schelling.verify', user_token, errorResult);
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
        recordIdempotency(db, idempotency_key, 'schelling.verify', user_token, errorResult);
      }
      
      return errorResult;
    }

    // Check if pair is at EXCHANGED+ stage (stage 3+)
    const currentStage = isUserA ? candidate.stage_a : candidate.stage_b;
    const otherStage = isUserA ? candidate.stage_b : candidate.stage_a;
    
    if (Math.max(currentStage, otherStage) < 3) {
      const errorResult = { 
        ok: false as const, 
        error: { 
          code: "STAGE_TOO_EARLY", 
          message: "Verification can only be requested at EXCHANGED stage (3) or later" 
        } 
      };
      
      if (idempotency_key) {
        recordIdempotency(db, idempotency_key, 'schelling.verify', user_token, errorResult);
      }
      
      return errorResult;
    }

    const other_party = isUserA ? candidate.user_b_token : candidate.user_a_token;
    const verification_id = `verify_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const created_at = Date.now();

    if (verification_type === "request") {
      // Create verification request
      const insertVerification = db.query(`
        INSERT INTO verifications (
          id, candidate_id, requested_by, requested_from, verification_type, 
          status, created_at, expires_at
        ) VALUES (?, ?, ?, ?, 'request', 'pending', ?, ?)
      `);

      const expires_at = created_at + (7 * 24 * 60 * 60 * 1000); // 7 days from now
      insertVerification.run(
        verification_id,
        candidate_id,
        user_token,
        other_party,
        created_at,
        expires_at
      );

      // Create pending action for the other party
      const insertPendingAction = db.query(`
        INSERT INTO pending_actions (
          id, user_token, candidate_id, action_type, created_at
        ) VALUES (?, ?, ?, 'provide_verification', ?)
      `);

      const action_id = `action_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      insertPendingAction.run(action_id, other_party, candidate_id, created_at);

      const result: HandlerResult<VerifyResponse> = {
        ok: true,
        data: {
          status: "requested",
          verification_id
        }
      };

      if (idempotency_key) {
        recordIdempotency(db, idempotency_key, 'schelling.verify', user_token, result);
      }

      return result;

    } else if (verification_type === "provide") {
      // Check if there's a pending verification request for this user
      const getPendingRequest = db.query<{ id: string }>(`
        SELECT id FROM verifications 
        WHERE candidate_id = ? 
        AND requested_from = ?
        AND status = 'pending'
        ORDER BY created_at DESC 
        LIMIT 1
      `);

      const pendingRequest = getPendingRequest.get(candidate_id, user_token);
      
      if (!pendingRequest) {
        const errorResult = { 
          ok: false as const, 
          error: { code: "NO_PENDING_REQUEST", message: "No pending verification request found" } 
        };
        
        if (idempotency_key) {
          recordIdempotency(db, idempotency_key, 'schelling.verify', user_token, errorResult);
        }
        
        return errorResult;
      }

      if (!artifacts) {
        const errorResult = { 
          ok: false as const, 
          error: { code: "ARTIFACTS_REQUIRED", message: "Artifacts are required when providing verification" } 
        };
        
        if (idempotency_key) {
          recordIdempotency(db, idempotency_key, 'schelling.verify', user_token, errorResult);
        }
        
        return errorResult;
      }

      // Update verification with provided artifacts
      const updateVerification = db.query(`
        UPDATE verifications 
        SET verification_type = 'provide', artifacts = ?, status = 'provided'
        WHERE id = ?
      `);

      updateVerification.run(artifacts, pendingRequest.id);

      // Mark pending action as consumed
      const markActionConsumed = db.query(`
        UPDATE pending_actions 
        SET consumed_at = ?
        WHERE user_token = ? AND candidate_id = ? AND action_type = 'provide_verification'
      `);

      markActionConsumed.run(created_at, user_token, candidate_id);

      const result: HandlerResult<VerifyResponse> = {
        ok: true,
        data: {
          status: "provided",
          verification_id: pendingRequest.id
        }
      };

      if (idempotency_key) {
        recordIdempotency(db, idempotency_key, 'schelling.verify', user_token, result);
      }

      return result;
    }

    const errorResult = { 
      ok: false as const, 
      error: { code: "INVALID_TYPE", message: "verification_type must be 'request' or 'provide'" } 
    };
    
    if (idempotency_key) {
      recordIdempotency(db, idempotency_key, 'schelling.verify', user_token, errorResult);
    }
    
    return errorResult;

  } catch (error) {
    const errorResult = { 
      ok: false as const, 
      error: { 
        code: "INTERNAL_ERROR", 
        message: error instanceof Error ? error.message : "Unknown error" 
      } 
    };

    if (idempotency_key) {
      recordIdempotency(db, idempotency_key, 'schelling.verify', user_token, errorResult);
    }

    return errorResult;
  }
}