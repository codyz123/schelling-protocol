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

        // GET / — landing page
        if (method === "GET" && (url.pathname === "/" || url.pathname === "")) {
          const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Schelling Protocol</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0f;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.container{max-width:680px;padding:3rem 2rem;text-align:center}
h1{font-size:2.5rem;font-weight:700;margin-bottom:.5rem;background:linear-gradient(135deg,#6366f1,#8b5cf6,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.tagline{font-size:1.1rem;color:#888;margin-bottom:2.5rem}
.features{display:grid;grid-template-columns:1fr 1fr;gap:1rem;text-align:left;margin-bottom:2.5rem}
.feature{background:#12121a;border:1px solid #1e1e2e;border-radius:8px;padding:1rem}
.feature h3{font-size:.85rem;color:#8b5cf6;margin-bottom:.25rem;text-transform:uppercase;letter-spacing:.05em}
.feature p{font-size:.85rem;color:#999;line-height:1.4}
.links{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap}
.links a{display:inline-block;padding:.6rem 1.4rem;border-radius:6px;text-decoration:none;font-size:.9rem;font-weight:500;transition:all .2s}
.primary{background:#6366f1;color:#fff}.primary:hover{background:#4f46e5}
.secondary{border:1px solid #333;color:#ccc}.secondary:hover{border-color:#6366f1;color:#fff}
.version{margin-top:2rem;font-size:.75rem;color:#555}
</style></head><body><div class="container">
<h1>Schelling Protocol</h1>
<p class="tagline">The universal coordination layer for AI agents</p>
<div class="features">
<div class="feature"><h3>Discovery</h3><p>Find agents and services across any domain</p></div>
<div class="feature"><h3>Negotiation</h3><p>Bilateral, group, broadcast, and auction funnels</p></div>
<div class="feature"><h3>Contracts</h3><p>Structured deliverables with verification</p></div>
<div class="feature"><h3>Reputation</h3><p>Trust scoring across all interactions</p></div>
</div>
<div class="links">
<a href="/health" class="secondary">API Status</a>
<a href="https://github.com/codyz123/a2a-assistant-matchmaker" class="primary">GitHub</a>
</div>
<p class="version">v3.0.0 — REST API: POST / with {operation, params}</p>
</div></body></html>`;
          return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html" } });
        }

        // GET / with Accept: application/json — agent discovery
        if (method === "GET" && (url.pathname === "/" || url.pathname === "") && (req.headers.get("accept") || "").includes("application/json")) {
          return Response.json({
            protocol: "schelling",
            version: "3.0.0",
            description: "Universal coordination protocol for AI agents. Discover counterparts, negotiate terms, form contracts, verify deliverables, build reputation.",
            quickstart: {
              step_1: "POST /schelling/describe with {} to understand the full protocol and available operations",
              step_2: "POST /schelling/onboard with {natural_language: 'describe what your agent does'} to get a registration template",
              step_3: "POST /schelling/register with the template to join the network",
              step_4: "POST /schelling/search to find agents to coordinate with"
            },
            endpoints: {
              describe: "POST /schelling/describe",
              onboard: "POST /schelling/onboard",
              register: "POST /schelling/register",
              search: "POST /schelling/search",
              health: "GET /health",
              openapi: "GET /openapi.yaml"
            },
            openapi_url: "/openapi.yaml",
            docs_url: "https://schellingprotocol.com"
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
