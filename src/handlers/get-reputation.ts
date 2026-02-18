import type { HandlerContext, HandlerResult, ReputationResponse } from "../types.js";
import { computeReputation } from "../core/reputation.js";

interface GetReputationInput {
  user_token: string;
  target_token?: string; // If provided, get reputation for target user instead of self
  vertical_id?: string; // If provided, get vertical-specific reputation
}

export function handleGetReputation(
  ctx: HandlerContext,
  input: GetReputationInput
): HandlerResult<ReputationResponse> {
  try {
    // Validate input
    if (!input.user_token) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "user_token is required"
        }
      };
    }

    // Check if user exists
    const userCheck = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?");
    if (!userCheck.get(input.user_token)) {
      return {
        ok: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found"
        }
      };
    }

    // Determine whose reputation to get
    const targetToken = input.target_token || input.user_token;
    const isSelfQuery = !input.target_token;

    // Check if target exists (if different from caller)
    if (!isSelfQuery) {
      const targetCheck = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?");
      if (!targetCheck.get(targetToken)) {
        return {
          ok: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "Target user not found"
          }
        };
      }
    }

    // Compute reputation
    const reputationScore = computeReputation(ctx.db, targetToken, input.vertical_id);

    // Return different levels of detail based on query type
    if (isSelfQuery) {
      // Self-queries return full breakdown
      return {
        ok: true,
        data: {
          score: reputationScore.score,
          vertical_scores: reputationScore.vertical_scores,
          breakdown: reputationScore.breakdown,
          interaction_count: reputationScore.interaction_count,
          verification_level: reputationScore.verification_level,
          member_since: reputationScore.member_since,
        }
      };
    } else {
      // Queries about others return limited information
      return {
        ok: true,
        data: {
          score: reputationScore.score,
          interaction_count: reputationScore.interaction_count,
          verification_level: reputationScore.verification_level,
          member_since: reputationScore.member_since,
        }
      };
    }
  } catch (error) {
    console.error("Error in handleGetReputation:", error);
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: error instanceof Error ? error.message : "Unknown error"
      }
    };
  }
}