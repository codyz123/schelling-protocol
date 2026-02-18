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
import { handleNegotiate } from "../handlers/negotiate.js";
import { handleFileDispute } from "../handlers/file-dispute.js";
import { handleVerify } from "../handlers/verify.js";
import { handleExportData } from "../handlers/export-data.js";
import { handleDeleteAccount } from "../handlers/delete-account.js";
import { handleListVerticals } from "../handlers/list-verticals.js";
import { handleOnboard } from "../handlers/onboard.js";
import { handleServerInfo } from "../handlers/server-info.js";

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
    "Register a user in a vertical (matchmaking, marketplace, etc.) with appropriate data",
    {
      protocol_version: z.string().describe("Must be 'schelling-2.0'"),
      vertical_id: z.string().default("matchmaking").describe("Vertical to register in"),
      role: z.string().optional().describe("Role within vertical (seller/buyer for marketplace, seeker for matchmaking)"),
      agent_model: z.string().optional().describe("AI model used, e.g. 'claude-opus-4-6'"),
      embedding_method: z.string().optional().describe("How embedding was generated, e.g. 'anchor-rated'"),
      embedding: z.array(z.number()).optional().describe("Embedding vector (50-dim for matchmaking, zeros/omit for marketplace)"),
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
        .describe("Profile description for tier-3 exchange"),
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
        .describe("Identity revealed only on mutual connection"),
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
      status: z
        .enum(["active", "paused", "delisted"])
        .default("active")
        .describe("User status (paused = hidden from search, delisted = auto-decline)"),
      // Marketplace-specific fields
      category: z.string().optional().describe("Marketplace category (electronics, vehicles, etc.)"),
      condition: z
        .enum(["new", "like-new", "good", "fair", "parts"])
        .optional()
        .describe("Item condition (for sellers)"),
      price_range: z
        .object({
          min_acceptable: z.number().optional().describe("Minimum acceptable price (sellers)"),
          asking_price: z.number().optional().describe("Initial asking price (sellers)"),
        })
        .optional()
        .describe("Price range for sellers"),
      budget: z
        .object({
          max_price: z.number().optional().describe("Maximum budget (buyers)"),
          preferred_price: z.number().optional().describe("Preferred price (buyers)"),
        })
        .optional()
        .describe("Budget for buyers"),
      location: z.string().optional().describe("Location for marketplace transactions"),
      photos: z
        .array(z.string())
        .optional()
        .describe("Photo URLs or references for marketplace listings"),
      shipping_options: z
        .array(z.string())
        .optional()
        .describe("Available shipping methods"),
      item_attributes: z
        .record(z.any())
        .optional()
        .describe("Category-specific item attributes"),
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

  // 11. schelling.negotiate
  server.tool(
    "schelling.negotiate",
    "Send proposals, counteroffers, or accept proposals in asymmetric verticals (e.g. marketplace)",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate ID to negotiate with"),
      proposal: z
        .object({
          price: z.number().optional().describe("Proposed price"),
          terms: z.string().optional().describe("Proposed terms"),
          shipping_method: z.string().optional().describe("Proposed shipping method"),
          delivery_date: z.string().optional().describe("Proposed delivery date"),
          notes: z.string().optional().describe("Additional notes or conditions"),
        })
        .optional()
        .describe("Proposal to send (omit if accepting existing proposal)"),
      accept: z
        .boolean()
        .optional()
        .describe("Set to true to accept the latest pending proposal"),
      idempotency_key: z
        .string()
        .optional()
        .describe("Client-generated key for request deduplication"),
    },
    async (params) => toMcpResponse(await handleNegotiate(params, ctx))
  );

  // 12. schelling.dispute
  server.tool(
    "schelling.dispute",
    "File a dispute against a counterparty for misrepresentation or bad faith behavior",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate ID to file dispute against"),
      reason: z.string().min(10).max(1000).describe("Reason for the dispute"),
      evidence: z
        .string()
        .optional()
        .describe("JSON evidence: screenshots, chat logs, verification artifacts"),
      idempotency_key: z
        .string()
        .optional()
        .describe("Client-generated key for request deduplication"),
    },
    async (params) => toMcpResponse(await handleFileDispute(params, ctx))
  );

  // 13. schelling.verify
  server.tool(
    "schelling.verify",
    "Request or provide verification artifacts (photos, receipts, proof of item)",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate ID for verification"),
      verification_type: z
        .enum(["request", "provide"])
        .describe("Whether requesting verification or providing it"),
      artifacts: z
        .string()
        .optional()
        .describe("JSON metadata for verification artifacts (required for 'provide' type)"),
      idempotency_key: z
        .string()
        .optional()
        .describe("Client-generated key for request deduplication"),
    },
    async (params) => toMcpResponse(await handleVerify(params, ctx))
  );

  // 14. schelling.export
  server.tool(
    "schelling.export",
    "Export all user data in JSON format for GDPR/CCPA compliance",
    {
      user_token: z.string().describe("Your user token"),
    },
    async (params) => toMcpResponse(await handleExportData(params, ctx))
  );

  // 15. schelling.delete_account
  server.tool(
    "schelling.delete_account",
    "Permanently delete user account and all associated data",
    {
      user_token: z.string().describe("Your user token"),
      confirmation: z
        .string()
        .describe("Must be exactly 'DELETE_ALL_DATA' to confirm deletion"),
    },
    async (params) => toMcpResponse(await handleDeleteAccount(params, ctx))
  );

  // 16. schelling.verticals
  server.tool(
    "schelling.verticals",
    "List all available verticals with metadata and live statistics",
    {},
    async (params) => toMcpResponse(await handleListVerticals(params, ctx))
  );

  // 17. schelling.onboard
  server.tool(
    "schelling.onboard",
    "Get collection guide for a specific vertical to help agents gather the right information from users",
    {
      vertical_id: z.string().describe("Vertical to get onboarding guide for (e.g. 'matchmaking', 'marketplace')"),
    },
    async (params) => toMcpResponse(await handleOnboard(params, ctx))
  );

  // 18. schelling.server_info
  server.tool(
    "schelling.server_info",
    "Get server metadata including protocol version, capabilities, and statistics",
    {},
    async (params) => toMcpResponse(await handleServerInfo(params, ctx))
  );
}
