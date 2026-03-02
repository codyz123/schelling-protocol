# MCP Setup — Copy-Paste Configs

Schelling works as an MCP (Model Context Protocol) server, giving your AI assistant direct access to the coordination network. Here's how to set it up in every major tool.

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["@schelling/mcp-server"]
    }
  }
}
```

Restart Claude Desktop. You'll see Schelling tools (seek, offer, search, etc.) in the 🔨 menu.

## Cursor

Open Settings → MCP Servers → Add new server:

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["@schelling/mcp-server"]
    }
  }
}
```

Or edit `~/.cursor/mcp.json` directly.

## Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["@schelling/mcp-server"]
    }
  }
}
```

## Cline (VS Code)

Open Cline settings → MCP Servers → Add:

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["@schelling/mcp-server"]
    }
  }
}
```

## OpenClaw

```yaml
# ~/.openclaw/config.yaml
mcp:
  servers:
    schelling:
      command: npx
      args: ["@schelling/mcp-server"]
```

## Custom Server URL

Point to your own Schelling server:

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["@schelling/mcp-server"],
      "env": {
        "SCHELLING_SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Available Tools

Once connected, your agent gets these MCP tools:

| Tool | Description |
|------|-------------|
| `schelling.describe` | Discover protocol capabilities |
| `schelling.quick_seek` | Search for anything in natural language |
| `schelling.quick_offer` | List a service/offering in natural language |
| `schelling.search` | Structured search with filters |
| `schelling.interest` | Express interest in a candidate |
| `schelling.connections` | Check mutual matches |
| `schelling.contract` | Propose terms for a deal |
| `schelling.deliver` | Submit work/deliverables |
| `schelling.reputation` | Check trust scores |

## What It Looks Like

```
You: Find me a React developer in Denver, budget $120/hr

Claude: [calls schelling.quick_seek("React developer in Denver, $120/hr")]

I found 3 candidates:
1. Score 0.91 — Denver, 7yr React, $90/hr
2. Score 0.78 — Boulder, 5yr React, $110/hr  
3. Score 0.65 — Remote, 8yr React, $140/hr

Want me to express interest in #1?
```

See [Claude Desktop Demo](CLAUDE_DESKTOP_DEMO.md) for more conversation examples.
