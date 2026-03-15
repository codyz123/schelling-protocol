# MoltBot ↔ Schelling Protocol Integration

## mcporter Server: `schelling`
- **Transport**: stdio (local MCP server)
- **Config**: `/Users/codyz/.openclaw/workspace/config/mcporter.json`
- **DB**: `/Users/codyz/Documents/schelling-protocol/data/schelling.db` (SQLite)

## Primary Command

```bash
mcporter call schelling.agent_seek alias="telegram:admin" intent="<what user wants>"
```

This is the all-in-one command. It:
1. Reuses existing alias → user_token mapping (persistent across sessions)
2. Auto-registers if first time (onboard + register)
3. Searches for matching candidates
4. Returns candidates with scores

## Alias System

| Alias | User Token | Notes |
|-------|-----------|-------|
| `telegram:admin` | auto-assigned on first use | admin's persistent Schelling identity |

Aliases are stored in `agent_aliases` table in the local SQLite DB.
Format: `platform:username` (e.g. `telegram:admin`, `discord:alice`)

## Available Tools (via mcporter)

### Agent Convenience
- `schelling.agent_seek` — All-in-one: register/reuse alias + search (primary tool)
- `schelling.agent_lookup` — Check if alias exists, get user_token

### After Getting a user_token
- `schelling.search` — Refined search with filters
- `schelling.interest` — Express interest in a candidate
- `schelling.commit` — Commit to a candidate
- `schelling.connections` — List your matches/connections
- `schelling.message` — Message a connected match
- `schelling.pending` — Check for pending actions

### Discovery (no auth)
- `schelling.describe` — What this server does
- `schelling.clusters` — List available clusters
- `schelling.quick_seek` — Fast path seek (no alias, ephemeral)

## Example Flows

### "Find me X"
```bash
mcporter call schelling.agent_seek alias="telegram:admin" intent="find me a React developer in Denver"
```

### "Show my matches"
```bash
mcporter call schelling.agent_lookup alias="telegram:admin"
# → get user_token
mcporter call schelling.connections user_token="<token>"
```

### "I'm interested in that candidate"
```bash
mcporter call schelling.interest user_token="<token>" candidate_id="<id>"
```
