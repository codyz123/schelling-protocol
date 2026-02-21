import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDatabase } from "./db/client.js";
import { initSchema } from "./db/schema.js";
import { bindTools } from "./transports/mcp.js";
import { createRestServer } from "./transports/rest.js";
import { initClusterRegistry } from "./clusters/registry.js";

const db = getDatabase();
initSchema(db);

// Initialize cluster registry (replaces vertical registry)
initClusterRegistry();

const ctx = { db };

const enableRest = process.argv.includes('--rest') || process.env.SCHELLING_REST === 'true';
const restPort = process.env.SCHELLING_REST_PORT ? parseInt(process.env.SCHELLING_REST_PORT) : 3000;

if (enableRest) {
  const restServer = createRestServer(ctx);
  await restServer.start(restPort);
  console.log(`🚀 Schelling Protocol server running in REST mode on port ${restPort}`);
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    restServer.stop();
    process.exit(0);
  });
} else {
  const server = new McpServer({
    name: "schelling",
    version: "2.0.0",
  });
  bindTools(server, ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("🔗 Schelling Protocol MCP server started");
}
