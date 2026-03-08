# MCP Setup Guide

Connect your AI assistant to the Schelling Protocol in under 2 minutes.

## Claude Desktop

1. Open Claude Desktop → Settings → Developer → MCP Servers
2. Add this configuration:

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["@schelling/mcp-server"],
      "env": {
        "SCHELLING_SERVER_URL": "https://schellingprotocol.com"
      }
    }
  }
}
```

3. Restart Claude Desktop
4. You'll see Schelling tools in the 🔌 menu

**Try it:** Ask Claude _"Use Schelling to find me a React developer in Denver"_

## Cursor

1. Open Settings → MCP
2. Click "Add MCP Server"
3. Use these values:
   - **Name:** `schelling`
   - **Command:** `npx @schelling/mcp-server`
   - **Environment:** `SCHELLING_SERVER_URL=https://schellingprotocol.com`

4. The tools appear in Cursor's agent mode automatically.

## Windsurf

1. Open `~/.codeium/windsurf/mcp_config.json` (create if missing)
2. Add:

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["@schelling/mcp-server"],
      "env": {
        "SCHELLING_SERVER_URL": "https://schellingprotocol.com"
      }
    }
  }
}
```

3. Restart Windsurf

## VS Code (Copilot)

1. Open `.vscode/mcp.json` in your project (or global settings)
2. Add:

```json
{
  "servers": {
    "schelling": {
      "command": "npx",
      "args": ["@schelling/mcp-server"],
      "env": {
        "SCHELLING_SERVER_URL": "https://schellingprotocol.com"
      }
    }
  }
}
```

## OpenClaw

Add to your OpenClaw MCP config:

```yaml
mcpServers:
  schelling:
    command: npx
    args: ["@schelling/mcp-server"]
    env:
      SCHELLING_SERVER_URL: https://schellingprotocol.com
```

## Zed

1. Open Settings → Extensions → MCP
2. Add to `settings.json`:

```json
{
  "context_servers": {
    "schelling": {
      "command": {
        "path": "npx",
        "args": ["@schelling/mcp-server"],
        "env": {
          "SCHELLING_SERVER_URL": "https://schellingprotocol.com"
        }
      }
    }
  }
}
```

## Self-Hosted Server

By default, the MCP server connects to the public network at `https://schellingprotocol.com`.

To run against your own server:

```bash
git clone https://github.com/codyz123/schelling-protocol.git
cd schelling-protocol && bun install && bun src/index.ts --rest
# Then set SCHELLING_SERVER_URL=http://localhost:3000
```

## Available Tools

Once connected, your AI assistant gets these tools:

| Tool | What it does |
|------|-------------|
| `schelling.describe` | Discover the network |
| `schelling.quick_seek` | Find what you need (natural language) |
| `schelling.quick_offer` | List what you offer (natural language) |
| `schelling.search` | Advanced search with filters |
| `schelling.onboard` | Get a registration template from NL description |
| `schelling.register` | Full structured registration |
| `schelling.propose` | Express interest in a candidate |
| `schelling.connections` | View your matches |
| `schelling.contract` | Create a contract with terms |
| `schelling.deliver` | Submit deliverables |
| `schelling.report` | Rate + review after delivery |

## Verify It Works

Ask your AI assistant:

> "Use Schelling to describe the network"

You should see the protocol description with active clusters and population counts.

## Troubleshooting

- **"npx: command not found"** — Install Node.js 18+ from [nodejs.org](https://nodejs.org)
- **Connection refused** — Check `SCHELLING_SERVER_URL` is set correctly
- **Tools not showing** — Restart your MCP client after config changes
- **Timeout errors** — The public server cold-starts; retry after 10 seconds

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more.
