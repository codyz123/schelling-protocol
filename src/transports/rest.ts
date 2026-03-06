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
// ─── Marketplace imports ──────────────────────────────────────────────
import {
  handleMarketplaceRegister,
  handleMarketplaceUpdate,
  handleMarketplaceSearch,
  handleMarketRates,
} from "../services/marketplace.js";
import { NegotiationService } from "../services/negotiation.js";
import {
  handleStripeOnboard,
  handleWalletTopup,
  handleWalletBalance,
  handlePayoutRequest,
  handleStripeWebhook,
} from "../services/stripe.js";

// ─── Feature Flags ──────────────────────────────────────────────────

const MARKETPLACE_ENABLED = process.env.MARKETPLACE_ENABLED === "true";

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

// ─── Marketplace Operations (gated by MARKETPLACE_ENABLED) ──────────

function marketplaceGate(handler: HandlerFn): HandlerFn {
  return async (params, ctx) => {
    if (!MARKETPLACE_ENABLED) {
      return { ok: false, error: { code: "FEATURE_NOT_SUPPORTED", message: "Marketplace is not enabled. Set MARKETPLACE_ENABLED=true." } };
    }
    return handler(params, ctx);
  };
}

function syncToAsync(fn: (params: any, ctx: HandlerContext) => HandlerResult<any>): HandlerFn {
  return async (params, ctx) => fn(params, ctx);
}

// Negotiation handlers need to be created per-request since they use db from ctx
function negotiateStart(params: any, ctx: HandlerContext): HandlerResult<any> {
  try {
    const svc = new NegotiationService(ctx.db);
    const session = svc.start(params);
    return { ok: true, data: session };
  } catch (e: any) {
    return { ok: false, error: { code: "INVALID_INPUT", message: e.message } };
  }
}

function negotiateRespond(params: any, ctx: HandlerContext): HandlerResult<any> {
  try {
    const svc = new NegotiationService(ctx.db);
    const session = svc.respond(params);
    return { ok: true, data: session };
  } catch (e: any) {
    return { ok: false, error: { code: "INVALID_INPUT", message: e.message } };
  }
}

function negotiateStatus(params: any, ctx: HandlerContext): HandlerResult<any> {
  try {
    const svc = new NegotiationService(ctx.db);
    const result = svc.status(params.session_id);
    return { ok: true, data: result };
  } catch (e: any) {
    return { ok: false, error: { code: "INVALID_INPUT", message: e.message } };
  }
}

const MARKETPLACE_OPERATIONS: Record<string, HandlerFn> = {
  marketplace_register: marketplaceGate(syncToAsync(handleMarketplaceRegister)),
  marketplace_update: marketplaceGate(syncToAsync(handleMarketplaceUpdate)),
  marketplace_search: marketplaceGate(syncToAsync(handleMarketplaceSearch)),
  market_rates: marketplaceGate(syncToAsync(handleMarketRates)),
  negotiate_start: marketplaceGate(syncToAsync(negotiateStart)),
  negotiate_respond: marketplaceGate(syncToAsync(negotiateRespond)),
  negotiate_status: marketplaceGate(syncToAsync(negotiateStatus)),
  stripe_onboard: marketplaceGate(handleStripeOnboard),
  wallet_topup: marketplaceGate(handleWalletTopup),
  wallet_balance: marketplaceGate(syncToAsync(handleWalletBalance)),
  payout_request: marketplaceGate(handlePayoutRequest),
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


// ─── Rate Limiting ──────────────────────────────────────────────────
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs = 60_000, maxRequests = 60) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    // Clean up old entries every minute
    setInterval(() => this.cleanup(), 60_000);
  }

  check(ip: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const timestamps = this.requests.get(ip) || [];
    const windowStart = now - this.windowMs;
    const recent = timestamps.filter(t => t > windowStart);

    if (recent.length >= this.maxRequests) {
      const resetMs = recent[0] + this.windowMs - now;
      return { allowed: false, remaining: 0, resetMs };
    }

    recent.push(now);
    this.requests.set(ip, recent);
    return { allowed: true, remaining: this.maxRequests - recent.length, resetMs: this.windowMs };
  }

  private cleanup() {
    const cutoff = Date.now() - this.windowMs;
    for (const [ip, timestamps] of this.requests) {
      const recent = timestamps.filter(t => t > cutoff);
      if (recent.length === 0) this.requests.delete(ip);
      else this.requests.set(ip, recent);
    }
  }
}

export function createRestServer(ctx: HandlerContext): RestServer {
  let server: any = null;

  let deadlineInterval: ReturnType<typeof setInterval> | null = null;
  let autoAcceptInterval: ReturnType<typeof setInterval> | null = null;

  async function start(port = 3000): Promise<void> {
    const limiter = new RateLimiter(60_000, 120); // 120 requests per minute per IP

    // Marketplace: negotiation deadline checker (every 10s)
    if (MARKETPLACE_ENABLED) {
      deadlineInterval = setInterval(() => {
        try {
          const svc = new NegotiationService(ctx.db);
          svc.expireDeadlines();
        } catch {}
      }, 10_000);

      // Auto-accept deliverables after 7 days
      autoAcceptInterval = setInterval(() => {
        try {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          ctx.db.prepare(
            `UPDATE deliverables SET status = 'accepted', responded_at = datetime('now'), feedback = 'Auto-accepted after 7 days'
             WHERE status = 'delivered' AND delivered_at < ?`,
          ).run(sevenDaysAgo);
        } catch {}
      }, 60_000); // Check every minute
    }

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

        // Rate limiting (skip for health checks)
        if (url.pathname !== "/health") {
          const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            || req.headers.get("x-real-ip")
            || "unknown";
          const rate = limiter.check(ip);
          if (!rate.allowed) {
            return Response.json({
              error: "RATE_LIMITED",
              message: "Too many requests. Please slow down.",
              hint: "Limit: 120 requests per minute. Retry after a brief pause.",
              retry_after_ms: rate.resetMs,
            }, {
              status: 429,
              headers: {
                ...corsHeaders,
                "Retry-After": String(Math.ceil(rate.resetMs / 1000)),
                "X-RateLimit-Limit": "120",
                "X-RateLimit-Remaining": "0",
              }
            });
          }
        }

        // GET / — content negotiation: HTML for browsers, JSON for agents
        if (method === "GET" && (url.pathname === "/" || url.pathname === "")) {
          const accept = request.headers.get("accept") ?? "";
          const wantsHtml = accept.includes("text/html");

          if (wantsHtml) {
            // Serve landing page for browsers, fall back to redirect
            const landingFile = Bun.file(process.cwd() + "/public/index.html");
            if (await landingFile.exists()) {
              return new Response(landingFile, {
                headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
              });
            }
            return Response.redirect("https://schellingprotocol.com", 302);
          }

          // JSON for agents / curl / programmatic access
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

        // GET /.well-known/agent.json — Google A2A agent card
        if (method === "GET" && url.pathname === "/.well-known/agent.json") {
          return Response.json({
            name: "Schelling Protocol",
            description: "Universal coordination protocol for AI agents. Register what you need or offer, find matches, negotiate terms, form contracts, deliver work, and build reputation — all over plain HTTP.",
            url: "https://www.schellingprotocol.com",
            version: "3.0.0",
            protocol: "a2a",
            capabilities: {
              streaming: false,
              pushNotifications: false,
              stateTransitionHistory: true
            },
            authentication: {
              schemes: ["none"],
              credentials: null
            },
            defaultInputModes: ["application/json"],
            defaultOutputModes: ["application/json"],
            skills: [
              {
                id: "discover",
                name: "Discover Agents & Clusters",
                description: "Browse the network. See active clusters, population, and suggested traits.",
                tags: ["discovery", "clusters", "browse"],
                examples: ["What clusters are active?", "How many agents are registered?"]
              },
              {
                id: "seek",
                name: "Seek a Match",
                description: "Describe what you need in plain language. Schelling parses your intent, registers you, and returns ranked matches with scores.",
                tags: ["search", "matching", "natural-language"],
                examples: ["Find me a React developer in Denver under $120/hr", "I need a roommate in Fort Collins, $800/mo, pet-friendly"]
              },
              {
                id: "offer",
                name: "Offer Services",
                description: "Register what you or your human offers. Get matched with seekers automatically.",
                tags: ["registration", "services", "matching"],
                examples: ["I'm a Python developer, 8 years experience, remote, $100/hr"]
              },
              {
                id: "negotiate",
                name: "Negotiate & Contract",
                description: "Progress through the funnel: interest → commit → contract → deliver. Negotiate terms, set milestones, exchange deliverables.",
                tags: ["negotiation", "contracts", "deliverables"],
                examples: ["Propose a contract: landing page build, $1200, 2 week deadline"]
              },
              {
                id: "reputation",
                name: "Reputation & Trust",
                description: "Check agent reputation, verify traits, report outcomes. Build trust through successful coordination.",
                tags: ["reputation", "verification", "trust"],
                examples: ["What's this agent's reputation?"]
              }
            ]
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

// GET /status — network statistics for social proof
        if (method === "GET" && url.pathname === "/status") {
          try {
            const stats = ctx.db.prepare(`
              SELECT
                (SELECT COUNT(*) FROM users) as total_agents,
                (SELECT COUNT(*) FROM users WHERE role = 'offer') as offers,
                (SELECT COUNT(*) FROM users WHERE role = 'seek') as seekers,
                (SELECT COUNT(DISTINCT cluster_id) FROM users WHERE cluster_id IS NOT NULL) as clusters,
                (SELECT COUNT(*) FROM contracts) as contracts,
                (SELECT COUNT(*) FROM reputation_events) as reputation_reports,
                (SELECT COUNT(*) FROM candidates WHERE funnel_stage IN ('INTERESTED','INQUIRING','COMMITTED','CONNECTED')) as connections_initiated
            `).get() as any;
            return Response.json({
              status: "live",
              protocol: "schelling",
              version: "3.0.0",
              network: {
                total_agents: stats?.total_agents || 0,
                offers: stats?.offers || 0,
                seekers: stats?.seekers || 0,
                clusters: stats?.clusters || 0,
                contracts_formed: stats?.contracts || 0,
                reputation_reports: stats?.reputation_reports || 0,
                connections_initiated: stats?.connections_initiated || 0,
              },
              endpoints: {
                api: "https://www.schellingprotocol.com",
                docs: "https://www.schellingprotocol.com/docs",
                demo: "https://www.schellingprotocol.com/demo",
                landing: "https://schellingprotocol.com",
              },
              links: {
                github: "https://github.com/codyz123/schelling-protocol",
                npm: "https://www.npmjs.com/package/@schelling/sdk",
                spec: "https://www.schellingprotocol.com/openapi.yaml",
              }
            }, { headers: corsHeaders });
          } catch (e) {
            return Response.json({ status: "error", message: "Could not fetch stats" }, { status: 500, headers: corsHeaders });
          }
        }

        // GET /openapi.yaml
        if (method === "GET" && url.pathname === "/openapi.yaml") {
          const specFile = Bun.file(process.cwd() + "/openapi.yaml");
          return new Response(specFile, {
            headers: { ...corsHeaders, "Content-Type": "application/yaml" },
          });
        }

        // GET /og-image.svg — Open Graph social sharing image
        if (method === "GET" && url.pathname === "/og-image.svg") {
          const ogFile = Bun.file(process.cwd() + "/public/og-image.svg");
          return new Response(ogFile, {
            headers: { ...corsHeaders, "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
          });
        }

        // GET /llms.txt — AI agent discovery (llms.txt standard)
        if (method === "GET" && url.pathname === "/llms.txt") {
          const llmsFile = Bun.file(process.cwd() + "/public/llms.txt");
          return new Response(llmsFile, {
            headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
          });
        }

        // GET /docs — interactive Swagger UI
        if (method === "GET" && url.pathname === "/docs") {
          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Schelling Protocol — API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #fafafa; }
    .topbar { display: none !important; }
    .swagger-ui .info { margin: 30px 0 20px; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`;
          return new Response(html, {
            headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
          });
        }


        // GET /tiktok verification file
        if (method === "GET" && url.pathname.startsWith("/tiktok") && url.pathname.endsWith(".txt")) {
          const fname = url.pathname.slice(1);
          const f = Bun.file(process.cwd() + "/public/" + fname);
          return new Response(f, { headers: { ...corsHeaders, "Content-Type": "text/plain" } });
        }

        // GET /auth/tiktok/callback — TikTok OAuth redirect
        if (method === "GET" && url.pathname === "/auth/tiktok/callback") {
          const code = url.searchParams.get("code") || "";
          const state = url.searchParams.get("state") || "";
          return new Response(`<!DOCTYPE html><html><body style="background:#0a0a0f;color:#14B8A6;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Authorization Successful</h2><p>Code: <code>${code.slice(0,8)}...</code></p><p>You can close this tab.</p></div></body></html>`, {
            headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // GET /publish — content publisher UI
        if (method === "GET" && url.pathname === "/publish") {
          const f = Bun.file(process.cwd() + "/public/publish.html");
          return new Response(f, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
        }

        // GET /terms — Terms of Service
        if (method === "GET" && url.pathname === "/terms") {
          const termsFile = Bun.file(process.cwd() + "/public/terms.html");
          return new Response(termsFile, {
            headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // GET /privacy — Privacy Policy
        if (method === "GET" && url.pathname === "/privacy") {
          const privacyFile = Bun.file(process.cwd() + "/public/privacy.html");
          return new Response(privacyFile, {
            headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // GET /demo — interactive API playground
        if (method === "GET" && url.pathname === "/demo") {
          const demoFile = Bun.file(process.cwd() + "/public/demo.html");
          return new Response(demoFile, {
            headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // GET /robots.txt
        if (method === "GET" && url.pathname === "/robots.txt") {
          return new Response(
            "User-agent: *\nAllow: /\n\nSitemap: https://www.schellingprotocol.com/openapi.yaml\n",
            { headers: { ...corsHeaders, "Content-Type": "text/plain" } }
          );
        }

        // Any other GET — helpful 404 instead of confusing 405
        if (method === "GET") {
          return Response.json({
            error: "Not found",
            hint: "Discovery endpoints: GET /, GET /docs, GET /demo, GET /openapi.yaml, GET /llms.txt, GET /health, GET /status, GET /.well-known/agent.json, GET /.well-known/ai-plugin.json. All protocol operations use POST /schelling/{operation}."
          }, { status: 404, headers: corsHeaders });
        }

        // POST /webhooks/tiktok — TikTok webhook callback
        if (method === "POST" && url.pathname === "/webhooks/tiktok") {
          return Response.json({ success: true }, { headers: corsHeaders });
        }

        // POST /webhooks/stripe — Stripe webhook
        if (method === "POST" && url.pathname === "/webhooks/stripe") {
          if (!MARKETPLACE_ENABLED) {
            return Response.json({ error: "Marketplace not enabled" }, { status: 404, headers: corsHeaders });
          }
          return handleStripeWebhook(req, ctx);
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
        const handler = NESTED_OPERATIONS[path] || OPERATIONS[path] || MARKETPLACE_OPERATIONS[path];
        if (!handler) {
          return Response.json(
            {
              error: `Unknown operation: ${path}`,
              hint: "Start with POST /schelling/describe to see all available operations. Quickstart: https://github.com/codyz123/schelling-protocol/blob/main/QUICKSTART.md",
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
    if (deadlineInterval) { clearInterval(deadlineInterval); deadlineInterval = null; }
    if (autoAcceptInterval) { clearInterval(autoAcceptInterval); autoAcceptInterval = null; }
    if (server) {
      server.stop();
      server = null;
    }
  }

  return { start, stop };
}
