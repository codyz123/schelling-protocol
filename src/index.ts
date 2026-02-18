import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDatabase } from "./db/client.js";
import { initSchema } from "./db/schema.js";
import { bindTools } from "./transports/mcp.js";

const db = getDatabase();
initSchema(db);

const server = new McpServer({
  name: "schelling",
  version: "1.0.0",
});

bindTools(server, { db });

const transport = new StdioServerTransport();
await server.connect(transport);
