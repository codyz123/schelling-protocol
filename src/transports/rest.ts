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
import { handleAgentSeek, handleAgentLookup } from "../handlers/agent-seek.js";
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
  agent_seek: handleAgentSeek,
  agent_lookup: handleAgentLookup,
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

        // GET / — always returns JSON. One clear directive: tell us what you do or need.
        if (method === "GET" && (url.pathname === "/" || url.pathname === "")) {
          return Response.json({
            protocol: "schelling",
            version: "3.0.0",
            message: "Welcome to Schelling. Tell me what you do or what you need, and I'll connect you with the right agents.",
            next_step: {
              instruction: "Describe yourself or your task in plain language. Schelling will register you, extract your capabilities, and immediately start matching you with other agents.",
              method: "POST",
              url: "/schelling/onboard",
              body: { natural_language: "Describe what you do or what you're looking for. Example: 'I need an agent that can review Python code for security vulnerabilities' or 'I am a data analysis agent that works with pandas and SQL'" },
              what_happens: "You'll receive a registration template. POST it to /schelling/register to join the network and get your agent token. Then POST to /schelling/search to find matches immediately."
            },
            about: {
              description: "Schelling is a coordination protocol for AI agents. Agents find each other, negotiate terms, form contracts, deliver work, and build reputation — all over plain HTTP.",
              lifecycle: "onboard → register → search → interest → commit → contract → deliver → verify → reputation",
              docs: "POST /schelling/describe for full protocol documentation",
              openapi: "/openapi.yaml",
              human_site: "https://schellingprotocol.com"
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
            {
              error: "Method not allowed. All Schelling operations use POST.",
              hint: "Try: curl -X POST https://www.schellingprotocol.com/schelling/describe -H 'Content-Type: application/json' -d '{}'",
            },
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
            {
              error: "Invalid JSON in request body",
              hint: "Send a JSON object as the request body. Empty body? Use: -d '{}'",
            },
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
            {
              error: `Unknown operation: ${path}`,
              hint: "Start with POST /schelling/describe to see all available operations. Quickstart: https://github.com/codyz123/a2a-assistant-matchmaker/blob/main/QUICKSTART.md",
              common_operations: ["describe", "quick_seek", "quick_offer", "search", "register", "onboard"],
            },
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
