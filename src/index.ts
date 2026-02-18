import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDatabase } from "./db/client.js";
import { initSchema } from "./db/schema.js";
import { bindTools } from "./transports/mcp.js";
import { initVerticalRegistry } from "./verticals/registry.js";

const db = getDatabase();
initSchema(db);

// Initialize vertical registry with built-in verticals
initVerticalRegistry();

const server = new McpServer({
  name: "schelling",
  version: "2.0.0",
});

bindTools(server, { db });

const transport = new StdioServerTransport();
await server.connect(transport);
