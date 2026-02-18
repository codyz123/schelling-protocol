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
import { handleReconsider } from "../handlers/reconsider.js";
import { handleUpdate } from "../handlers/update.js";
import { handleRefresh } from "../handlers/refresh.js";
import { handleMessage } from "../handlers/message.js";
import { handleMessages } from "../handlers/messages.js";
import { handleDirect } from "../handlers/direct.js";
import { handleRelayBlock } from "../handlers/relay-block.js";
import { handlePending } from "../handlers/pending.js";
import { handleFeedback } from "../handlers/feedback.js";
import { handleMyInsights } from "../handlers/my-insights.js";
import { handleJuryDuty } from "../handlers/jury-duty.js";
import { handleJuryVerdict } from "../handlers/jury-verdict.js";
import { handleAnalytics } from "../handlers/analytics.js";
import { handleGroupEvaluate } from "../handlers/group-evaluate.js";
import { handleGroupCommit } from "../handlers/group-commit.js";
import { handleInquire } from "../handlers/inquire.js";
import { handleSubscribe } from "../handlers/subscribe.js";
import { handleUnsubscribe } from "../handlers/unsubscribe.js";
import { handleNotifications } from "../handlers/notifications.js";
import { handleContract } from "../handlers/contract.js";
import { handleContractUpdate } from "../handlers/contract-update.js";
import { handleEvent } from "../handlers/event.js";

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
      feedback: z
        .object({
          dimension_scores: z.record(z.number()).optional(),
          rejection_reason: z.string().optional(),
          rejection_freeform: z.string().optional(),
          satisfaction: z.enum(["very_satisfied", "satisfied", "neutral", "dissatisfied", "very_dissatisfied"]).optional(),
        })
        .optional()
        .describe("Optional structured feedback about the decline"),
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

  // 16. schelling.verticals (alias: schelling.clusters, schelling.intents)
  server.tool(
    "schelling.verticals",
    "List all available clusters (formerly verticals) with metadata and live statistics",
    {},
    async (params) => toMcpResponse(await handleListVerticals(params, ctx))
  );

  server.tool(
    "schelling.intents",
    "List all intent clusters with centroids, roles, modules, and onboarding guidance",
    {},
    async (params) => toMcpResponse(await handleListVerticals(params, ctx))
  );

  // schelling.reconsider
  server.tool(
    "schelling.reconsider",
    "Reconsider a previous decline, allowing the declined user to appear in search again",
    {
      user_token: z.string().describe("Your user token"),
      declined_token: z.string().describe("Token of the user whose decline to reconsider"),
    },
    async (params) => toMcpResponse(await handleReconsider(params, ctx))
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

  // schelling.update
  server.tool(
    "schelling.update",
    "Update user profile fields without re-registration. Optionally update embeddings with recompute_scores.",
    {
      user_token: z.string().describe("Your user token"),
      description: z.string().max(1000).optional(),
      seeking: z.string().max(500).optional(),
      interests: z.array(z.string()).optional(),
      values_text: z.string().max(500).optional(),
      city: z.string().optional(),
      age_range: z.enum(["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]).optional(),
      status: z.enum(["active", "paused"]).optional(),
      agent_model: z.string().optional(),
      deal_breakers: z.record(z.any()).optional(),
      media_refs: z.array(z.string()).optional(),
      identity: z.object({ name: z.string(), contact: z.string() }).optional(),
      embedding: z.array(z.number()).optional().describe("New 50-dim embedding (requires recompute_scores: true)"),
      intent_embedding: z.array(z.number()).optional().describe("New 16-dim intent embedding (requires recompute_scores: true)"),
      intents: z.array(z.string()).optional(),
      structured_attributes: z.record(z.any()).optional(),
      recompute_scores: z.boolean().optional().describe("Set true when updating embeddings"),
    },
    async (params) => toMcpResponse(await handleUpdate(params, ctx))
  );

  // schelling.refresh
  server.tool(
    "schelling.refresh",
    "Reset the staleness clock without modifying any profile data. Max once per 30 days.",
    {
      user_token: z.string().describe("Your user token"),
    },
    async (params) => toMcpResponse(await handleRefresh(params, ctx))
  );

  // schelling.message
  server.tool(
    "schelling.message",
    "Send a message to the other party in a CONNECTED match via the relay",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      content: z.string().max(5000).describe("Message content"),
      content_type: z.enum(["text", "markdown"]).default("text").optional(),
    },
    async (params) => toMcpResponse(await handleMessage(params, ctx))
  );

  // schelling.messages
  server.tool(
    "schelling.messages",
    "Retrieve message history for a CONNECTED match. Marks received messages as read.",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      limit: z.number().int().min(1).max(100).default(50).optional(),
      before: z.string().optional().describe("ISO timestamp — return messages before this time"),
      after: z.string().optional().describe("ISO timestamp — return messages after this time"),
    },
    async (params) => toMcpResponse(await handleMessages(params, ctx))
  );

  // schelling.direct
  server.tool(
    "schelling.direct",
    "Opt into sharing direct contact info with your match. When both opt in, real contact info is shared.",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate pair ID"),
    },
    async (params) => toMcpResponse(await handleDirect(params, ctx))
  );

  // schelling.relay_block
  server.tool(
    "schelling.relay_block",
    "Block or unblock message relay from the other party in a match",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      block: z.boolean().describe("true to block, false to unblock"),
    },
    async (params) => toMcpResponse(await handleRelayBlock(params, ctx))
  );

  // schelling.pending
  server.tool(
    "schelling.pending",
    "Get all pending actions for your account (evaluate, exchange, messages, disputes, etc.)",
    {
      user_token: z.string().describe("Your user token"),
    },
    async (params) => toMcpResponse(await handlePending(params, ctx))
  );

  // schelling.feedback
  server.tool(
    "schelling.feedback",
    "Submit structured feedback about a match — dimension scores, satisfaction, recommendation",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      dimension_scores: z.record(z.number().min(-1).max(1)).optional().describe("Dimension deviation scores [-1, 1]"),
      satisfaction: z.enum(["very_satisfied", "satisfied", "neutral", "dissatisfied", "very_dissatisfied"]).optional(),
      would_recommend: z.boolean().optional(),
      rejection_reason: z.string().optional(),
      rejection_freeform: z.string().optional(),
      what_i_wanted: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleFeedback(params, ctx))
  );

  // schelling.my_insights
  server.tool(
    "schelling.my_insights",
    "Get aggregated feedback insights, learned preferences, and collaborative suggestions",
    {
      user_token: z.string().describe("Your user token"),
      cluster_id: z.string().optional().describe("Cluster to get insights for"),
    },
    async (params) => toMcpResponse(await handleMyInsights(params, ctx))
  );

  // schelling.jury_duty
  server.tool(
    "schelling.jury_duty",
    "View assigned jury cases awaiting your verdict",
    {
      user_token: z.string().describe("Your user token"),
    },
    async (params) => toMcpResponse(await handleJuryDuty(params, ctx))
  );

  // schelling.jury_verdict
  server.tool(
    "schelling.jury_verdict",
    "Submit your verdict as a juror on a dispute case",
    {
      user_token: z.string().describe("Your user token"),
      dispute_id: z.string().describe("Dispute ID to vote on"),
      verdict: z.enum(["for_filer", "for_defendant", "dismissed"]).describe("Your verdict"),
      reasoning: z.string().min(10).max(2000).describe("Reasoning for your verdict"),
    },
    async (params) => toMcpResponse(await handleJuryVerdict(params, ctx))
  );

  // schelling.analytics
  server.tool(
    "schelling.analytics",
    "Get platform analytics — funnel metrics, outcome stats, A/B test results",
    {
      user_token: z.string().describe("Your user token (admin)"),
      cluster_id: z.string().optional(),
      time_range: z.object({
        start: z.string().optional(),
        end: z.string().optional(),
      }).optional(),
    },
    async (params) => toMcpResponse(await handleAnalytics(params, ctx))
  );

  // 18. schelling.server_info
  server.tool(
    "schelling.server_info",
    "Get server metadata including protocol version, capabilities, and statistics",
    {},
    async (params) => toMcpResponse(await handleServerInfo(params, ctx))
  );

  // Phase 14: schelling.group_evaluate
  server.tool(
    "schelling.group_evaluate",
    "Compute pairwise compatibility matrix for a proposed group of N candidates",
    {
      user_token: z.string().describe("Your user token"),
      cluster_id: z.string().describe("Cluster ID (must support groups)"),
      member_tokens: z.array(z.string()).min(2).max(10).describe("User tokens of proposed group members"),
    },
    async (params) => toMcpResponse(await handleGroupEvaluate(params, ctx))
  );

  // Phase 14: schelling.group_commit
  server.tool(
    "schelling.group_commit",
    "Create, join, or leave a group. Group completes when all members commit.",
    {
      user_token: z.string().describe("Your user token"),
      action: z.enum(["create", "join", "leave"]).describe("Action to perform"),
      cluster_id: z.string().optional().describe("Cluster ID (required for create)"),
      group_id: z.string().optional().describe("Group ID (required for join/leave)"),
      member_tokens: z.array(z.string()).optional().describe("Member tokens (required for create)"),
    },
    async (params) => toMcpResponse(await handleGroupCommit(params, ctx))
  );

  // Phase 16: schelling.inquire
  server.tool(
    "schelling.inquire",
    "Ask/answer structured questions at EVALUATED stage for pre-commitment dialogue",
    {
      user_token: z.string().describe("Your user token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      action: z.enum(["ask", "answer", "list"]).describe("Action: ask a question, answer one, or list Q&A"),
      question: z.string().max(2000).optional().describe("Question text (for ask)"),
      category: z.string().optional().describe("Question category"),
      required: z.boolean().optional().describe("Whether answer is required"),
      inquiry_id: z.string().optional().describe("Inquiry ID (for answer)"),
      answer: z.string().max(5000).optional().describe("Answer text (for answer)"),
      confidence: z.number().min(0).max(1).optional().describe("Confidence in answer"),
      source: z.enum(["agent_knowledge", "human_confirmed"]).optional(),
    },
    async (params) => toMcpResponse(await handleInquire(params, ctx))
  );

  // Phase 17: schelling.subscribe
  server.tool(
    "schelling.subscribe",
    "Register a standing query to get notified when matching users register",
    {
      user_token: z.string().describe("Your user token"),
      intent_embedding: z.array(z.number()).length(16).describe("16-dim intent embedding for matching"),
      hard_filters: z.record(z.any()).optional().describe("Hard attribute filters"),
      capability_filters: z.array(z.string()).optional().describe("Required capabilities"),
      threshold: z.number().min(0).max(1).describe("Minimum similarity threshold"),
      max_notifications_per_day: z.number().int().optional().default(10),
      ttl_days: z.number().int().optional().default(30),
    },
    async (params) => toMcpResponse(await handleSubscribe(params, ctx))
  );

  // Phase 17: schelling.unsubscribe
  server.tool(
    "schelling.unsubscribe",
    "Cancel an active subscription",
    {
      user_token: z.string().describe("Your user token"),
      subscription_id: z.string().describe("Subscription ID to cancel"),
    },
    async (params) => toMcpResponse(await handleUnsubscribe(params, ctx))
  );

  // Phase 17: schelling.notifications
  server.tool(
    "schelling.notifications",
    "Retrieve subscription match notifications",
    {
      user_token: z.string().describe("Your user token"),
      subscription_id: z.string().optional(),
      since: z.string().optional(),
      limit: z.number().int().optional().default(50),
    },
    async (params) => toMcpResponse(await handleNotifications(params, ctx))
  );

  // Phase 19: schelling.contract
  server.tool(
    "schelling.contract",
    "Propose, accept, reject, counter, complete, or terminate structured agreements",
    {
      user_token: z.string().describe("Your user token"),
      action: z.enum(["propose", "accept", "reject", "counter", "complete", "terminate", "list"]),
      candidate_id: z.string().optional(),
      contract_id: z.string().optional(),
      terms: z.record(z.any()).optional(),
      type: z.enum(["match", "service", "task", "custom"]).optional(),
      expires_at: z.string().optional(),
      reason: z.string().optional(),
      status: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleContract(params, ctx))
  );

  // Phase 19: schelling.contract_update
  server.tool(
    "schelling.contract_update",
    "Propose an amendment to an active contract",
    {
      user_token: z.string().describe("Your user token"),
      contract_id: z.string().describe("Contract ID"),
      updated_terms: z.record(z.any()).describe("Updated terms"),
      reason: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleContractUpdate(params, ctx))
  );

  // Phase 20: schelling.event
  server.tool(
    "schelling.event",
    "Emit, acknowledge, or list lifecycle events on matches/contracts",
    {
      user_token: z.string().describe("Your user token"),
      action: z.enum(["emit", "ack", "list"]),
      candidate_id: z.string().optional(),
      contract_id: z.string().optional(),
      type: z.enum(["milestone", "update", "completion", "issue", "custom"]).optional(),
      data: z.record(z.any()).optional(),
      requires_ack: z.boolean().optional(),
      ack_window_hours: z.number().optional(),
      event_id: z.string().optional(),
      ack_note: z.string().optional(),
      since: z.string().optional(),
      limit: z.number().int().optional(),
    },
    async (params) => toMcpResponse(await handleEvent(params, ctx))
  );
}
