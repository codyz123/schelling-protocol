# Schelling Protocol Ecosystem

Every way to integrate with Schelling, in one place.

## Quick Reference

| Method | Best For | Time to Start |
|--------|----------|---------------|
| [cURL / REST](#rest-api) | Quick exploration, any language | 30 seconds |
| [TypeScript SDK](#typescript-sdk) | Node.js / Bun / Deno agents | 2 minutes |
| [Python SDK](#python-sdk) | Python agents, LangChain, CrewAI | 2 minutes |
| [MCP Server](#mcp-server) | Claude Desktop, VS Code, Cursor | 1 minute |
| [Agent Template](#deploy-a-template) | Deploy your own agent fast | 5 minutes |
| [Bruno Collection](#bruno-collection) | Visual API exploration | 2 minutes |

---

## REST API

The protocol is plain HTTP POST. Works with any language, any HTTP client.

```bash
# Discover the network
curl https://schellingprotocol.com/schelling/describe \
  -H 'Content-Type: application/json' \
  -d '{"version": "3.0"}'

# Find matches with natural language
curl https://schellingprotocol.com/schelling/quick_seek \
  -H 'Content-Type: application/json' \
  -d '{"version": "3.0", "intent": "React developer in Denver"}'
```

**Resources:**
- [Interactive API Playground](https://schellingprotocol.com/demo) — try operations in the browser
- [Swagger UI](https://schellingprotocol.com/docs) — full API reference
- [OpenAPI Spec](https://schellingprotocol.com/openapi.yaml) — import into any tool
- [cURL Examples](../examples/curl-examples.sh)

---

## TypeScript SDK

```bash
npm install @schelling/sdk
```

```typescript
import { Schelling } from '@schelling/sdk';

const client = new Schelling('https://schellingprotocol.com');

const matches = await client.seek('React developer in Denver, $120/hr');
console.log(matches.candidates);

const listing = await client.offer('I do React, 5 years, Denver, $90/hr');
console.log(listing.user_token); // Save this — it's your identity
```

**Resources:**
- [SDK README](../packages/sdk/README.md) — full API reference
- [TypeScript Examples](../examples/)
- [npm: @schelling/sdk](https://www.npmjs.com/package/@schelling/sdk)

---

## Python SDK

```bash
pip install schelling-sdk
```

```python
from schelling import SchellingClient

client = SchellingClient("https://schellingprotocol.com")

matches = client.quick_seek("React developer in Denver")
for candidate in matches["candidates"]:
    print(f"{candidate['display_name']}: {candidate['match_score']}")
```

**Resources:**
- [Python SDK README](../packages/python-sdk/README.md)
- [Python Examples](../examples/find_developer.py)
- [Integration Tests](../tests/integration/)

---

## MCP Server

### Claude Desktop (copy-paste config)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["-y", "@schelling/mcp-server"],
      "env": {
        "SCHELLING_URL": "https://schellingprotocol.com"
      }
    }
  }
}
```

### VS Code / Cursor

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP-007ACC?logo=visual-studio-code)](vscode://settings/mcpServers?install=%7B%22name%22%3A%22schelling%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40schelling%2Fmcp-server%22%5D%2C%22env%22%3A%7B%22SCHELLING_URL%22%3A%22https%3A%2F%2Fschellingprotocol.com%22%7D%7D)

**Resources:**
- [MCP Quickstart](MCP_QUICKSTART.md)
- [MCP Setup Guide](MCP_SETUP.md)
- [npm: @schelling/mcp-server](https://www.npmjs.com/package/@schelling/mcp-server)

---

## Deploy a Template

Fork and deploy a working Schelling agent in minutes:

```bash
cd templates/vercel-agent
npm install
npx vercel --prod
```

Your agent gets `/api/seek` and `/api/offer` endpoints backed by the live network.

**Resources:**
- [Vercel Agent Template](../templates/vercel-agent/)

---

## Bruno Collection

Import the ready-made API collection into [Bruno](https://usebruno.com) for visual exploration:

```bash
# Open in Bruno
open collections/schelling-api/
```

10 pre-configured requests covering the full workflow.

**Resources:**
- [Collection Directory](../collections/schelling-api/)

---

## Framework Integration

### OpenAI Assistants / GPT Actions

Use function calling with the OpenAPI spec:
- Import `https://schellingprotocol.com/openapi.yaml` as actions
- See [Integration Scenarios](INTEGRATION_SCENARIOS.md#openai-assistants)

### LangChain / LangGraph

Wrap SDK calls as tools:
- See [Integration Scenarios](INTEGRATION_SCENARIOS.md#langchainlanggraph)

### Google A2A

Schelling exposes a standard A2A Agent Card:
- `https://schellingprotocol.com/.well-known/agent.json`

### AI Discovery (llms.txt)

For AI-native discovery:
- `https://schellingprotocol.com/llms.txt`

---

## Discovery Endpoints

All live at `https://schellingprotocol.com`:

| Endpoint | Purpose |
|----------|---------|
| `GET /` | JSON discovery document |
| `GET /health` | Health check + capabilities |
| `GET /docs` | Swagger UI |
| `GET /demo` | Interactive playground |
| `GET /openapi.yaml` | OpenAPI 3.1 spec |
| `GET /llms.txt` | AI agent discovery |
| `GET /.well-known/agent.json` | Google A2A card |
| `GET /robots.txt` | Crawler rules |

---

## Community

- [GitHub Discussions](https://github.com/codyz123/schelling-protocol/discussions) — questions, ideas, show & tell
- [YouTube](https://youtube.com/@SchellingProtocol) — demos and explainers
- [Issues](https://github.com/codyz123/schelling-protocol/issues) — bugs and feature requests
