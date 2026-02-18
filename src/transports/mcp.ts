import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HandlerContext, HandlerResult } from "../types.js";
import { handleRegister } from "../handlers/register.js";
import { handleSearch } from "../handlers/search.js";
import { handleCompare } from "../handlers/compare.js";
import { handleRequestProfile } from "../handlers/request-profile.js";
import { handlePropose } from "../handlers/propose.js";
import { handleDecline } from "../handlers/decline.js";
import { handleGetIntroductions } from "../handlers/get-introductions.js";
import { handleReportOutcome } from "../handlers/report-outcome.js";
import { handleWithdraw } from "../handlers/withdraw.js";
import { handleGetReputation } from "../handlers/get-reputation.js";

function toMcpResponse(result: HandlerResult<unknown>) {
  if (!result.ok) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.error) }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.data) }],
  };
}

export function bindTools(server: McpServer, ctx: HandlerContext): void {
  // 1. schelling.register
  server.tool(
    "schelling.register",
    "Register a user for matchmaking with a personality embedding and profile data",
    {
      protocol_version: z.string().describe("Must be 'schelling-2.0'"),
      vertical_id: z.string().default("matchmaking").describe("Vertical to register in"),
      agent_model: z.string().optional().describe("AI model used, e.g. 'claude-opus-4-6'"),
      embedding_method: z.string().optional().describe("How embedding was generated, e.g. 'anchor-rated'"),
      embedding: z.array(z.number()).length(50).describe("50-dim personality embedding, each value in [-1, 1]"),
      city: z.string().min(1).max(100).describe("User's city"),
      age_range: z.enum(["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]),
      intent: z
        .array(z.enum(["friends", "romance", "collaborators"]))
        .min(1)
        .describe("What the user is looking for"),
      interests: z
        .array(z.string().max(100))
        .max(20)
        .optional()
        .describe("User interests for tier-2 comparison"),
      values_text: z
        .string()
        .max(500)
        .optional()
        .describe("Values description for tier-2 comparison"),
      description: z
        .string()
        .max(1000)
        .optional()
        .describe("Personality description for tier-3 profile"),
      seeking: z
        .string()
        .max(500)
        .optional()
        .describe("What user is seeking for tier-3 profile"),
      identity: z
        .object({
          name: z.string(),
          contact: z.string(),
        })
        .optional()
        .describe("Identity revealed only on mutual introduction"),
      deal_breakers: z
        .object({
          no_smoking: z.boolean().optional(),
          no_pets: z.boolean().optional(),
          max_distance_miles: z.number().optional(),
        })
        .optional()
        .describe("Hard constraints for filtering"),
      verification_level: z
        .enum(["anonymous", "verified", "attested"])
        .default("anonymous")
        .describe("Identity verification level"),
      phone_hash: z
        .string()
        .optional()
        .describe("Hashed phone number for Sybil resistance"),
      agent_attestation: z
        .object({
          model: z.string(),
          method: z.string(),
          interaction_hours: z.number(),
          generated_at: z.string(),
        })
        .optional()
        .describe("Agent attestation metadata"),
      user_token: z
        .string()
        .optional()
        .describe("Existing token for re-registration"),
      idempotency_key: z
        .string()
        .optional()
        .describe("Client-generated key for request deduplication"),
    },
    async (params) => toMcpResponse(await handleRegister(params, ctx))
  );

  // 2. schelling.search
  server.tool(
    "schelling.search",
    "Tier 1: Fast coarse search using embedding similarity and metadata filters",
    {
      user_token: z.string().describe("Your user token from registration"),
      vertical_id: z.string().default("matchmaking").describe("Vertical to search in"),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Max number of candidates to return"),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .default(0.5)
        .describe("Minimum compatibility score"),
      intent_filter: z
        .string()
        .optional()
        .describe("Filter to users with this intent"),
      city_filter: z
        .string()
        .optional()
        .describe("Filter to users in this city"),
      min_reputation: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum reputation score filter"),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor for subsequent pages"),
      idempotency_key: z
        .string()
        .optional()
        .describe("Client-generated key for request deduplication"),
    },
    async (params) => toMcpResponse(await handleSearch(params, ctx))
  );

  // 3. schelling.evaluate
  server.tool(
    "schelling.evaluate",
    "Tier 2: Detailed comparison with per-dimension breakdown, shared interests, and complementary traits",
    {
      user_token: z.string().describe("Your user token"),
      candidate_ids: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe("Candidate IDs to compare"),
    },
    async (params) => toMcpResponse(await handleCompare(params, ctx))
  );

  // 4. schelling.exchange
  server.tool(
    "schelling.exchange",
    "Tier 3: Request full profile (requires mutual tier-2 interest)",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate ID to request profile for"),
    },
    async (params) => toMcpResponse(await handleRequestProfile(params, ctx))
  );

  // 5. schelling.commit
  server.tool(
    "schelling.commit",
    "Propose a match after reviewing the profile. If mutual, identities are revealed",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate ID to propose to"),
    },
    async (params) => toMcpResponse(await handlePropose(params, ctx))
  );

  // 6. schelling.decline
  server.tool(
    "schelling.decline",
    "Decline a candidate at any stage. Permanent — prevents re-surfacing in future searches",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate ID to decline"),
      reason: z
        .string()
        .optional()
        .describe("Optional reason for decline"),
    },
    async (params) => toMcpResponse(await handleDecline(params, ctx))
  );

  // 7. schelling.connections
  server.tool(
    "schelling.connections",
    "Get all mutual introductions and count of pending proposals",
    {
      user_token: z.string().describe("Your user token"),
    },
    async (params) => toMcpResponse(await handleGetIntroductions(params, ctx))
  );

  // 8. schelling.report
  server.tool(
    "schelling.report",
    "Report the outcome of a mutual introduction for the feedback loop",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate ID to report on"),
      outcome: z.enum(["positive", "neutral", "negative"]),
      met_in_person: z.boolean().default(false).describe("Whether you met in person"),
      notes: z
        .string()
        .max(200)
        .optional()
        .describe("Optional notes about the outcome"),
    },
    async (params) => toMcpResponse(await handleReportOutcome(params, ctx))
  );

  // 9. schelling.withdraw
  server.tool(
    "schelling.withdraw",
    "Withdraw from a committed stage (back out before connection)",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate ID to withdraw from"),
      reason: z
        .string()
        .optional()
        .describe("Optional reason for withdrawal"),
      idempotency_key: z
        .string()
        .optional()
        .describe("Client-generated key for request deduplication"),
    },
    async (params) => toMcpResponse(await handleWithdraw(params, ctx))
  );

  // 10. schelling.reputation
  server.tool(
    "schelling.reputation",
    "Get reputation details for yourself or another user",
    {
      user_token: z.string().describe("Your user token"),
      target_token: z
        .string()
        .optional()
        .describe("Token of user to get reputation for (omit for self)"),
      vertical_id: z
        .string()
        .optional()
        .describe("Get vertical-specific reputation (omit for global)"),
    },
    async (params) => toMcpResponse(handleGetReputation(ctx, params))
  );
}
