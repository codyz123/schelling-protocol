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
