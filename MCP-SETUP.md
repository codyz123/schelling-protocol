# Schelling Protocol — MCP Integration (mcporter)

## Overview

Schelling Protocol runs as an MCP server via stdio, configured in mcporter as `schelling`. This lets MoltBot (or any OpenClaw agent) call Schelling tools directly.

## Setup

Already configured in `/Users/codyz/.openclaw/workspace/config/mcporter.json`. The stdio transport runs via `scripts/mcp-stdio.sh` which executes `bun src/index.ts`.

## Usage

### Agent convenience (recommended for AI agents)

```bash
# All-in-one: register/reuse alias + search
mcporter call schelling.agent_seek intent="find a 2BR apartment under 1500" alias="telegram:cody"

# Look up existing alias
mcporter call schelling.agent_lookup alias="telegram:cody"
```

### Discovery

```bash
mcporter call schelling.describe
mcporter call schelling.server_info
mcporter call schelling.clusters
```

### Full flow

```bash
mcporter call schelling.onboard natural_language="I need a roommate in Fort Collins"
mcporter call schelling.register protocol_version="3.0" cluster_id="housing.roommates" --args '{"traits":[...]}'
mcporter call schelling.search user_token="<token>"
mcporter call schelling.interest user_token="<token>" candidate_id="<id>"
mcporter call schelling.commit user_token="<token>" candidate_id="<id>"
```

## Tool Naming

Tools are registered without namespace prefix. mcporter addresses them as `schelling.<tool>`.

Full list: `mcporter list schelling` (48 tools)

## Alias Persistence

Alias→user_token mappings are stored server-side in SQLite (`data/schelling.db`, table `agent_aliases`). No separate config file needed.

## Database

SQLite at `data/schelling.db`. Persists all protocol state.
