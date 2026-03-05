import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HandlerContext, HandlerResult } from "../types.js";

// ─── Handler imports ────────────────────────────────────────────────
import { handleRegister } from "../handlers/register.js";
import { handleSearch } from "../handlers/search.js";
import { handleDecline } from "../handlers/decline.js";
import { handleWithdraw } from "../handlers/withdraw.js";
import { handleOnboard } from "../handlers/onboard.js";
import { handleServerInfo } from "../handlers/server-info.js";
import { handleDescribe } from "../handlers/describe.js";
import { handleClusters, handleClusterInfo } from "../handlers/clusters.js";
import { handleUpdate } from "../handlers/update.js";
import { handleInterest } from "../handlers/interest.js";
import { handleCommit } from "../handlers/commit.js";
import { handleReport } from "../handlers/report.js";
import { handleConnections } from "../handlers/connections.js";
import { handlePending } from "../handlers/pending.js";
import { handleContract } from "../handlers/contract.js";
import { handleDeliver } from "../handlers/deliver.js";
import { handleAcceptDelivery } from "../handlers/accept-delivery.js";
import { handleDeliveries } from "../handlers/deliveries.js";
import { handleMessage } from "../handlers/message.js";
import { handleMessages } from "../handlers/messages.js";
import { handleDirect } from "../handlers/direct.js";
import { handleRelayBlock } from "../handlers/relay-block.js";
import { handleInquire } from "../handlers/inquire.js";
import { handleDispute } from "../handlers/dispute.js";
import { handleJuryDuty } from "../handlers/jury-duty.js";
import { handleJuryVerdict } from "../handlers/jury-verdict.js";
import { handleVerify } from "../handlers/verify.js";
import { handleReputation } from "../handlers/reputation.js";
import { handleSubscribe } from "../handlers/subscribe.js";
import { handleUnsubscribe } from "../handlers/unsubscribe.js";
import { handleNotifications } from "../handlers/notifications.js";
import { handleEvent } from "../handlers/event.js";
import { handleExport } from "../handlers/export.js";
import { handleDeleteAccount } from "../handlers/delete-account.js";
import { handleMyInsights } from "../handlers/my-insights.js";
import { handleAnalytics } from "../handlers/analytics.js";
import { handleRefresh } from "../handlers/refresh.js";
import { handleReconsider } from "../handlers/reconsider.js";
import {
  handleQuickSeek,
  handleQuickOffer,
  handleQuickMatch,
} from "../handlers/quick.js";
import {
  handleRegisterTool,
  handleListTools,
  handleToolInvoke,
  handleToolFeedback,
} from "../handlers/tools.js";
import { handleAgentSeek, handleAgentLookup } from "../handlers/agent-seek.js";

// ─── Helpers ────────────────────────────────────────────────────────

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

// ─── Tool Binding ───────────────────────────────────────────────────

export function bindTools(server: McpServer, ctx: HandlerContext): void {
  // ── Discovery ─────────────────────────────────────────────────────

  server.tool(
    "describe",
    "Discover what this Schelling Protocol server does and its available clusters",
    {},
    async () => toMcpResponse(await handleDescribe({}, ctx)),
  );

  server.tool(
    "server_info",
    "Get server metadata: protocol version, capabilities, rate limits, statistics",
    {},
    async () => toMcpResponse(await handleServerInfo({}, ctx)),
  );

  server.tool(
    "clusters",
    "List or search available dynamic clusters",
    {
      query: z.string().optional().describe("Search query for clusters"),
      prefix: z.string().optional().describe("Filter by cluster ID prefix"),
      limit: z.number().optional().describe("Max results (default 50)"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    async (params) => toMcpResponse(await handleClusters(params, ctx)),
  );

  server.tool(
    "cluster_info",
    "Get detailed information about a specific cluster including norms",
    {
      cluster_id: z.string().describe("Cluster ID to look up"),
    },
    async (params) => toMcpResponse(await handleClusterInfo(params, ctx)),
  );

  // ── Registration ──────────────────────────────────────────────────

  server.tool(
    "onboard",
    "Natural language onboarding: describe what you want and get a registration template",
    {
      natural_language: z.string().describe("Natural language description of what the user wants"),
      cluster_id: z.string().optional().describe("Cluster to onboard into (auto-detected if omitted)"),
    },
    async (params) => toMcpResponse(await handleOnboard(params, ctx)),
  );

  server.tool(
    "register",
    "Register a participant in a cluster with traits and preferences",
    {
      protocol_version: z.string().describe("Must be '3.0'"),
      cluster_id: z.string().describe("Cluster to register in"),
      role: z.string().optional().describe("Role within cluster"),
      agent_model: z.string().optional().describe("AI model identifier"),
      traits: z.array(z.any()).optional().describe("Array of trait objects"),
      preferences: z.array(z.any()).optional().describe("Array of preference objects"),
      intent_embedding: z.array(z.number()).optional().describe("16-dim intent vector"),
      phone_hash: z.string().optional().describe("Hashed phone for Sybil resistance"),
      identity: z.any().optional().describe("Identity info (name, contact)"),
      text_profile: z.any().optional().describe("Text profile (description, seeking)"),
      agent_capabilities: z.array(z.any()).optional().describe("Agent capabilities"),
      agent_attestation: z.any().optional().describe("Agent attestation metadata"),
      funnel_mode: z.string().optional().describe("bilateral, broadcast, group, or auction"),
      user_token: z.string().optional().describe("Existing token for re-registration"),
      idempotency_key: z.string().optional().describe("Idempotency key"),
    },
    async (params) => toMcpResponse(await handleRegister(params, ctx)),
  );

  server.tool(
    "update",
    "Update traits, preferences, or profile fields for an existing registration",
    {
      user_token: z.string().describe("Your bearer token"),
      traits: z.array(z.any()).optional().describe("Traits to upsert"),
      remove_traits: z.array(z.string()).optional().describe("Trait keys to remove"),
      preferences: z.array(z.any()).optional().describe("Preferences to upsert"),
      remove_preferences: z.array(z.string()).optional().describe("Preference trait_keys to remove"),
      intent_embedding: z.array(z.number()).optional().describe("Updated intent embedding"),
      text_profile: z.any().optional().describe("Updated text profile"),
      status: z.string().optional().describe("active, paused"),
      idempotency_key: z.string().optional().describe("Idempotency key"),
    },
    async (params) => toMcpResponse(await handleUpdate(params, ctx)),
  );

  server.tool(
    "refresh",
    "Reset the staleness clock on your profile",
    {
      user_token: z.string().describe("Your bearer token"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleRefresh(params, ctx)),
  );

  // ── Search ────────────────────────────────────────────────────────

  server.tool(
    "search",
    "Search for compatible candidates using preferences, traits, and intent similarity",
    {
      user_token: z.string().describe("Your bearer token"),
      cluster_id: z.string().optional().describe("Cluster to search (defaults to your cluster)"),
      natural_language: z.string().optional().describe("Natural language search query"),
      preference_overrides: z.array(z.any()).optional().describe("Temporary preference overrides"),
      trait_filters: z.array(z.any()).optional().describe("Hard trait filters"),
      capability_filters: z.array(z.string()).optional().describe("Required agent capabilities (legacy, string matching)"),
      capability_query: z.object({
        name: z.string().optional().describe("Capability name to match"),
        input_types: z.array(z.string()).optional().describe("Required input MIME types"),
        output_types: z.array(z.string()).optional().describe("Required output MIME types"),
        min_confidence: z.number().optional().describe("Minimum confidence 0-1"),
        min_availability: z.number().optional().describe("Minimum SLA availability 0-1"),
      }).optional().describe("Structured capability query (matches structured capabilities)"),
      mode_filter: z.string().optional().describe("Filter by funnel mode"),
      min_advisory_score: z.number().optional().describe("Minimum advisory score threshold"),
      max_results: z.number().optional().describe("Max results (default 20)"),
      cursor: z.string().optional().describe("Pagination cursor"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleSearch(params, ctx)),
  );

  // ── Fast Paths ────────────────────────────────────────────────────

  server.tool(
    "quick_seek",
    "Fast path: describe what you need in natural language, auto-register and search",
    {
      user_token: z.string().optional().describe("Bearer token (auto-registers if omitted)"),
      intent: z.string().describe("What you're looking for in natural language"),
      cluster_id: z.string().optional().describe("Cluster (auto-detected if omitted)"),
      constraints: z.any().optional().describe("Structured constraints"),
      max_results: z.number().optional().describe("Max results (default 5)"),
      auto_advance: z.boolean().optional().describe("Auto-advance top candidates to INTERESTED"),
      deadline: z.string().optional().describe("ISO 8601 deadline"),
      budget: z.any().optional().describe("Budget constraints"),
    },
    async (params) => toMcpResponse(await handleQuickSeek(params, ctx)),
  );

  server.tool(
    "quick_offer",
    "Fast path: describe what you offer, auto-register and subscribe to matching seekers",
    {
      user_token: z.string().optional().describe("Bearer token (auto-registers if omitted)"),
      intent: z.string().describe("What you're offering in natural language"),
      cluster_id: z.string().optional().describe("Cluster (auto-detected if omitted)"),
      traits: z.any().optional().describe("Structured traits"),
      available_until: z.string().optional().describe("ISO 8601 availability deadline"),
      auto_subscribe: z.boolean().optional().describe("Auto-subscribe to matching seekers"),
      notification_threshold: z.number().optional().describe("Min advisory score for notifications"),
    },
    async (params) => toMcpResponse(await handleQuickOffer(params, ctx)),
  );

  server.tool(
    "quick_match",
    "Fast path: submit both seeker and offerer profiles for immediate matching",
    {
      seek: z.any().describe("Seeker profile: {intent, traits?, preferences?, cluster_id?}"),
      offer: z.any().describe("Offerer profile: {intent, traits?, cluster_id?}"),
      auto_connect: z.boolean().optional().describe("Auto-connect if matched"),
    },
    async (params) => toMcpResponse(await handleQuickMatch(params, ctx)),
  );

  // ── Funnel Operations ─────────────────────────────────────────────

  server.tool(
    "interest",
    "Express interest in a candidate (DISCOVERED → INTERESTED)",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      contract_proposal: z.any().optional().describe("Contract proposal for auction mode"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleInterest(params, ctx)),
  );

  server.tool(
    "commit",
    "Commit to a candidate (INTERESTED → COMMITTED, auto-connects if mutual)",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleCommit(params, ctx)),
  );

  server.tool(
    "connections",
    "List your candidate pairs with stage and trait visibility",
    {
      user_token: z.string().describe("Your bearer token"),
      stage_filter: z.number().optional().describe("Filter by minimum stage"),
      cluster_filter: z.string().optional().describe("Filter by cluster"),
      mode_filter: z.string().optional().describe("Filter by funnel mode"),
      limit: z.number().optional().describe("Max results"),
      cursor: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleConnections(params, ctx)),
  );

  server.tool(
    "decline",
    "Decline a candidate with escalating TTL (30d/90d/permanent)",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      reason: z.string().optional().describe("Reason: not_interested, dealbreaker, timing, logistics, other"),
      feedback: z.any().optional().describe("Structured feedback"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleDecline(params, ctx)),
  );

  server.tool(
    "reconsider",
    "Reconsider a previously declined candidate",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleReconsider(params, ctx)),
  );

  server.tool(
    "withdraw",
    "Withdraw from COMMITTED/CONNECTED (resets to INTERESTED)",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      reason: z.string().optional().describe("Reason for withdrawal"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleWithdraw(params, ctx)),
  );

  server.tool(
    "report",
    "Report the outcome of a connection (positive/neutral/negative)",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      outcome: z.enum(["positive", "neutral", "negative"]),
      feedback: z.any().optional().describe("Structured feedback"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleReport(params, ctx)),
  );

  server.tool(
    "pending",
    "Get unconsumed pending actions (stage changes, requests, etc.)",
    {
      user_token: z.string().describe("Your bearer token"),
    },
    async (params) => toMcpResponse(await handlePending(params, ctx)),
  );

  // ── Communication ─────────────────────────────────────────────────

  server.tool(
    "message",
    "Send a message through the relay (requires CONNECTED stage)",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      content: z.string().describe("Message content (max 5000 chars)"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleMessage(params, ctx)),
  );

  server.tool(
    "messages",
    "Retrieve message history for a candidate pair",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      since: z.string().optional().describe("ISO 8601 timestamp filter"),
      limit: z.number().optional().describe("Max messages (default 50)"),
      cursor: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleMessages(params, ctx)),
  );

  server.tool(
    "direct",
    "Share real contact info (mutual opt-in for exchange)",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      contact_info: z.string().describe("Your contact info (email, phone, URL)"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleDirect(params, ctx)),
  );

  server.tool(
    "relay_block",
    "Block or unblock message relay from a candidate",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      blocked: z.boolean().describe("true to block, false to unblock"),
    },
    async (params) => toMcpResponse(await handleRelayBlock(params, ctx)),
  );

  server.tool(
    "inquire",
    "Pre-commitment Q&A: ask/answer/list questions (requires INTERESTED stage)",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      action: z.enum(["ask", "answer", "list"]).describe("Action to perform"),
      question: z.string().optional().describe("Question text (for ask)"),
      category: z.string().optional().describe("dealbreakers, logistics, compensation, lifestyle, custom"),
      required: z.boolean().optional().describe("Whether answer is required"),
      inquiry_id: z.string().optional().describe("Inquiry ID (for answer)"),
      answer: z.string().optional().describe("Answer text (for answer)"),
      confidence: z.number().optional().describe("Answer confidence 0-1"),
      source: z.string().optional().describe("agent_knowledge or human_confirmed"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleInquire(params, ctx)),
  );

  // ── Contracts & Deliverables ──────────────────────────────────────

  server.tool(
    "contract",
    "Contract lifecycle: propose, accept, reject, counter, complete, terminate, list",
    {
      user_token: z.string().describe("Your bearer token"),
      action: z.enum(["propose", "accept", "reject", "counter", "complete", "terminate", "list"]),
      candidate_id: z.string().optional().describe("Candidate pair ID"),
      contract_id: z.string().optional().describe("Contract ID (for responses)"),
      terms: z.any().optional().describe("Contract terms (JSON)"),
      type: z.string().optional().describe("match, service, task, custom"),
      milestones: z.array(z.any()).optional().describe("Milestone definitions"),
      dispute_content_disclosure: z.boolean().optional(),
      safe_types: z.array(z.string()).optional(),
      terms_schema_version: z.string().optional(),
      expires_at: z.string().optional(),
      reason: z.string().optional(),
      status: z.string().optional().describe("Status filter for list"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleContract(params, ctx)),
  );

  server.tool(
    "deliver",
    "Deliver an artifact as fulfillment of a contract or milestone",
    {
      user_token: z.string().describe("Your bearer token"),
      contract_id: z.string().describe("Contract to deliver against"),
      deliverable: z.any().describe("Deliverable: {type, content, content_type?, filename?, metadata?, checksum?}"),
      milestone_id: z.string().optional(),
      message: z.string().optional().describe("Accompanying message"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleDeliver(params, ctx)),
  );

  server.tool(
    "accept_delivery",
    "Accept or reject a deliverable from counterparty",
    {
      user_token: z.string().describe("Your bearer token"),
      delivery_id: z.string().describe("Delivery to respond to"),
      accepted: z.boolean().describe("Whether to accept"),
      feedback: z.string().optional().describe("Feedback on deliverable"),
      rating: z.number().optional().describe("Quality rating 0-1"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleAcceptDelivery(params, ctx)),
  );

  server.tool(
    "deliveries",
    "List deliverables for a contract",
    {
      user_token: z.string().describe("Your bearer token"),
      contract_id: z.string().describe("Contract to list deliverables for"),
      status_filter: z.string().optional().describe("Filter: delivered, accepted, rejected, expired"),
    },
    async (params) => toMcpResponse(await handleDeliveries(params, ctx)),
  );

  // ── Events ────────────────────────────────────────────────────────

  server.tool(
    "event",
    "Lifecycle events: emit, acknowledge, or list events on matches/contracts",
    {
      user_token: z.string().describe("Your bearer token"),
      action: z.enum(["emit", "ack", "list"]).describe("Action"),
      candidate_id: z.string().optional(),
      contract_id: z.string().optional(),
      event_type: z.string().optional().describe("milestone_reached, schedule_change, etc."),
      payload: z.any().optional(),
      requires_ack: z.boolean().optional(),
      ack_deadline_hours: z.number().optional(),
      event_id: z.string().optional().describe("Event ID for ack"),
      response: z.string().optional().describe("Ack response"),
      since: z.string().optional(),
      limit: z.number().optional(),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleEvent(params, ctx)),
  );

  // ── Subscriptions ─────────────────────────────────────────────────

  server.tool(
    "subscribe",
    "Register a standing query for push-based discovery notifications",
    {
      user_token: z.string().describe("Your bearer token"),
      action: z.string().optional().describe("create (default) or list"),
      threshold: z.number().optional().describe("Min advisory score 0-1"),
      intent_embedding: z.array(z.number()).optional(),
      trait_filters: z.array(z.any()).optional(),
      capability_filters: z.array(z.string()).optional(),
      cluster_filter: z.string().optional(),
      mode_filter: z.string().optional(),
      max_notifications_per_day: z.number().optional(),
      ttl_days: z.number().optional(),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleSubscribe(params, ctx)),
  );

  server.tool(
    "unsubscribe",
    "Cancel a push-based discovery subscription",
    {
      user_token: z.string().describe("Your bearer token"),
      subscription_id: z.string().describe("Subscription to cancel"),
    },
    async (params) => toMcpResponse(await handleUnsubscribe(params, ctx)),
  );

  server.tool(
    "notifications",
    "List notifications from push-based discovery subscriptions",
    {
      user_token: z.string().describe("Your bearer token"),
      subscription_id: z.string().optional(),
      since: z.string().optional(),
      limit: z.number().optional(),
    },
    async (params) => toMcpResponse(await handleNotifications(params, ctx)),
  );

  // ── Reputation & Enforcement ──────────────────────────────────────

  server.tool(
    "reputation",
    "Get reputation score and history for self or counterpart",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().optional().describe("Get counterpart's reputation"),
    },
    async (params) => toMcpResponse(await handleReputation(params, ctx)),
  );

  server.tool(
    "dispute",
    "File a dispute against a counterparty (requires CONNECTED stage)",
    {
      user_token: z.string().describe("Your bearer token"),
      candidate_id: z.string().describe("Candidate pair ID"),
      reason: z.string().describe("Reason for dispute (max 5000 chars)"),
      evidence: z.array(z.string()).optional().describe("Evidence URLs/references"),
      trait_claims: z.array(z.any()).optional(),
      delivery_claims: z.array(z.any()).optional(),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleDispute(params, ctx)),
  );

  server.tool(
    "jury_duty",
    "List your assigned jury cases for dispute resolution",
    {
      user_token: z.string().describe("Your bearer token"),
    },
    async (params) => toMcpResponse(await handleJuryDuty(params, ctx)),
  );

  server.tool(
    "jury_verdict",
    "Submit a verdict on a dispute as a juror",
    {
      user_token: z.string().describe("Your bearer token"),
      dispute_id: z.string().describe("Dispute ID"),
      verdict: z.enum(["for_filer", "for_defendant", "dismissed"]),
      reasoning: z.string().describe("Verdict reasoning (max 5000 chars)"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleJuryVerdict(params, ctx)),
  );

  server.tool(
    "verify",
    "Submit verification evidence or request verification from counterpart",
    {
      user_token: z.string().describe("Your bearer token"),
      action: z.enum(["submit", "request"]).describe("Submit evidence or request from counterpart"),
      trait_key: z.string().describe("Trait to verify"),
      evidence_type: z.string().optional().describe("photo, document, link, attestation"),
      evidence_data: z.string().optional().describe("Evidence payload"),
      requested_tier: z.string().optional().describe("self_verified, cross_verified, authority_verified"),
      candidate_id: z.string().optional().describe("For request action"),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleVerify(params, ctx)),
  );

  // ── Tools ─────────────────────────────────────────────────────────

  server.tool(
    "register_tool",
    "Register a third-party tool in the pluggable ecosystem",
    {
      user_token: z.string().describe("Developer bearer token"),
      tool_id: z.string().describe("Namespaced tool ID: {developer}.{tool_name}"),
      display_name: z.string().describe("Human-readable name"),
      description: z.string().describe("Full description"),
      one_line_description: z.string().describe("One-line summary"),
      endpoint: z.string().describe("HTTPS endpoint"),
      input_schema: z.any().describe("JSON Schema for input"),
      output_schema: z.any().describe("JSON Schema for output"),
      cluster_scope: z.array(z.string()).optional(),
      pricing: z.any().optional(),
      version: z.string().describe("Semantic version"),
      health_check_endpoint: z.string().optional(),
      idempotency_key: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleRegisterTool(params, ctx)),
  );

  server.tool(
    "list_tools",
    "Discover available tools (default and third-party)",
    {
      cluster_id: z.string().optional(),
      query: z.string().optional(),
      type: z.string().optional().describe("default, third_party, or all"),
      min_reputation: z.number().optional(),
      limit: z.number().optional(),
      cursor: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleListTools(params, ctx)),
  );

  server.tool(
    "tool_invoke",
    "Invoke a tool (default or third-party)",
    {
      user_token: z.string().describe("Your bearer token"),
      tool_id: z.string().describe("Tool to invoke"),
      input: z.any().describe("Tool-specific input"),
    },
    async (params) => toMcpResponse(await handleToolInvoke(params, ctx)),
  );

  server.tool(
    "tool_feedback",
    "Provide feedback on a tool invocation",
    {
      user_token: z.string().describe("Your bearer token"),
      tool_id: z.string().describe("Tool to rate"),
      rating: z.enum(["positive", "negative"]),
      comment: z.string().optional(),
      invocation_id: z.string().optional(),
    },
    async (params) => toMcpResponse(await handleToolFeedback(params, ctx)),
  );

  // ── Analytics ─────────────────────────────────────────────────────

  server.tool(
    "my_insights",
    "Get personalized insights: profile completeness, funnel stats, suggestions",
    {
      user_token: z.string().describe("Your bearer token"),
    },
    async (params) => toMcpResponse(await handleMyInsights(params, ctx)),
  );

  server.tool(
    "analytics",
    "System-wide analytics (admin only)",
    {
      admin_token: z.string().describe("Admin authentication token"),
      cluster_id: z.string().optional(),
      time_range: z.string().optional().describe("ISO 8601 date range"),
    },
    async (params) => toMcpResponse(await handleAnalytics(params, ctx)),
  );

  // ── Privacy ───────────────────────────────────────────────────────

  server.tool(
    "export",
    "Export all your data (GDPR/CCPA compliance)",
    {
      user_token: z.string().describe("Your bearer token"),
      format: z.string().optional().describe("json (default) or csv"),
    },
    async (params) => toMcpResponse(await handleExport(params, ctx)),
  );

  server.tool(
    "delete_account",
    "Permanently delete your account and all associated data",
    {
      user_token: z.string().describe("Your bearer token"),
      confirmation: z.string().describe("Must be exactly 'PERMANENTLY_DELETE'"),
    },
    async (params) => toMcpResponse(await handleDeleteAccount(params, ctx)),
  );

  // ── Agent Convenience (alias-based) ───────────────────────────────

  server.tool(
    "agent_seek",
    "All-in-one: register (or reuse existing alias) + search for matches. Designed for AI agents acting on behalf of users.",
    {
      alias: z.string().describe("Persistent alias for the agent/user, e.g. 'telegram:cody'"),
      intent: z.string().describe("Natural language description of what the user is looking for"),
      cluster_id: z.string().optional().describe("Cluster to search (auto-detected if omitted)"),
    },
    async (params) => toMcpResponse(await handleAgentSeek(params, ctx)),
  );

  server.tool(
    "agent_lookup",
    "Look up an existing alias to get the associated user_token (returns null if not found)",
    {
      alias: z.string().describe("Alias to look up, e.g. 'telegram:cody'"),
    },
    async (params) => toMcpResponse(await handleAgentLookup(params, ctx)),
  );
}
