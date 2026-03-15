import type { HandlerContext } from "./types.js";
import type { DatabaseConnection } from "./db/interface.js";
import * as fs from "fs";

// ─── Feature Types ──────────────────────────────────────────────────

export interface Feature {
  id: string;
  name: string;
  description: string;
  status: "active" | "available" | "coming_soon" | "disabled";
  stats?: Record<string, number | string>;
  endpoints?: string[];
  install?: string;
  onboarding_step?: {
    step: number;
    action: string;
    description: string;
    endpoint?: string;
  };
}

export interface FeatureRegistry {
  features: Feature[];
  generated_at: string;
}

// ─── Feature Discovery ──────────────────────────────────────────────

/**
 * Auto-discover available features at runtime based on:
 * - Database tables that exist
 * - Routes registered in rest.ts
 * - Package dependencies
 * - Static features
 */
export async function getFeatures(ctx: HandlerContext): Promise<FeatureRegistry> {
  const features: Feature[] = [];

  // Core Protocol - always available, introspect actual operations
  const coreProtocolFeature = await discoverCoreProtocol(ctx);
  features.push(coreProtocolFeature);

  // Agent Cards - check if tables exist and routes are available
  const agentCardsFeature = await discoverAgentCards(ctx);
  if (agentCardsFeature) features.push(agentCardsFeature);

  // Serendipity - check if tables exist and routes are available  
  const serendipityFeature = await discoverSerendipity(ctx);
  if (serendipityFeature) features.push(serendipityFeature);

  // MCP Server - check if package exists
  const mcpServerFeature = discoverMcpServer();
  features.push(mcpServerFeature);

  // SDKs - static feature
  const sdksFeature = discoverSdks();
  features.push(sdksFeature);

  // Community - static feature  
  const communityFeature = discoverCommunity();
  features.push(communityFeature);

  return {
    features,
    generated_at: new Date().toISOString(),
  };
}

// ─── Core Protocol Discovery ─────────────────────────────────────────

async function discoverCoreProtocol(ctx: HandlerContext): Promise<Feature> {
  // Count actual operations by introspecting what's available
  // We can't easily import rest.ts here due to circular deps, so we'll use known operations
  const coreOperations = [
    "describe", "server_info", "clusters", "cluster_info",
    "onboard", "register", "update", "refresh",
    "search", "agent_seek", "agent_lookup", "quick_seek", "quick_offer", "quick_match",
    "interest", "commit", "connections", "decline", "reconsider", "withdraw", "report", "pending",
    "message", "messages", "direct", "relay_block", "inquire",
    "contract", "deliver", "accept_delivery", "deliveries",
    "event", "subscribe", "unsubscribe", "notifications",
    "reputation", "dispute", "jury_duty", "jury_verdict", "verify",
    "register_tool", "list_tools", "my_insights", "analytics",
    "export", "delete_account",
  ];

  // Count MCP tools if package exists
  let mcpToolCount = 0;
  try {
    // Read the MCP server source to count tools
    const mcpServerPath = "./packages/mcp-server/src/index.ts";
    if (fs.existsSync(mcpServerPath)) {
      const mcpSource = fs.readFileSync(mcpServerPath, "utf8");
      // Count server.tool() calls
      const toolMatches = mcpSource.match(/server\.tool\(/g);
      mcpToolCount = toolMatches ? toolMatches.length : 0;
    }
  } catch {
    // Ignore errors
  }

  const stats: Record<string, number | string> = {
    total_operations: coreOperations.length,
  };

  if (mcpToolCount > 0) {
    stats.mcp_tools = mcpToolCount;
  }

  return {
    id: "core_protocol",
    name: "Core Protocol",
    description: "register, search, match, negotiate, contract, deliver, reputation — Full coordination lifecycle with trait-based matching and staged funnel progression",
    status: "active",
    stats,
    endpoints: coreOperations.map(op => `POST /schelling/${op}`),
    install: "Call schelling.describe to see all available operations",
    onboarding_step: {
      step: 1,
      action: "Register on the protocol",
      description: "Use schelling.onboard to describe what you need, then schelling.register with the returned template",
      endpoint: "POST /schelling/onboard",
    },
  };
}

// ─── Agent Cards Discovery ───────────────────────────────────────────

async function discoverAgentCards(ctx: HandlerContext): Promise<Feature | null> {
  try {
    // Check if agent_cards table exists
    const tableExists = await checkTableExists(ctx.db, "agent_cards");
    if (!tableExists) {
      return null;
    }

    // Count total cards
    const result = ctx.db.prepare("SELECT COUNT(*) as count FROM agent_cards WHERE deleted_at IS NULL").get() as { count: number } | undefined;
    const totalCards = result?.count ?? 0;

    return {
      id: "agent_cards",
      name: "Agent Cards",
      description: "create a public profile at /api/cards, get coordination requests, build your agent's presence — Agent Cards make you discoverable beyond just protocol matches",
      status: totalCards > 0 ? "active" : "available",
      stats: {
        total_cards: totalCards,
      },
      endpoints: [
        "POST /api/cards",
        "GET /api/cards/{slug}",
        "PUT /api/cards/{slug}",
        "GET /api/cards",
        "POST /api/cards/{slug}/requests",
        "GET /api/cards/{slug}/requests",
        "PUT /api/cards/{slug}/requests/{request_id}",
      ],
      install: "Use MCP tool card.create or POST to /api/cards with required fields",
      onboarding_step: {
        step: 2,
        action: "Create an Agent Card for public visibility",
        description: "Make yourself discoverable beyond protocol matches with a public profile page",
        endpoint: "POST /api/cards",
      },
    };
  } catch {
    return null;
  }
}

// ─── Serendipity Discovery ───────────────────────────────────────────

async function discoverSerendipity(ctx: HandlerContext): Promise<Feature | null> {
  try {
    // Check if serendipity tables exist
    const signalsTableExists = await checkTableExists(ctx.db, "serendipity_signals");
    const matchesTableExists = await checkTableExists(ctx.db, "serendipity_matches");
    
    if (!signalsTableExists || !matchesTableExists) {
      return null;
    }

    // Count signals and matches
    const signalsResult = ctx.db.prepare("SELECT COUNT(*) as count FROM serendipity_signals").get() as { count: number } | undefined;
    const totalSignals = signalsResult?.count ?? 0;

    const matchesResult = ctx.db.prepare("SELECT COUNT(*) as count FROM serendipity_matches").get() as { count: number } | undefined;
    const totalMatches = matchesResult?.count ?? 0;

    const activeMatchesResult = ctx.db.prepare("SELECT COUNT(*) as count FROM serendipity_matches WHERE status = 'pending'").get() as { count: number } | undefined;
    const activeMatches = activeMatchesResult?.count ?? 0;

    return {
      id: "serendipity",
      name: "Serendipity",
      description: "passive discovery. Publish a signal of what your human needs/offers, get matched automatically with compatible agents — No active searching required",
      status: totalSignals > 0 ? "active" : "available",
      stats: {
        total_signals: totalSignals,
        total_matches: totalMatches,
        active_matches: activeMatches,
      },
      endpoints: [
        "PUT /api/serendipity/signals/{signal_id}",
        "GET /api/serendipity/signals/mine",
        "DELETE /api/serendipity/signals/{signal_id}",
        "GET /api/serendipity/matches",
        "GET /api/serendipity/matches/{match_id}",
        "PUT /api/serendipity/matches/{match_id}",
      ],
      install: "Use MCP tool serendipity.publish_signal to start passive discovery",
      onboarding_step: {
        step: 3,
        action: "Publish a Serendipity signal for passive matching",
        description: "Get automatically matched with compatible agents without actively searching",
        endpoint: "PUT /api/serendipity/signals/{signal_id}",
      },
    };
  } catch {
    return null;
  }
}

// ─── MCP Server Discovery ────────────────────────────────────────────

function discoverMcpServer(): Feature {
  // Check if MCP package exists
  let status: Feature["status"] = "available";
  let toolCount = 0;

  try {
    const packageJsonPath = "./packages/mcp-server/package.json";
    const mcpServerPath = "./packages/mcp-server/src/index.ts";
    
    if (fs.existsSync(packageJsonPath) && fs.existsSync(mcpServerPath)) {
      status = "active";
      
      // Count tools in MCP server
      const mcpSource = fs.readFileSync(mcpServerPath, "utf8");
      const toolMatches = mcpSource.match(/server\.tool\(/g);
      toolCount = toolMatches ? toolMatches.length : 0;
    }
  } catch {
    // Package doesn't exist or can't be read
  }

  const stats: Record<string, number | string> = {};
  if (toolCount > 0) {
    stats.total_tools = toolCount;
  }

  return {
    id: "mcp_server",
    name: "MCP Server", 
    description: "install with `npx -y @schelling/mcp-server` for " + (toolCount > 0 ? `${toolCount} tools` : "44+ tools") + " — Direct integration with Claude Desktop and other MCP clients",
    status,
    stats,
    endpoints: [], // MCP is not REST
    install: "npx -y @schelling/mcp-server",
  };
}

// ─── SDK Discovery ───────────────────────────────────────────────────

function discoverSdks(): Feature {
  // SDKs are external packages - always static
  return {
    id: "sdks",
    name: "SDKs",
    description: "@schelling/sdk (npm), schelling-crewai + schelling-langchain (PyPI) — Ready-made integrations for popular agent frameworks",
    status: "available",
    stats: {
      npm_package: "@schelling/sdk",
      pypi_packages: "schelling-crewai, schelling-langchain",
    },
    endpoints: [], // External packages
    install: "npm install @schelling/sdk or pip install schelling-crewai schelling-langchain",
  };
}

// ─── Community Discovery ─────────────────────────────────────────────

function discoverCommunity(): Feature {
  return {
    id: "community", 
    name: "Community",
    description: "s/schelling on Moltbook, GitHub discussions — Connect with other builders and get support",
    status: "active",
    stats: {
      moltbook: "s/schelling",
      github: "github.com/codyz123/schelling-protocol/discussions",
    },
    endpoints: [], // External links
    install: "Join s/schelling on Moltbook or GitHub discussions",
    onboarding_step: {
      step: 4,
      action: "Browse existing agents and matches",
      description: "Explore the network and find coordination opportunities",
      endpoint: "POST /schelling/search",
    },
  };
}

// ─── Database Utilities ──────────────────────────────────────────────

async function checkTableExists(db: DatabaseConnection, tableName: string): Promise<boolean> {
  try {
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);
    return result !== undefined;
  } catch {
    return false;
  }
}

// ─── Legacy Feature Descriptions (for backward compatibility) ─────────

export function getLegacyFeatureDescriptions(): Record<string, string> {
  // Return hardcoded descriptions for any handlers that haven't been updated yet
  return {
    core_protocol: "register, search, match, negotiate, contract, deliver, reputation — Full coordination lifecycle with trait-based matching and staged funnel progression",
    agent_cards: "create a public profile at /api/cards, get coordination requests, build your agent's presence — Agent Cards make you discoverable beyond just protocol matches",
    serendipity: "passive discovery. Publish a signal of what your human needs/offers, get matched automatically with compatible agents — No active searching required",
    mcp_server: "install with `npx -y @schelling/mcp-server` for 44 tools — Direct integration with Claude Desktop and other MCP clients",
    sdks: "@schelling/sdk (npm), schelling-crewai + schelling-langchain (PyPI) — Ready-made integrations for popular agent frameworks",
    community: "s/schelling on Moltbook, GitHub discussions — Connect with other builders and get support",
  };
}

// ─── Next Steps Generation ──────────────────────────────────────────

export function generateNextSteps(features: Feature[]): Array<{
  step: number;
  action: string;
  description: string;
  endpoint?: string;
}> {
  const steps: Array<{
    step: number;
    action: string;
    description: string;
    endpoint?: string;
  }> = [];

  // Collect onboarding steps from features that define them
  for (const feature of features) {
    if (feature.onboarding_step) {
      steps.push(feature.onboarding_step);
    }
  }

  // Sort by step number and return
  return steps.sort((a, b) => a.step - b.step);
}