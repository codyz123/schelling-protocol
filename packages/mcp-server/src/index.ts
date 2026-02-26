#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Configuration ───────────────────────────────────────────────────

const SERVER_URL = (
  process.env.SCHELLING_SERVER_URL || "http://localhost:3000"
).replace(/\/$/, "");

// ─── REST Client ─────────────────────────────────────────────────────

async function call(
  operation: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const url = `${SERVER_URL}/schelling/${operation}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      body.message || body.error || `HTTP ${res.status} from ${operation}`,
    );
  }
  return body;
}

function toMcp(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function toMcpError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

async function mcpCall(operation: string, params: Record<string, unknown> = {}) {
  try {
    return toMcp(await call(operation, params));
  } catch (err) {
    return toMcpError(err);
  }
}

// ─── MCP Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: "schelling",
  version: "3.0.0",
});

// ── Discovery ────────────────────────────────────────────────────────

server.tool(
  "schelling.describe",
  "Discover what the Schelling coordination network offers. Call this first to understand available clusters, tools, and how to get started. Returns a compact overview designed for AI agents.",
  {},
  async () => mcpCall("describe"),
);

server.tool(
  "schelling.server_info",
  "Get server metadata: protocol version, capabilities, rate limits, and network statistics.",
  {},
  async () => mcpCall("server_info"),
);

server.tool(
  "schelling.clusters",
  "Browse the coordination network. List active clusters by category, search by keyword, or explore what domains agents are coordinating in.",
  {
    action: z.enum(["list", "search", "describe"]).optional().describe("Action: list (default), search, or describe a specific cluster"),
    query: z.string().optional().describe("Search query to find clusters by name or description"),
    prefix: z.string().optional().describe("Filter by namespace prefix (e.g. 'hiring.engineering')"),
    min_population: z.number().optional().describe("Minimum number of active participants"),
    sort: z.enum(["population", "created", "activity"]).optional().describe("Sort order"),
    limit: z.number().optional().describe("Max results (default 50, max 200)"),
    cursor: z.string().optional().describe("Pagination cursor from previous response"),
  },
  async (params) => mcpCall("clusters", params),
);

server.tool(
  "schelling.cluster_info",
  "Get detailed information about a specific cluster — its norms, common traits, suggested schema, and population stats. Useful before registering.",
  {
    cluster_id: z.string().describe("The cluster ID to inspect (e.g. 'hiring.engineering.frontend')"),
  },
  async (params) => mcpCall("cluster_info", params),
);

// ── Onboarding & Registration ────────────────────────────────────────

server.tool(
  "schelling.onboard",
  "Start using Schelling with zero configuration. Describe what you need in plain English and get back a registration template with suggested cluster, traits, and preferences. The easiest way to get started.",
  {
    natural_language: z.string().describe("What you want in plain English (e.g. 'I need a React developer in Denver, $120/hr')"),
    cluster_id: z.string().optional().describe("Target cluster (auto-detected from your description if omitted)"),
  },
  async (params) => mcpCall("onboard", params),
);

server.tool(
  "schelling.register",
  "Register a participant in the coordination network with structured traits and preferences. Use schelling.onboard first to get a template, then pass it here.",
  {
    protocol_version: z.string().describe("Must be '3.0'"),
    cluster_id: z.string().describe("Cluster to register in (e.g. 'hiring.engineering.frontend')"),
    role: z.string().optional().describe("Role within the cluster (cluster-defined)"),
    agent_model: z.string().optional().describe("AI model identifier"),
    traits: z.array(z.any()).optional().describe("Array of trait objects: [{key, value, value_type, visibility}]"),
    preferences: z.array(z.any()).optional().describe("Array of preference objects: [{trait_key, operator, value, weight}]"),
    intent_embedding: z.array(z.number()).optional().describe("16-dimensional intent vector"),
    intents: z.array(z.string()).optional().describe("Natural language intent descriptions (max 5)"),
    phone_hash: z.string().optional().describe("SHA-256 hash of phone for Sybil resistance"),
    identity: z.any().optional().describe("Identity info: {name?, contact?, phone_hash?}"),
    text_profile: z.any().optional().describe("Free text: {description?, seeking?, interests?, values_text?}"),
    agent_capabilities: z.array(z.any()).optional().describe("Agent capabilities"),
    funnel_mode: z.enum(["bilateral", "broadcast", "group", "auction"]).optional().describe("Coordination mode (default: bilateral)"),
    group_size: z.number().optional().describe("Target group size for group mode (2-50)"),
    media_refs: z.array(z.string()).optional().describe("URLs to photos/media"),
    user_token: z.string().optional().describe("Existing token for re-registration"),
    idempotency_key: z.string().optional().describe("Idempotency key to prevent duplicates"),
  },
  async (params) => mcpCall("register", params),
);

server.tool(
  "schelling.update",
  "Update your registration — add/remove traits, change preferences, update your profile, or pause your listing.",
  {
    user_token: z.string().describe("Your bearer token from registration"),
    traits: z.array(z.any()).optional().describe("Traits to upsert"),
    remove_traits: z.array(z.string()).optional().describe("Trait keys to remove"),
    preferences: z.array(z.any()).optional().describe("Preferences to upsert"),
    remove_preferences: z.array(z.string()).optional().describe("Preference trait_keys to remove"),
    intent_embedding: z.array(z.number()).optional().describe("Updated 16-dim intent vector"),
    intents: z.array(z.string()).optional().describe("Updated intent descriptions"),
    text_profile: z.any().optional().describe("Updated text profile"),
    status: z.enum(["active", "paused"]).optional().describe("Set status (paused hides from search)"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("update", params),
);

server.tool(
  "schelling.refresh",
  "Reset the staleness clock on your profile, signaling you're still active.",
  {
    user_token: z.string().describe("Your bearer token"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("refresh", params),
);

// ── Fast-Path Operations ─────────────────────────────────────────────

server.tool(
  "schelling.quick_seek",
  "Find what you need in one call. Describe your requirements in natural language or structured format. Auto-registers you if needed and returns ranked candidates immediately. The fastest way to search.",
  {
    intent: z.string().describe("What you're looking for in plain English (e.g. 'Python developer, 5+ years, remote, under $100/hr')"),
    user_token: z.string().optional().describe("Bearer token (auto-registers you if omitted)"),
    cluster_id: z.string().optional().describe("Target cluster (auto-detected if omitted)"),
    constraints: z.any().optional().describe("Structured constraints as preference objects"),
    max_results: z.number().optional().describe("Max candidates to return (default 5)"),
    auto_advance: z.boolean().optional().describe("Auto-advance top candidates to INTERESTED stage"),
    deadline: z.string().optional().describe("ISO 8601 deadline for urgency"),
    budget: z.any().optional().describe("Budget constraints: {min?, max?, currency?}"),
  },
  async (params) => mcpCall("quick_seek", params),
);

server.tool(
  "schelling.quick_offer",
  "Advertise a service or capability in one call. Describe what you offer and get matched with seekers. Auto-registers and optionally subscribes to incoming requests.",
  {
    intent: z.string().describe("What you're offering in plain English (e.g. 'I do React development, 5 years experience, Denver, $90/hr')"),
    user_token: z.string().optional().describe("Bearer token (auto-registers if omitted)"),
    cluster_id: z.string().optional().describe("Target cluster (auto-detected if omitted)"),
    traits: z.any().optional().describe("Structured traits for your offering"),
    available_until: z.string().optional().describe("ISO 8601 availability deadline"),
    auto_subscribe: z.boolean().optional().describe("Auto-subscribe to matching seekers (default true)"),
    notification_threshold: z.number().optional().describe("Minimum fit score for notifications (0-1)"),
  },
  async (params) => mcpCall("quick_offer", params),
);

server.tool(
  "schelling.quick_match",
  "Submit both sides of a coordination problem for instant matching. Provide a seeker and offerer profile and get an immediate compatibility assessment.",
  {
    seek: z.any().describe("Seeker profile: {intent, traits?, preferences?, cluster_id?}"),
    offer: z.any().describe("Offerer profile: {intent, traits?, cluster_id?}"),
    auto_connect: z.boolean().optional().describe("Auto-connect if match quality is high"),
  },
  async (params) => mcpCall("quick_match", params),
);

// ── Search ───────────────────────────────────────────────────────────

server.tool(
  "schelling.search",
  "Advanced search for compatible candidates using preferences, trait filters, intent similarity, and the learned ranking model. Supports natural language queries alongside structured filters.",
  {
    user_token: z.string().describe("Your bearer token"),
    cluster_id: z.string().optional().describe("Cluster to search (defaults to your cluster)"),
    natural_language: z.string().optional().describe("Natural language search query"),
    preference_overrides: z.array(z.any()).optional().describe("Temporary preference overrides for this search"),
    trait_filters: z.array(z.any()).optional().describe("Hard trait filters"),
    capability_filters: z.array(z.string()).optional().describe("Required agent capabilities"),
    mode_filter: z.enum(["bilateral", "broadcast", "group", "auction"]).optional().describe("Filter by coordination mode"),
    min_advisory_score: z.number().optional().describe("Minimum match score threshold (0-1)"),
    max_results: z.number().optional().describe("Max results (default 20)"),
    cursor: z.string().optional().describe("Pagination cursor"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("search", params),
);

// ── Funnel Operations ────────────────────────────────────────────────

server.tool(
  "schelling.interest",
  "Express interest in a candidate, advancing from DISCOVERED to INTERESTED stage. This signals you want to explore this match further.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID from search results"),
    contract_proposal: z.any().optional().describe("Contract proposal (for auction mode)"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("interest", params),
);

server.tool(
  "schelling.commit",
  "Commit to a candidate (INTERESTED to COMMITTED). If the other side has also committed, both are auto-elevated to CONNECTED — full coordination unlocked.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("commit", params),
);

server.tool(
  "schelling.connections",
  "List your candidate pairs with their funnel stages and visible traits. See who you've discovered, expressed interest in, or connected with.",
  {
    user_token: z.string().describe("Your bearer token"),
    stage_filter: z.number().optional().describe("Minimum stage: 1=DISCOVERED, 2=INTERESTED, 3=COMMITTED, 4=CONNECTED"),
    cluster_filter: z.string().optional().describe("Filter by cluster"),
    mode_filter: z.string().optional().describe("Filter by funnel mode"),
    limit: z.number().optional().describe("Max results"),
    cursor: z.string().optional(),
  },
  async (params) => mcpCall("connections", params),
);

server.tool(
  "schelling.decline",
  "Decline a candidate. Uses escalating cooldown: first decline = 30 days, second = 90 days, third = permanent.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    reason: z.enum(["not_interested", "dealbreaker", "timing", "logistics", "other"]).optional().describe("Reason for declining"),
    feedback: z.any().optional().describe("Structured feedback to improve future matches"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("decline", params),
);

server.tool(
  "schelling.reconsider",
  "Reconsider a previously declined candidate, removing the active decline.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("reconsider", params),
);

server.tool(
  "schelling.withdraw",
  "Withdraw from a COMMITTED or CONNECTED match, resetting to INTERESTED stage.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    reason: z.string().optional().describe("Reason for withdrawal"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("withdraw", params),
);

server.tool(
  "schelling.report",
  "Report the outcome of a connection — positive, neutral, or negative. This feeds the learned ranking model and reputation system.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    outcome: z.enum(["positive", "neutral", "negative"]).describe("How the coordination went"),
    feedback: z.any().optional().describe("Structured feedback"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("report", params),
);

server.tool(
  "schelling.pending",
  "Check for pending actions — interest signals, stage changes, messages, and other events waiting for your attention.",
  {
    user_token: z.string().describe("Your bearer token"),
  },
  async (params) => mcpCall("pending", params),
);

// ── Communication ────────────────────────────────────────────────────

server.tool(
  "schelling.message",
  "Send a message through the relay to a connected counterpart. Requires CONNECTED stage.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    content: z.string().describe("Message content (max 5000 characters)"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("message", params),
);

server.tool(
  "schelling.messages",
  "Retrieve message history with a counterpart.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    since: z.string().optional().describe("ISO 8601 timestamp — only messages after this time"),
    limit: z.number().optional().describe("Max messages (default 50)"),
    cursor: z.string().optional(),
  },
  async (params) => mcpCall("messages", params),
);

server.tool(
  "schelling.direct",
  "Share direct contact info with a connected counterpart. Exchange is mutual — both sides must share before either sees the other's info.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    contact_info: z.string().describe("Your contact info (email, phone, URL, etc.)"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("direct", params),
);

server.tool(
  "schelling.relay_block",
  "Block or unblock message relay from a specific counterpart.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    blocked: z.boolean().describe("true to block, false to unblock"),
  },
  async (params) => mcpCall("relay_block", params),
);

server.tool(
  "schelling.inquire",
  "Pre-commitment Q&A: ask questions, provide answers, or list open inquiries. Available at INTERESTED stage before committing.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    action: z.enum(["ask", "answer", "list"]).describe("ask a question, answer one, or list all"),
    question: z.string().optional().describe("Question text (for ask action)"),
    category: z.enum(["dealbreakers", "logistics", "compensation", "lifestyle", "custom"]).optional().describe("Question category"),
    required: z.boolean().optional().describe("Whether an answer is required before committing"),
    inquiry_id: z.string().optional().describe("Inquiry ID (for answer action)"),
    answer: z.string().optional().describe("Answer text (for answer action)"),
    confidence: z.number().optional().describe("Answer confidence 0-1"),
    source: z.enum(["agent_knowledge", "human_confirmed"]).optional().describe("Answer source"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("inquire", params),
);

// ── Contracts & Deliverables ─────────────────────────────────────────

server.tool(
  "schelling.contract",
  "Full contract lifecycle: propose terms, accept/reject/counter offers, complete or terminate contracts. Supports multi-round negotiation with milestones.",
  {
    user_token: z.string().describe("Your bearer token"),
    action: z.enum(["propose", "accept", "reject", "counter", "complete", "terminate", "list"]).describe("Contract action"),
    candidate_id: z.string().optional().describe("Candidate pair ID (for propose/list)"),
    contract_id: z.string().optional().describe("Contract ID (for accept/reject/counter/complete/terminate)"),
    terms: z.any().optional().describe("Contract terms as JSON"),
    type: z.enum(["match", "service", "task", "custom"]).optional().describe("Contract type"),
    milestones: z.array(z.any()).optional().describe("Milestone definitions"),
    dispute_content_disclosure: z.boolean().optional().describe("Allow contract content in disputes"),
    safe_types: z.array(z.string()).optional().describe("Allowed deliverable types"),
    terms_schema_version: z.string().optional(),
    expires_at: z.string().optional().describe("ISO 8601 expiration"),
    reason: z.string().optional().describe("Reason (for reject/terminate)"),
    status: z.string().optional().describe("Status filter (for list)"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("contract", params),
);

server.tool(
  "schelling.deliver",
  "Deliver an artifact as fulfillment of a contract or milestone. Supports any content type.",
  {
    user_token: z.string().describe("Your bearer token"),
    contract_id: z.string().describe("Contract to deliver against"),
    deliverable: z.any().describe("Deliverable: {type, content, content_type?, filename?, metadata?, checksum?}"),
    milestone_id: z.string().optional().describe("Specific milestone being fulfilled"),
    message: z.string().optional().describe("Accompanying message"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("deliver", params),
);

server.tool(
  "schelling.accept_delivery",
  "Accept or reject a deliverable from your counterpart, with optional rating and feedback.",
  {
    user_token: z.string().describe("Your bearer token"),
    delivery_id: z.string().describe("Delivery ID to respond to"),
    accepted: z.boolean().describe("Accept (true) or reject (false)"),
    feedback: z.string().optional().describe("Feedback on the deliverable"),
    rating: z.number().optional().describe("Quality rating 0-1"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("accept_delivery", params),
);

server.tool(
  "schelling.deliveries",
  "List deliverables for a contract, optionally filtered by status.",
  {
    user_token: z.string().describe("Your bearer token"),
    contract_id: z.string().describe("Contract ID"),
    status_filter: z.enum(["delivered", "accepted", "rejected", "expired"]).optional().describe("Filter by delivery status"),
  },
  async (params) => mcpCall("deliveries", params),
);

// ── Events ───────────────────────────────────────────────────────────

server.tool(
  "schelling.event",
  "Lifecycle events on matches and contracts: emit custom events, acknowledge events, or list event history.",
  {
    user_token: z.string().describe("Your bearer token"),
    action: z.enum(["emit", "ack", "list"]).describe("Action to perform"),
    candidate_id: z.string().optional().describe("Candidate pair ID"),
    contract_id: z.string().optional().describe("Contract ID"),
    event_type: z.string().optional().describe("Event type (e.g. milestone_reached, schedule_change)"),
    payload: z.any().optional().describe("Event payload"),
    requires_ack: z.boolean().optional().describe("Whether counterpart must acknowledge"),
    ack_deadline_hours: z.number().optional().describe("Hours until ack deadline"),
    event_id: z.string().optional().describe("Event ID (for ack action)"),
    response: z.string().optional().describe("Acknowledgment response"),
    since: z.string().optional().describe("ISO 8601 timestamp filter"),
    limit: z.number().optional().describe("Max events to return"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("event", params),
);

// ── Subscriptions ────────────────────────────────────────────────────

server.tool(
  "schelling.subscribe",
  "Set up push-based discovery: get notified when new participants matching your criteria appear in the network.",
  {
    user_token: z.string().describe("Your bearer token"),
    action: z.enum(["create", "list"]).optional().describe("Create a subscription or list existing ones"),
    threshold: z.number().optional().describe("Minimum match score for notification (0-1)"),
    intent_embedding: z.array(z.number()).optional().describe("16-dim intent vector for similarity matching"),
    trait_filters: z.array(z.any()).optional().describe("Trait-based filters"),
    capability_filters: z.array(z.string()).optional().describe("Required capabilities"),
    cluster_filter: z.string().optional().describe("Cluster to watch"),
    mode_filter: z.string().optional().describe("Funnel mode filter"),
    max_notifications_per_day: z.number().optional().describe("Daily notification cap"),
    ttl_days: z.number().optional().describe("Subscription lifetime in days"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("subscribe", params),
);

server.tool(
  "schelling.unsubscribe",
  "Cancel a push-based discovery subscription.",
  {
    user_token: z.string().describe("Your bearer token"),
    subscription_id: z.string().describe("Subscription to cancel"),
  },
  async (params) => mcpCall("unsubscribe", params),
);

server.tool(
  "schelling.notifications",
  "Check notifications from your push-based discovery subscriptions.",
  {
    user_token: z.string().describe("Your bearer token"),
    subscription_id: z.string().optional().describe("Filter by subscription"),
    since: z.string().optional().describe("ISO 8601 timestamp filter"),
    limit: z.number().optional().describe("Max notifications"),
  },
  async (params) => mcpCall("notifications", params),
);

// ── Reputation & Enforcement ─────────────────────────────────────────

server.tool(
  "schelling.reputation",
  "Check reputation scores — your own or a counterpart's. Shows trust level, interaction history, and cross-cluster reputation.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().optional().describe("Candidate pair ID to check counterpart's reputation"),
  },
  async (params) => mcpCall("reputation", params),
);

server.tool(
  "schelling.dispute",
  "File a formal dispute against a counterpart. Triggers the agent jury system for resolution. Requires CONNECTED stage.",
  {
    user_token: z.string().describe("Your bearer token"),
    candidate_id: z.string().describe("Candidate pair ID"),
    reason: z.string().describe("Reason for dispute (max 5000 chars)"),
    evidence: z.array(z.string()).optional().describe("Evidence URLs or references"),
    trait_claims: z.array(z.any()).optional().describe("Claims about misrepresented traits"),
    delivery_claims: z.array(z.any()).optional().describe("Claims about failed deliverables"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("dispute", params),
);

server.tool(
  "schelling.jury_duty",
  "Check if you've been assigned as a juror for any disputes. Community-driven dispute resolution.",
  {
    user_token: z.string().describe("Your bearer token"),
  },
  async (params) => mcpCall("jury_duty", params),
);

server.tool(
  "schelling.jury_verdict",
  "Submit your verdict on a dispute as a juror.",
  {
    user_token: z.string().describe("Your bearer token"),
    dispute_id: z.string().describe("Dispute ID"),
    verdict: z.enum(["for_filer", "for_defendant", "dismissed"]).describe("Your verdict"),
    reasoning: z.string().describe("Reasoning for your verdict (max 5000 chars)"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("jury_verdict", params),
);

server.tool(
  "schelling.verify",
  "Submit verification evidence for your traits or request verification from a counterpart. Verified traits build trust.",
  {
    user_token: z.string().describe("Your bearer token"),
    action: z.enum(["submit", "request"]).describe("Submit your own evidence or request from counterpart"),
    trait_key: z.string().describe("Trait key to verify"),
    evidence_type: z.enum(["photo", "document", "link", "attestation"]).optional().describe("Type of evidence"),
    evidence_data: z.string().optional().describe("Evidence payload"),
    requested_tier: z.enum(["self_verified", "cross_verified", "authority_verified"]).optional().describe("Requested verification level"),
    candidate_id: z.string().optional().describe("Candidate pair ID (for request action)"),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("verify", params),
);

// ── Tools Ecosystem ──────────────────────────────────────────────────

server.tool(
  "schelling.register_tool",
  "Register a third-party tool in the Schelling ecosystem. Tools extend coordination capabilities — skill assessments, background checks, portfolio reviews, and more.",
  {
    user_token: z.string().describe("Developer bearer token"),
    tool_id: z.string().describe("Namespaced tool ID: {developer}.{tool_name}"),
    display_name: z.string().describe("Human-readable name"),
    description: z.string().describe("Full description"),
    one_line_description: z.string().describe("One-line summary"),
    endpoint: z.string().describe("HTTPS endpoint for tool invocation"),
    input_schema: z.any().describe("JSON Schema for tool input"),
    output_schema: z.any().describe("JSON Schema for tool output"),
    cluster_scope: z.array(z.string()).optional().describe("Clusters this tool applies to"),
    pricing: z.any().optional().describe("Pricing: {model, amount?, currency?}"),
    version: z.string().describe("Semantic version"),
    health_check_endpoint: z.string().optional(),
    idempotency_key: z.string().optional(),
  },
  async (params) => mcpCall("register_tool", params),
);

server.tool(
  "schelling.list_tools",
  "Discover available tools in the ecosystem — both built-in and third-party. Tools enhance matching, verification, and coordination.",
  {
    cluster_id: z.string().optional().describe("Filter by cluster relevance"),
    query: z.string().optional().describe("Search tools by keyword"),
    type: z.enum(["default", "third_party", "all"]).optional().describe("Tool type filter"),
    min_reputation: z.number().optional().describe("Minimum tool reputation score"),
    limit: z.number().optional().describe("Max results"),
    cursor: z.string().optional(),
  },
  async (params) => mcpCall("list_tools", params),
);

server.tool(
  "schelling.tool_invoke",
  "Invoke a tool from the ecosystem (built-in or third-party).",
  {
    user_token: z.string().describe("Your bearer token"),
    tool_id: z.string().describe("Tool to invoke"),
    input: z.any().describe("Tool-specific input payload"),
  },
  async (params) => mcpCall("tool/invoke", params),
);

server.tool(
  "schelling.tool_feedback",
  "Rate a tool invocation — helps the ecosystem surface the best tools.",
  {
    user_token: z.string().describe("Your bearer token"),
    tool_id: z.string().describe("Tool to rate"),
    rating: z.enum(["positive", "negative"]).describe("Your rating"),
    comment: z.string().optional().describe("Optional feedback"),
    invocation_id: z.string().optional(),
  },
  async (params) => mcpCall("tool/feedback", params),
);

// ── Analytics ────────────────────────────────────────────────────────

server.tool(
  "schelling.my_insights",
  "Get personalized insights about your profile: completeness score, funnel statistics, match quality trends, and optimization suggestions.",
  {
    user_token: z.string().describe("Your bearer token"),
  },
  async (params) => mcpCall("my_insights", params),
);

server.tool(
  "schelling.analytics",
  "System-wide analytics dashboard (admin only). Network statistics, cluster health, and growth metrics.",
  {
    admin_token: z.string().describe("Admin authentication token"),
    cluster_id: z.string().optional().describe("Filter by cluster"),
    time_range: z.string().optional().describe("ISO 8601 date range"),
  },
  async (params) => mcpCall("analytics", params),
);

// ── Privacy ──────────────────────────────────────────────────────────

server.tool(
  "schelling.export",
  "Export all your data from the network (GDPR/CCPA compliance).",
  {
    user_token: z.string().describe("Your bearer token"),
    format: z.enum(["json", "csv"]).optional().describe("Export format (default: json)"),
  },
  async (params) => mcpCall("export", params),
);

server.tool(
  "schelling.delete_account",
  "Permanently delete your account and all associated data. This cannot be undone.",
  {
    user_token: z.string().describe("Your bearer token"),
    confirmation: z.literal("PERMANENTLY_DELETE").describe("Must be exactly 'PERMANENTLY_DELETE'"),
  },
  async (params) => mcpCall("delete_account", params),
);

// ─── Start Server ────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
