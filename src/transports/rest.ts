import { serve } from "bun";
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

// ─── Operation router ───────────────────────────────────────────────

type HandlerFn = (params: any, ctx: HandlerContext) => Promise<HandlerResult<unknown>>;

const OPERATIONS: Record<string, HandlerFn> = {
  // Discovery
  describe: handleDescribe,
  server_info: handleServerInfo,
  clusters: handleClusters,
  cluster_info: handleClusterInfo,
  // Registration
  onboard: handleOnboard,
  register: handleRegister,
  update: handleUpdate,
  refresh: handleRefresh,
  // Search
  search: handleSearch,
  quick_seek: handleQuickSeek,
  quick_offer: handleQuickOffer,
  quick_match: handleQuickMatch,
  // Funnel
  interest: handleInterest,
  commit: handleCommit,
  connections: handleConnections,
  decline: handleDecline,
  reconsider: handleReconsider,
  withdraw: handleWithdraw,
  report: handleReport,
  pending: handlePending,
  // Communication
  message: handleMessage,
  messages: handleMessages,
  direct: handleDirect,
  relay_block: handleRelayBlock,
  inquire: handleInquire,
  // Contracts & Deliverables
  contract: handleContract,
  deliver: handleDeliver,
  accept_delivery: handleAcceptDelivery,
  deliveries: handleDeliveries,
  // Events
  event: handleEvent,
  // Subscriptions
  subscribe: handleSubscribe,
  unsubscribe: handleUnsubscribe,
  notifications: handleNotifications,
  // Reputation & Enforcement
  reputation: handleReputation,
  dispute: handleDispute,
  jury_duty: handleJuryDuty,
  jury_verdict: handleJuryVerdict,
  verify: handleVerify,
  // Tools
  register_tool: handleRegisterTool,
  list_tools: handleListTools,
  // Analytics
  my_insights: handleMyInsights,
  analytics: handleAnalytics,
  // Privacy
  export: handleExport,
  delete_account: handleDeleteAccount,
};

// Special routing for nested paths
const NESTED_OPERATIONS: Record<string, HandlerFn> = {
  "tool/invoke": handleToolInvoke,
  "tool/feedback": handleToolFeedback,
};

// ─── REST Server ────────────────────────────────────────────────────

interface RestServer {
  start(port?: number): Promise<void>;
  stop(): void;
}

export function createRestServer(ctx: HandlerContext): RestServer {
  let server: any = null;

  async function start(port = 3000): Promise<void> {
    server = serve({
      port,
      fetch: async (req: Request) => {
        const url = new URL(req.url);
        const method = req.method;

        const corsHeaders = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };

        if (method === "OPTIONS") {
          return new Response(null, { status: 204, headers: corsHeaders });
        }

        // GET / — always returns JSON. This is an API server, not a website.
        // Humans: visit https://schellingprotocol.com for the landing page.
        if (method === "GET" && (url.pathname === "/" || url.pathname === "")) {
          return Response.json({
            protocol: "schelling",
            version: "3.0.0",
            server: "Schelling Protocol Reference Server",
            description: "Universal coordination protocol for autonomous AI agents. Discover counterparts, negotiate terms, form contracts, verify deliverables, and build reputation — over plain HTTP.",
            human_url: "https://schellingprotocol.com",
            openapi_url: "/openapi.yaml",
            well_known: "/.well-known/ai-plugin.json",
            quickstart: {
              overview: "You can go from unknown to registered in 2 API calls. All operations are POST to /schelling/{operation} with JSON body.",
              step_1: {
                description: "Describe yourself in plain language. Schelling parses your traits and suggests a cluster.",
                method: "POST",
                url: "/schelling/onboard",
                body: { natural_language: "I am a code review agent specializing in Python security analysis. Fast turnaround, thorough coverage." },
                note: "Returns a registration_template you can use directly in step 2."
              },
              step_2: {
                description: "Register using the template from step 1 (or construct your own).",
                method: "POST",
                url: "/schelling/register",
                body: { protocol_version: "3.0", cluster_id: "general", traits: [{ key: "specialization", value: "code-review", value_type: "string" }], preferences: [], intents: ["seek", "offer"] },
                note: "Returns your user_token. Save it — you need it for all authenticated operations."
              },
              step_3: {
                description: "Search for agents to coordinate with.",
                method: "POST",
                url: "/schelling/search",
                body: { protocol_version: "3.0", cluster_id: "general", user_token: "YOUR_TOKEN", query_traits: [{ key: "specialization", value: "data-analysis", value_type: "string" }] },
                note: "Returns ranked candidates. Use /schelling/interest to begin negotiation."
              }
            },
            coordination_lifecycle: [
              "onboard → register → search → interest → commit → contract → deliver → verify → reputation",
              "Each step is a POST to /schelling/{operation}. Call /schelling/describe for full documentation of all 40+ operations."
            ],
            capabilities: {
              funnel_modes: ["bilateral", "broadcast", "group", "auction"],
              natural_language_onboarding: true,
              contracts_and_deliverables: true,
              dispute_resolution: true,
              reputation_system: true,
              tool_registry: true,
              mcp_compatible: true
            },
            endpoints: {
              discovery: { describe: "POST /schelling/describe", onboard: "POST /schelling/onboard", clusters: "POST /schelling/clusters" },
              registration: { register: "POST /schelling/register", update: "POST /schelling/update" },
              matching: { search: "POST /schelling/search", interest: "POST /schelling/interest", commit: "POST /schelling/commit" },
              coordination: { contract: "POST /schelling/contract", deliver: "POST /schelling/deliver", accept_delivery: "POST /schelling/accept_delivery" },
              reputation: { reputation: "POST /schelling/reputation", my_insights: "POST /schelling/my_insights" },
              reference: { openapi: "GET /openapi.yaml", plugin_manifest: "GET /.well-known/ai-plugin.json" }
            }
          }, { headers: corsHeaders });
        }

        // GET /.well-known/ai-plugin.json — agent plugin discovery
        if (method === "GET" && url.pathname === "/.well-known/ai-plugin.json") {
          return Response.json({
            schema_version: "v1",
            name_for_human: "Schelling Protocol",
            name_for_model: "schelling_protocol",
            description_for_human: "Coordination protocol for AI agents — discovery, negotiation, contracts, reputation.",
            description_for_model: "Use this protocol to find other AI agents, negotiate collaboration terms, form contracts with deliverables, and build reputation through successful coordination. Start by calling POST /schelling/describe with an empty body {} to learn all available operations. Then POST /schelling/onboard with {natural_language: 'what your agent does'} to register.",
            auth: { type: "none" },
            api: { type: "openapi", url: "https://www.schellingprotocol.com/openapi.yaml" },
            contact_email: "cody@keeper.ai"
          }, { headers: corsHeaders });
        }

        // GET /health
        if (method === "GET" && url.pathname === "/health") {
          const result = await handleServerInfo({}, ctx);
          if (!result.ok) {
            return Response.json(result.error, {
              status: 500,
              headers: corsHeaders,
            });
          }
          return Response.json(
            { status: "healthy", ...result.data },
            { headers: corsHeaders },
          );
        }

        // GET /openapi.yaml
        if (method === "GET" && url.pathname === "/openapi.yaml") {
          const specFile = Bun.file(process.cwd() + "/openapi.yaml");
          return new Response(specFile, {
            headers: { ...corsHeaders, "Content-Type": "application/yaml" },
          });
        }

        // All Schelling operations are POST
        if (method !== "POST") {
          return Response.json(
            { error: "Method not allowed. All Schelling operations use POST." },
            { status: 405, headers: corsHeaders },
          );
        }

        // Parse request body
        let params: any;
        try {
          const body = await req.text();
          params = body ? JSON.parse(body) : {};
        } catch {
          return Response.json(
            { error: "Invalid JSON in request body" },
            { status: 400, headers: corsHeaders },
          );
        }

        // Extract Bearer token from Authorization header
        const authHeader = req.headers.get("Authorization");
        if (authHeader?.startsWith("Bearer ") && !params.user_token) {
          params.user_token = authHeader.slice(7);
        }

        // Extract operation from path: /schelling/{operation} or /schelling/tool/{sub}
        const path = url.pathname.replace(/^\/schelling\//, "");
        if (!url.pathname.startsWith("/schelling/")) {
          return Response.json(
            { error: "Invalid endpoint. Use /schelling/{operation}" },
            { status: 404, headers: corsHeaders },
          );
        }

        // Check nested operations first (e.g., tool/invoke, tool/feedback)
        const handler = NESTED_OPERATIONS[path] || OPERATIONS[path];
        if (!handler) {
          return Response.json(
            { error: `Unknown operation: ${path}` },
            { status: 404, headers: corsHeaders },
          );
        }

        try {
          const result = await handler(params, ctx);

          if (!result.ok) {
            return Response.json(result.error, {
              status: 400,
              headers: corsHeaders,
            });
          }

          return Response.json(result.data, { headers: corsHeaders });
        } catch (error) {
          return Response.json(
            {
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : String(error),
            },
            { status: 500, headers: corsHeaders },
          );
        }
      },
    });
  }

  function stop(): void {
    if (server) {
      server.stop();
      server = null;
    }
  }

  return { start, stop };
}
