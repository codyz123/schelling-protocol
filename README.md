<p align="center">
  <img src="protocol/logo.svg" alt="Schelling Protocol" width="400">
</p>

<p align="center">
  <strong>Privacy-preserving agent matchmaking via personality embeddings</strong>
</p>

---

AI assistants know their users deeply from thousands of conversations. The Schelling Protocol lets two agents compare their users' compatibility without exposing raw data -- using 50-dimensional personality embeddings with differential privacy and a tiered matching funnel that progressively reveals information only as mutual interest is established.

This is a **protocol, not a product**. The spec is the primary artifact. This repo contains one reference implementation as an MCP server.

## Quick Start

```bash
bun install
bun test        # 40 tests, ~25ms
bun start       # starts MCP server on stdio
```

### Connect via MCP Inspector

```bash
npx @modelcontextprotocol/inspector bun src/index.ts
```

### Add to Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "schelling": {
      "command": "bun",
      "args": ["src/index.ts"],
      "cwd": "/path/to/schelling-v1"
    }
  }
}
```

## How It Works

```
Thousands of users
    |
    v  match.search (Tier 1: fast, low-res)
    |  Cosine similarity on 50-dim embedding + metadata filters
    |
  ~50-100 candidates
    |
    v  match.compare (Tier 2: moderate, higher-res)
    |  Per-group breakdown, shared interests, complementary traits
    |
  ~5-10 candidates
    |
    v  match.request_profile (Tier 3: slow, high-res)
    |  Full profile exchange -- requires mutual tier-2 interest
    |
  ~1-3 candidates
    |
    v  Agent crafts pitch -> presents to user
    |
    v  match.propose -> user opts in
    |
    v  Mutual opt-in? -> match.get_introductions
    |  Identities revealed, intro facilitated
    |
    v  match.report_outcome -> feedback loop
```

Agents can `match.decline` at any stage. Declines are permanent and excluded from future searches.

## The 8 Tools

| Tool | Tier | Description |
|------|------|-------------|
| `match.register` | -- | Register with embedding, profile data, and identity |
| `match.search` | 1 | Fast coarse search via embedding similarity |
| `match.compare` | 2 | Detailed per-dimension breakdown |
| `match.request_profile` | 3 | Full profile (requires mutual tier-2) |
| `match.propose` | -- | User opts in after agent pitch |
| `match.decline` | -- | Permanent exit from a candidate pair |
| `match.get_introductions` | -- | Poll for mutual matches |
| `match.report_outcome` | -- | Feedback loop after introduction |

## Architecture

```
src/
  index.ts                  # Entry point: DB + MCP server + transport
  types.ts                  # Shared types, dimensions, stage enum
  db/
    client.ts               # SQLite singleton (bun:sqlite, WAL mode)
    schema.ts               # DDL: users, candidates, declines, outcomes
  matching/
    compatibility.ts        # Cosine similarity, shared categories, openers
    privacy.ts              # Laplace noise, embedding validation
  handlers/                 # Pure functions: typed input -> typed output
    register.ts
    search.ts
    compare.ts
    request-profile.ts
    propose.ts
    decline.ts
    get-introductions.ts
    report-outcome.ts
  transports/
    mcp.ts                  # Binds handlers to MCP tools via Zod schemas

protocol/                   # THE PROTOCOL (standalone spec)
  spec.md                   # Full protocol specification
  embedding-spec.md         # 50 dimensions with behavioral anchors
  schemas/                  # JSON Schema for all 8 tool I/O
```

Handlers are pure async functions (`input -> HandlerResult<T>`) with no transport coupling. The MCP transport is a thin binding layer. Any transport (REST, A2A, WebSocket, gRPC) can be added without touching handler logic.

## Embedding

50 dimensions across 6 groups, each a float in [-1, 1]:

| Group | Dims | Examples |
|-------|------|----------|
| Personality | 10 | openness, extraversion, emotional_stability |
| Values | 10 | autonomy, tradition, achievement |
| Aesthetic | 8 | minimalism, nature_affinity, visual |
| Intellectual | 8 | systematic, abstract, depth_focused |
| Social | 8 | introversion, empathy, conflict_tolerance |
| Communication | 6 | directness, verbosity, debate_enjoyment |

Agents generate embeddings from observed behavior, not self-report. The embedding spec includes behavioral anchors at the 5th and 95th percentile for cross-model calibration. See [`protocol/embedding-spec.md`](protocol/embedding-spec.md).

A ready-to-use embedding generation prompt is at [`protocol/prompts/generate-embedding.md`](protocol/prompts/generate-embedding.md).

## Privacy

Agents apply Laplace noise client-side before registration. The server never sees raw embeddings.

- `epsilon = 0.5`: strong privacy, heavy noise
- `epsilon = 1.0`: moderate (default)
- `epsilon = 2.0`: light privacy, mild noise

## Protocol Spec

The full protocol specification is at [`protocol/spec.md`](protocol/spec.md). It's standalone, transport-agnostic, and language-agnostic. Anyone can implement a Schelling-compatible server or client from the spec alone.

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript (ESM, strict)
- **Storage:** SQLite via `bun:sqlite` (WAL mode, zero infrastructure)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Validation:** Zod
- **Privacy:** Laplace mechanism

## License

MIT
