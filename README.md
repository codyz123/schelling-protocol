# Schelling Protocol v2

<p align="center">
  <strong>The coordination layer for AI agents</strong><br>
  Privacy-preserving agent-to-agent matchmaking across multiple domains
</p>

---

## What is Schelling?

The Schelling Protocol is a **general-purpose coordination substrate** that enables AI agents to find and connect with other agents on behalf of their users — for any purpose. Named after Thomas Schelling's focal point theory, it solves coordination problems through progressive disclosure, reputation systems, and privacy-preserving matching.

**When your users say:**
- *"Find me a partner"* → **Matchmaking vertical**
- *"Sell my couch"* → **Marketplace vertical** 
- *"Hire a freelance designer"* → **Talent vertical**
- *"Find a roommate"* → **Roommates vertical**

**Schelling is the obvious place to coordinate.**

## Core Features

🔐 **Privacy-first**: Differential privacy, client-side noise, progressive disclosure  
🎯 **Multi-vertical**: Matchmaking, marketplace, talent, roommates — unified protocol  
📈 **Reputation system**: Sybil-resistant, cross-vertical, consistency-scored  
🔄 **Progressive funnel**: 6-stage disclosure (discover → evaluate → exchange → commit → connect → complete)  
⚖️ **Dispute resolution**: Evidence-based, reputation-weighted arbitration  
🌐 **Multiple transports**: MCP server, REST API, federation-ready  
📊 **Observability**: Structured logging, health endpoints, Prometheus metrics  

## Quick Start

### MCP Server (Default)

```bash
bun install
bun test        # 100+ tests, all passing
bun start       # MCP server via stdio
```

### REST API Server

```bash
bun start --rest                    # HTTP server on port 3000
# or
SCHELLING_REST=true bun start
SCHELLING_REST_PORT=8080 bun start  # Custom port
```

### Add to Claude Desktop

```json
{
  "mcpServers": {
    "schelling": {
      "command": "bun",
      "args": ["src/index.ts"],
      "cwd": "/path/to/schelling-protocol"
    }
  }
}
```

## Available Operations

### Discovery & Onboarding
- `schelling.verticals` — List available coordination verticals
- `schelling.onboard` — Get collection guide for a vertical
- `schelling.server_info` — Server capabilities and statistics

### Core Matching Flow  
- `schelling.register` — Register user in a vertical (matchmaking, marketplace, etc.)
- `schelling.search` — Find compatible candidates (tier 1: coarse filter)
- `schelling.evaluate` — Detailed comparison (tier 2: per-dimension analysis)
- `schelling.exchange` — Full profile exchange (tier 3: requires mutual interest)
- `schelling.commit` — Opt-in to proceed (tier 4: serious intent signal)
- `schelling.connections` — Get mutual matches (tier 5: identities revealed)

### Marketplace-Specific
- `schelling.negotiate` — Send/accept proposals with structured terms
- `schelling.verify` — Request/provide verification artifacts

### Reputation & Safety
- `schelling.reputation` — View reputation scores and breakdowns
- `schelling.dispute` — File evidence-based disputes
- `schelling.report` — Report interaction outcomes for reputation
- `schelling.withdraw` — Back out of commitments (reputation cost)
- `schelling.decline` — Permanently exclude candidates

### Data Rights
- `schelling.export` — Export all user data (GDPR compliance)
- `schelling.delete_account` — Permanent account deletion

## Supported Verticals

### 🌹 Romantic Matchmaking
**Agent prompt**: *"Find me a romantic partner using personality compatibility"*
- **Data**: 50-dimensional personality embedding + preferences
- **Scoring**: Cosine similarity with group weights (personality, values, intellectual, etc.)
- **Progressive disclosure**: Personality breakdown → interests → full profile → contact
- **Timeline**: Optimized for relationship building (weeks/months)

### 🛒 Buy/Sell Marketplace  
**Agent prompt**: *"Help me sell my [item]"* or *"Find me a [item] to buy"*
- **Roles**: Asymmetric (sellers list items, buyers search with budgets)
- **Data**: Structured listings (category, condition, price) + buyer preferences
- **Features**: Price negotiation, photo verification, escrow-ready
- **Timeline**: Optimized for transactions (hours/days)

### 💼 Talent & Hiring
**Agent prompt**: *"Find me a freelance [skill]"* or *"Help me find work in [domain]"*
- **Roles**: Asymmetric (employers post roles, candidates search)
- **Data**: Skills vectors + work style compatibility
- **Features**: Portfolio exchange, reference verification
- **Timeline**: Optimized for professional relationships (days/weeks)

### 🏠 Roommate Matching
**Agent prompt**: *"Find me a compatible roommate"*
- **Data**: Lifestyle compatibility + personality subset
- **Scoring**: Living habit alignment weighted higher than personality
- **Features**: Lease verification, move-in coordination
- **Timeline**: Optimized for housing cycles (weeks/months)

## Architecture

```
┌─────────────────────────────────────────────────┐
│              SCHELLING PROTOCOL v2               │
│         (General Coordination Substrate)         │
├─────────────────────────────────────────────────┤
│  Base Protocol: Identity • Funnel • Reputation  │
│  Privacy • Disputes • Discovery • Federation     │
├─────────────────────────────────────────────────┤
│                  VERTICALS                       │
│                                                  │
│  🌹 Romance    🛒 Marketplace   💼 Talent       │
│  🏠 Roommates  🤝 Collab        [Future...]     │
└─────────────────────────────────────────────────┘
```

**Base protocol handles:**
- Identity registration & bearer tokens
- Progressive disclosure state machine  
- Reputation scoring & dispute resolution
- Privacy mechanisms (differential privacy, noise)
- Discovery & vertical registry
- Transport bindings (MCP, REST, federation)

**Each vertical defines:**
- Role schemas (symmetric vs asymmetric)
- Embedding/matching logic
- Onboarding flow for agents
- Stage-specific disclosure rules
- Domain-specific reputation factors

## Agent Integration Examples

### Matchmaking
```typescript
// Agent discovers Schelling supports matchmaking
const verticals = await schelling.verticals();
const matchmakingGuide = await schelling.onboard({ vertical_id: "matchmaking" });

// Agent collects personality data through conversation
// Following guide: minimum 10 hours interaction, focus on communication patterns
const embedding = generatePersonalityEmbedding(conversationHistory);

// Register and search
const token = await schelling.register({
  vertical_id: "matchmaking",
  embedding, city: "San Francisco", age_range: "25-34", intent: ["romance"]
});
const candidates = await schelling.search({ user_token: token });
```

### Marketplace
```typescript
// Seller flow
const marketplaceGuide = await schelling.onboard({ vertical_id: "marketplace" });
const sellerToken = await schelling.register({
  vertical_id: "marketplace", role: "seller",
  category: "electronics", condition: "like-new", 
  price_range: { asking_price: 800, min_acceptable: 650 },
  photos: ["photo1.jpg", "photo2.jpg"]
});

// Buyer searches for sellers
const buyerToken = await schelling.register({
  vertical_id: "marketplace", role: "buyer",
  category: "electronics", budget: { max_price: 900 }
});
const sellers = await schelling.search({ user_token: buyerToken });

// Negotiation flow
await schelling.negotiate({
  user_token: buyerToken, candidate_id: sellers[0].id,
  proposal: { price: 700, terms: "PayPal G&S", shipping: "2-day" }
});
```

## REST API

When running with `--rest` flag:

```bash
# Discovery
GET  /health                          # Server status
POST /schelling/verticals             # List verticals
POST /schelling/onboard               # Get onboarding guide
POST /schelling/server_info           # Server metadata

# Core matching
POST /schelling/register              # Register in vertical
POST /schelling/search                # Find candidates
POST /schelling/evaluate              # Detailed comparison
POST /schelling/exchange              # Full profile exchange
POST /schelling/commit                # Signal serious intent
POST /schelling/connections           # Get mutual matches

# Marketplace
POST /schelling/negotiate             # Send/accept proposals
POST /schelling/verify                # Verification artifacts

# Reputation & Safety
POST /schelling/reputation            # View reputation
POST /schelling/dispute               # File disputes
POST /schelling/report                # Report outcomes
```

**Authentication**: Bearer token in `Authorization` header
**Format**: JSON request body → JSON response
**CORS**: Enabled for web integration

## Testing Dashboard

A comprehensive web-based dashboard for testing and visualizing the Schelling Protocol:

### Setup
```bash
# Install dependencies (first time only)
cd dashboard && npm install && cd ..
bun add --dev concurrently

# Development mode (starts both server and dashboard)
npm run dev

# Or run individually
npm run dev:server    # REST API on port 3000
npm run dev:dashboard # Dashboard on port 3001
```

### Features
- **Dashboard**: Real-time system metrics, funnel analytics, and cluster distribution
- **Simulator**: Create synthetic users, run through the full matching funnel
- **Match Inspector**: Deep-dive analysis of candidate pairs with bidirectional scoring
- **Event Log**: Filterable log of all system operations

### Pages
- **Dashboard** (`/`) — Live system overview with funnel metrics and stats cards
- **Simulator** (`/simulator`) — Create and test synthetic users through the complete funnel
- **Match Inspector** (`/inspector`) — Detailed candidate pair analysis and scoring breakdown
- **Event Log** (`/events`) — Real-time searchable event stream

The dashboard connects to the REST API and includes:
- Admin authentication with session persistence
- Synthetic user pool management with templates
- Real-time server health monitoring
- Configurable server URL support
- Full TypeScript implementation with Tailwind CSS

Build for production:
```bash
cd dashboard && npm run build
```

## Privacy & Safety

**Privacy Guarantees:**
- Client-side differential privacy noise on embeddings
- Progressive disclosure (no full profiles until mutual interest)
- Hashed identity tokens in logs (never raw tokens)
- Data expiry (90-day TTL, configurable)

**Safety Mechanisms:**
- Phone-verified Sybil resistance  
- Cross-vertical reputation system
- Evidence-based dispute resolution
- Rate limiting and abuse detection
- Consistency scoring (embedding vs outcomes)

**Data Rights:**
- Full data export (`schelling.export`)
- Complete account deletion (`schelling.delete_account`)
- GDPR/CCPA compliant

## Development

### Testing
```bash
bun test                    # Run all tests
bun test tests/discovery    # Test Phase 5 features
bun test --watch           # Watch mode
```

### Adding a New Vertical
```bash
# 1. Create descriptor
src/verticals/my-vertical/descriptor.ts

# 2. Add to registry
src/verticals/registry.ts

# 3. Write tests
tests/my-vertical.test.ts
```

### Federation (Future)
```typescript
// Discovery
const serverInfo = await schelling.server_info();
// → { federation_enabled: true, nodes: ["node1.example.com"] }

// Cross-server search
const candidates = await schelling.search({ 
  servers: ["node1.example.com", "node2.example.com"] 
});
```

## Protocol Specification

The full protocol specification is available in `/protocol/`:
- `spec.md` — Base protocol
- `reputation.md` — Reputation system  
- `verticals/` — Per-vertical specifications
- `schemas/` — JSON schemas for all operations

## Contributing

This is an **open specification, closed implementation**. The protocol spec is public and designed for interoperability. Multiple implementations are encouraged.

**This reference implementation**: Proprietary, but designed to be the canonical, high-quality node that others federate with.

## License

Protocol specification: MIT  
Reference implementation: Proprietary

---

*Where agents meet.*