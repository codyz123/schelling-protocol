import { serve } from "bun";
import type { HandlerContext } from "../types.js";
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
import { logger } from "../core/logger.js";

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
        const startTime = performance.now();
        const url = new URL(req.url);
        const method = req.method;
        
        // CORS headers
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // Handle preflight requests
        if (method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: corsHeaders });
        }

        // Health endpoint (GET)
        if (method === 'GET' && url.pathname === '/health') {
          try {
            const result = await handleServerInfo({}, ctx);
            if (!result.ok) {
              return Response.json(result.error, { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            // Transform server_info result to health format
            const healthData = {
              status: 'healthy',
              protocol_version: result.data.protocol_version,
              server_version: result.data.server_version,
              total_users: result.data.total_users,
              total_candidates: result.data.total_candidates,
              uptime_seconds: result.data.uptime_seconds,
              supported_verticals: result.data.supported_verticals,
            };

            return Response.json(healthData, {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } catch (error) {
            return Response.json({ 
              status: 'unhealthy', 
              error: error instanceof Error ? error.message : String(error) 
            }, { 
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // All Schelling operations are POST requests
        if (method !== 'POST') {
          return Response.json(
            { error: 'Method not allowed. All Schelling operations use POST.' },
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Extract operation from path
        const pathParts = url.pathname.split('/');
        if (pathParts.length !== 3 || pathParts[1] !== 'schelling') {
          return Response.json(
            { error: 'Invalid endpoint. Use /schelling/{operation}' },
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const operation = pathParts[2];

        // Parse request body
        let params: any;
        try {
          const body = await req.text();
          params = body ? JSON.parse(body) : {};
        } catch (error) {
          return Response.json(
            { error: 'Invalid JSON in request body' },
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Extract Bearer token from Authorization header
        const authHeader = req.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.slice(7);
          // Add token to params if not already present
          if (!params.user_token) {
            params.user_token = token;
          }
        }

        // Route to appropriate handler
        let result: any;
        try {
          switch (operation) {
            case 'register':
              result = await handleRegister(params, ctx);
              break;
            case 'search':
              result = await handleSearch(params, ctx);
              break;
            case 'evaluate':
              result = await handleCompare(params, ctx);
              break;
            case 'exchange':
              result = await handleRequestProfile(params, ctx);
              break;
            case 'commit':
              result = await handlePropose(params, ctx);
              break;
            case 'decline':
              result = await handleDecline(params, ctx);
              break;
            case 'connections':
              result = await handleGetIntroductions(params, ctx);
              break;
            case 'report':
              result = await handleReportOutcome(params, ctx);
              break;
            case 'withdraw':
              result = await handleWithdraw(params, ctx);
              break;
            case 'reputation':
              result = await handleGetReputation(ctx, params);
              break;
            case 'negotiate':
              result = await handleNegotiate(params, ctx);
              break;
            case 'dispute':
              result = await handleFileDispute(params, ctx);
              break;
            case 'verify':
              result = await handleVerify(params, ctx);
              break;
            case 'export':
              result = await handleExportData(params, ctx);
              break;
            case 'delete_account':
              result = await handleDeleteAccount(params, ctx);
              break;
            case 'reconsider':
              result = await handleReconsider(params, ctx);
              break;
            case 'update':
              result = await handleUpdate(params, ctx);
              break;
            case 'refresh':
              result = await handleRefresh(params, ctx);
              break;
            case 'message':
              result = await handleMessage(params, ctx);
              break;
            case 'messages':
              result = await handleMessages(params, ctx);
              break;
            case 'direct':
              result = await handleDirect(params, ctx);
              break;
            case 'relay_block':
              result = await handleRelayBlock(params, ctx);
              break;
            case 'pending':
              result = await handlePending(params, ctx);
              break;
            case 'feedback':
              result = await handleFeedback(params, ctx);
              break;
            case 'my_insights':
              result = await handleMyInsights(params, ctx);
              break;
            case 'jury_duty':
              result = await handleJuryDuty(params, ctx);
              break;
            case 'jury_verdict':
              result = await handleJuryVerdict(params, ctx);
              break;
            case 'analytics':
              result = await handleAnalytics(params, ctx);
              break;
            case 'verticals':
            case 'clusters':
            case 'intents':
              result = await handleListVerticals(params, ctx);
              break;
            case 'onboard':
              result = await handleOnboard(params, ctx);
              break;
            case 'server_info':
              result = await handleServerInfo(params, ctx);
              break;
            case 'group_evaluate':
              result = await handleGroupEvaluate(params, ctx);
              break;
            case 'group_commit':
              result = await handleGroupCommit(params, ctx);
              break;
            case 'inquire':
            case 'inquiries':
              result = await handleInquire(params, ctx);
              break;
            case 'subscribe':
              result = await handleSubscribe(params, ctx);
              break;
            case 'unsubscribe':
              result = await handleUnsubscribe(params, ctx);
              break;
            case 'notifications':
              result = await handleNotifications(params, ctx);
              break;
            case 'contract':
              result = await handleContract(params, ctx);
              break;
            case 'contract_update':
              result = await handleContractUpdate(params, ctx);
              break;
            case 'event':
            case 'events':
              result = await handleEvent(params, ctx);
              break;
            default:
              return Response.json(
                { error: `Unknown operation: ${operation}` },
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
          }

          // Log the operation
          const endTime = performance.now();
          const latencyMs = endTime - startTime;
          logger.logOperation(
            `schelling.${operation}`,
            latencyMs,
            result.ok ? "ok" : result.error?.code || "error",
            params.user_token,
            params.vertical_id,
            {
              method: 'REST',
              status_code: result.ok ? 200 : 400,
              operation: operation
            }
          );

          if (!result.ok) {
            return Response.json(result.error, { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          return Response.json(result.data, {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        } catch (error) {
          const endTime = performance.now();
          const latencyMs = endTime - startTime;
          logger.logOperation(
            `schelling.${operation}`,
            latencyMs,
            "internal_error",
            params?.user_token,
            params?.vertical_id,
            {
              method: 'REST',
              status_code: 500,
              error: error instanceof Error ? error.message : String(error)
            }
          );

          return Response.json(
            { 
              error: 'Internal server error',
              message: error instanceof Error ? error.message : String(error)
            },
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      },
    });

    console.log(`🌐 REST API server started on http://localhost:${port}`);
    console.log(`📊 Health endpoint: http://localhost:${port}/health`);
    console.log(`🔧 Schelling endpoints: http://localhost:${port}/schelling/{operation}`);
  }

  function stop(): void {
    if (server) {
      server.stop();
      server = null;
      console.log('REST API server stopped');
    }
  }

  return { start, stop };
}