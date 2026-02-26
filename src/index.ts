import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDatabase } from "./db/client.js";
import { initSchema } from "./db/schema.js";
import { bindTools } from "./transports/mcp.js";
import { createRestServer } from "./transports/rest.js";
const db = getDatabase();
initSchema(db);

const ctx = { db };

// Check for REST mode
const enableRest = process.argv.includes('--rest') || process.env.SCHELLING_REST === 'true';
const restPort = process.env.SCHELLING_REST_PORT ? parseInt(process.env.SCHELLING_REST_PORT) : 3000;

if (enableRest) {
  // Start REST API server
  const restServer = createRestServer(ctx);
  await restServer.start(restPort);
  console.log(`🚀 Schelling Protocol server running in REST mode on port ${restPort}`);
  
  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    restServer.stop();
    process.exit(0);
  });
} else {
  // Default: Start MCP server via stdio
  const server = new McpServer({
    name: "schelling",
    version: "3.0.0",
  });

  bindTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("🔗 Schelling Protocol MCP server started");
}
