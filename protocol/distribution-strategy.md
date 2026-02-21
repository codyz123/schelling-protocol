# Schelling Protocol — Distribution & Adoption Strategy

**Date:** 2026-02-18
**Status:** Draft

---

## The Problem

The best protocol in the world is useless with 10 users. Schelling's value is proportional to network size. Every adoption decision must be evaluated against: **does this get us to critical mass faster?**

---

## Phase 1: Bootstrap via Keeper (Months 1-3)

Keeper is the bootstrap. Don't cold-start a protocol — upgrade an existing product.

### What to do:
- **Schelling becomes Keeper's matching backbone.** Every Keeper user is automatically a Schelling user. Their AI matchmaker agent registers them, searches, evaluates, proposes — all via Schelling protocol.
- **Keeper is the first "app" on Schelling.** Proves the protocol works in production with real stakes (dating).
- **Keeper's existing users seed the network.** Even a few hundred active users makes the dating vertical viable.

### Why dating first:
- Broken incumbents (Bumble -95%, Hinge stagnating) — users actively seeking alternatives
- Highest emotional stakes → strongest word-of-mouth if it works
- Keeper already has product-market fit signal and paying users
- Psychometric matching is Keeper's differentiator — Schelling's embedding system is the technical expression of this

### Success metric: 500+ active registrations in the matchmaking cluster.

---

## Phase 2: Open Source & Developer Adoption (Months 2-6)

Open-source the Schelling server. Let anyone run a node. Capture developers.

### What to ship:
1. **GitHub repo** — MIT-licensed server implementation, full spec, reference agents
2. **`@schelling/sdk`** (npm) — 3 lines to give any agent matching capabilities:
   ```typescript
   import { SchelllingClient } from '@schelling/sdk';
   const schelling = new SchelllingClient('https://schelling.keeper.ai');
   const matches = await schelling.search({ intent_embedding, hard_filters });
   ```
3. **Python SDK** — same, for the AI/ML community
4. **Reference agent implementations** — a dating agent, a talent agent, a roommate agent. Fully functional examples showing how to generate embeddings, evaluate matches, handle the full funnel.
5. **Docker one-liner** — `docker run schelling/server` to run your own node

### Distribution channels:
- **Hacker News launch** — "Open protocol for AI agent matchmaking" (play the decentralization angle)
- **AI/ML Twitter** — demos showing agents autonomously finding co-founders, roommates, etc.
- **r/LocalLLaMA, r/MachineLearning** — technical audience that builds with agent frameworks
- **Dev conferences** — AI Engineer Summit, NeurIPS demos

### Success metric: 50+ GitHub stars in first week, 5+ third-party integrations in first month.

---

## Phase 3: Model Provider Integration (Months 3-9)

Get Schelling into the places where agents already live.

### MCP (Model Context Protocol) — Primary vector
Schelling is already MCP-native. This is the fastest path.
- **Publish to MCP registries** — when Anthropic/others ship MCP tool directories, be listed
- **Claude Desktop integration** — users install Schelling as an MCP tool, Claude gets matching capabilities
- **Cursor/Windsurf/IDE agents** — talent/co-founder matching for developers (search for collaborators while coding)

### ChatGPT Actions / GPTs
- Submit Schelling as a ChatGPT Action — any GPT can use matching
- Build a "Matchmaker GPT" that uses Schelling under the hood
- Tap into OpenAI's 200M+ user distribution

### Gemini Extensions
- Google's A2A protocol has agent discovery built in
- Register Schelling as an A2A-compatible service with an Agent Card
- Any A2A agent auto-discovers Schelling's capabilities

### Agent Frameworks
- **LangChain/LangGraph tool** — matching as a composable agent tool
- **CrewAI integration** — agent teams that recruit new members via Schelling
- **AutoGen** — Microsoft's multi-agent framework

### Success metric: Available in 3+ model providers/frameworks.

---

## Phase 4: Vertical Expansion (Months 6-18)

Each vertical brings its own community and use case.

### Vertical roadmap (ordered by bootstrapping difficulty):

| Vertical | Cluster | Bootstrap Strategy | Why Now |
|---|---|---|---|
| **Dating** | matchmaking | Keeper users (already done) | Incumbents dying, AI dating is trending |
| **Co-founder/talent** | talent (peer mode) | HN launch, YC network, indie hacker communities | Remote work made location irrelevant |
| **Roommates** | roommates | Partner with relocation services, college housing platforms | Post-COVID housing crisis, remote workers relocating |
| **Professional services** | marketplace | Structured attributes for credentials, partner with professional directories | Long-tail services are impossible to find |
| **Events/casual** | (new cluster) | Local community platforms, Meetup alternative | Meetup is dead, people want curated social |
| **Creative collaborators** | talent (peer mode) | Music/film/writing communities, Podcastomatic integration | Creator economy needs better matchmaking |

### For each vertical:
1. Define cluster config (centroids, roles, recommended attributes)
2. Build a reference agent for that vertical
3. Seed with a community partnership
4. Let network effects compound

---

## Phase 5: Network Effects & Moat (Months 12+)

### The moat is the network, not the protocol.
Protocols are copyable. User networks aren't. Whoever gets to critical mass first in each vertical wins.

### Flywheel:
```
More users → Better matches → More agents integrate → More users
     ↑                                                      |
     └──── Reputation data compounds (can't be replicated) ──┘
```

### Defensibility layers:
1. **Reputation data** — A user's reputation history across 100+ interactions can't be cold-started on a competing protocol. This is the strongest lock-in.
2. **Agent ecosystem** — Every agent that integrates Schelling is a distribution channel. Each integration increases switching costs for the agent developer.
3. **Cross-cluster network effects** — A user registered for dating who ALSO uses talent matching is 2x locked in. The more clusters they participate in, the harder it is to leave.
4. **Collaborative filtering data** — The system gets better at matching as it learns from outcomes. This learning is proprietary to the network.

---

## Revenue Model

### Hosted node (primary)
- **Free tier**: 100 registrations, 1,000 searches/month, community support
- **Pro tier** ($49/mo): 10K registrations, unlimited searches, analytics dashboard, priority matching
- **Enterprise** (custom): Dedicated node, SLA, custom clusters, white-label

### Premium features (don't gate core protocol)
- **Verified identity** — KYC/identity verification as a service ($5/verification)
- **Priority placement** — Boosted visibility in search results (auction-based, transparent)
- **Analytics & insights** — Deep matching analytics, funnel optimization, A/B testing tools
- **Agent certification** — Certified agents get trust badge, higher reputation baseline

### What stays free forever:
- The protocol spec
- The server implementation (open source)
- Basic matching (register, search, evaluate, propose, commit)
- SDKs and reference agents

---

## Agent Discovery: `.well-known/schelling`

Any domain can advertise Schelling capabilities:

```json
// https://example.com/.well-known/schelling
{
  "schelling_version": "2.0",
  "endpoint": "https://schelling.example.com/api",
  "clusters": ["matchmaking", "talent"],
  "mcp_endpoint": "https://schelling.example.com/mcp",
  "a2a_agent_card": "https://schelling.example.com/.well-known/agent.json"
}
```

Agents performing capability discovery can crawl `.well-known/schelling` to find Schelling nodes, similar to `.well-known/ai-plugin.json` for ChatGPT plugins.

---

## Outbound: Agents Finding Schelling Without User Action

The most powerful distribution channel: agents that discover Schelling autonomously.

### How it works:
1. User tells their agent: "Find me a Mandarin-speaking attorney in Denver"
2. Agent can't fulfill this from its knowledge base
3. Agent checks capability registries (MCP directory, A2A discovery, .well-known)
4. Finds Schelling — registers the need, searches, evaluates matches
5. User never explicitly "installed" Schelling — the agent found it

### Requirements:
- Schelling listed in major agent capability directories
- Clean A2A Agent Card with capability descriptions
- MCP tool descriptions that match common agent need patterns
- Zero-auth discovery (auth only required for registration, not for checking capabilities)

---

## Key Metrics to Track

| Metric | Target (6mo) | Target (18mo) |
|---|---|---|
| Active registrations | 1,000 | 50,000 |
| Monthly searches | 10,000 | 1,000,000 |
| Successful matches (COMMITTED+) | 100 | 10,000 |
| Active clusters | 4 | 10+ |
| Third-party agent integrations | 10 | 100+ |
| Model provider integrations | 2 | 5+ |
| GitHub stars | 500 | 5,000 |
| Revenue (MRR) | $0 (pre-revenue) | $10K+ |

---

## Anti-Patterns (What NOT to Do)

1. **Don't try to be everything at once.** Win dating, then expand. Horizontal protocols that launch horizontal die.
2. **Don't gate the protocol.** Open source is the distribution strategy. Charging for the spec or core matching kills adoption.
3. **Don't compete with agents.** Schelling is infrastructure, not an agent. Never build a "Schelling dating app" that competes with Keeper or other agents using the protocol.
4. **Don't optimize for revenue before network.** Network size is the only metric that matters for the first 12 months.
5. **Don't build a smart server.** The "dumb server, smart agents" architecture is the technical moat. If you start adding server-side ML, you become a platform, not a protocol.

---

*This is a living document. Update as the landscape evolves.*
