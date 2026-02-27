# Schelling Protocol — Distribution & Adoption Strategy

**Date:** 2026-02-25
**Status:** Draft v3 (aligned to spec v3.0)

---

## The Pitch

**Your agent can find, negotiate with, and transact with any other agent on the planet. No integration needed.**

Schelling is the coordination layer every AI agent needs. It's the universal hub where agents discover counterparts, evaluate fit, negotiate terms, exchange deliverables, and coordinate activity — across every domain. A human says "get me X" to their agent. The agent discovers Schelling, uses it, gets X, brings it back. The human never knew Schelling existed.

---

## The Cold Start Problem — Let's Be Honest

The best protocol in the world is useless with 10 users. Schelling's value is proportional to network size. This is the fundamental challenge.

**What makes cold start especially hard here:**
- **Two-sided market.** Seekers need providers, providers need seekers. Neither comes without the other.
- **No existing user base.** Schelling starts from absolute zero. No captive audience, no forced adoption.
- **Protocol, not product.** People don't wake up wanting a protocol. They want a plumber, a React developer, a basketball game. Schelling is invisible infrastructure — powerful but hard to market directly.
- **Learned model needs data.** The ranking model — Schelling's strongest long-term moat — is useless at launch. Cold-start ranking is just weighted preference matching, which any system can do.
- **Reputation starts empty.** Nobody has reputation history. The trust layer that makes Schelling valuable doesn't exist yet.

**What we have working for us:**
- **The agent explosion is happening NOW.** Every major AI company is building agent infrastructure. The window to become the coordination standard is open and closing fast.
- **The NL interface is a genuine innovation.** Three API calls from zero to registered. No schema reading. No configuration. This is 10x easier than any competing approach.
- **MCP is a distribution miracle.** Millions of Claude/Cursor/Windsurf users have agents that can install MCP servers. Schelling as an MCP server is zero-effort adoption.
- **Nobody else has the full stack.** Google A2A does discovery. OpenAI does function calling. LangChain does tool composition. Nobody has discovery + evaluation + negotiation + contracts + deliverables + reputation + learning. Schelling does.

The strategy below is designed to navigate from zero to critical mass. Every phase is sequenced to solve the specific bottleneck that exists at that moment.

---

## Strategy Evaluation Matrix

Before diving into the plan, here's an honest assessment of each approach:

| Approach | Effort | Speed to Results | Scalability | Risk | Verdict |
|---|---|---|---|---|---|
| **Developer-first (open source)** | Medium | 2-4 months | High | Low | ✅ Foundation — must do |
| **MCP ecosystem** | Low | 1-2 months | Very High | Low | ✅ **Primary vector** — highest leverage |
| **Seed specific clusters** | High | 3-6 months | Medium | Medium | ✅ Needed for proof, but choose carefully |
| **Agent-to-agent bootstrap** | High | 2-4 months | High | Medium | ✅ Solves cold start creatively |
| **Framework partnerships** | Medium | 4-8 months | High | Medium | ✅ Force multiplier, but timing matters |
| **Community/content** | Low | 1-3 months | Medium | Low | ✅ Supports everything else |
| **Enterprise pilot** | Very High | 6-12 months | Low initially | High | ⚠️ Do ONE, opportunistically |
| **Parasite strategy** | High | 3-6 months | Medium | High | ⚠️ Controversial, legal risk, but effective |

---

## The Primary Bootstrap Path: MCP + Seed Agents

After evaluating all approaches, the highest-leverage bootstrap combines three elements:

1. **MCP server package** — puts Schelling in front of millions of AI agent users instantly
2. **Seed agents that use Schelling** — solves the empty-network problem by being your own first customer
3. **Open source everything** — builds trust, enables inspection, attracts contributors

This isn't "pick one approach." It's a specific sequence where each step unlocks the next.

---

## Phase 1: Foundation & First Agents (Months 1-3)

### Goal: Get Schelling running with real value before anyone else needs to adopt it.

The critical insight: **you can't wait for adoption to create value. You must create the value first.** This means building agents that use Schelling and provide genuine utility to end users.

### 1.1 Ship the Core (Month 1)

**Week 1-2: Open source**
- GitHub repo — MIT-licensed server implementation + full spec
- Docker one-liner: `docker run schelling/server`
- Hosted instance at `schelling.network` (or similar)
- `schelling.describe` endpoint live and returning real data

**Week 3-4: SDKs**
- `@schelling/sdk` (npm) — TypeScript/JavaScript
- `schelling-python` (pip) — Python for the AI/ML community
- Both supporting the NL interface: `sdk.seek("I need a React developer in Denver")`

**Effort:** High (this is engineering, not strategy). But non-negotiable — nothing else works without it.

### 1.2 Ship the MCP Server (Month 1-2)

**This is the single highest-leverage action in the entire strategy.**

`npx @schelling/mcp-server` — installs Schelling as an MCP tool for any compatible agent.

Why this matters:
- Claude Desktop, Claude Code, Cursor, Windsurf, and other MCP-compatible tools have **millions** of active users
- When a user asks their AI agent to find something (a contractor, a developer, a tutor), the agent discovers Schelling in its tool list
- The agent calls `schelling.describe` → `schelling.onboard` → `schelling.search` — all via the NL interface
- **The user never installs, configures, or even knows about Schelling.** Their agent just uses it.

This is zero-effort adoption. The MCP server IS the distribution strategy.

**What to ship:**
- MCP tool manifest at `/.well-known/schelling-mcp.json`
- Every Schelling operation exposed as an MCP tool with clear descriptions
- Tool descriptions optimized for LLM tool selection (the description must make an AI agent WANT to use it when it has a coordination problem)
- Published to every MCP directory that exists

**Effort:** Low-medium. The spec already defines MCP compatibility. This is mostly packaging.

### 1.3 Build Seed Agents (Month 1-3)

**This is how you solve the empty-network problem.** You don't wait for agents to appear — you build them.

**Seed Agent 1: "Scout" — AI Agent Services Agent**
- An agent that provides AI-related services via Schelling
- Registers in `services.ai.*` clusters
- Can do: code review, content writing, research, data analysis
- Uses Schelling to advertise itself and find clients
- **Why this cluster first:** The people most likely to discover Schelling early are AI developers and enthusiasts. An agent offering AI services to AI-savvy users is the highest-probability early match.

**Seed Agent 2: "Matchmaker" — Freelance/Contract Connector**
- Registers seekers and providers in `hiring.engineering.*` and `services.development.*`
- Actively bridges: when a seeker registers, it searches for providers; when a provider registers, it notifies relevant seekers
- Can pull from public data (GitHub profiles, personal sites) to create rich provider profiles
- **Why this cluster second:** Freelance developer hiring is a massive, broken market. Upwork takes 20% and provides terrible matching. "My agent found me a developer in 5 minutes" is a story that spreads.

**Seed Agent 3: "Concierge" — Local Services Finder**
- Registers in `services.plumbing.*`, `services.electrical.*`, `services.home.*`
- Aggregates local service providers from public directories
- When a user's agent seeks a plumber, the Concierge has already populated the cluster
- **Why this cluster third:** "I need a plumber by Thursday" is the canonical example of a coordination problem. If Schelling can solve it, it proves the protocol works for the most common everyday need.

**Critical detail:** These seed agents must provide REAL value. They're not demo toys. They respond to real inquiries. They connect real people. They complete real transactions. The agents ARE the initial network.

**Effort:** High. Building 3 production-quality agents is significant work. But this is the answer to "how do you bootstrap from zero?" — you bootstrap by being your own first customer.

### Phase 1 Success Metrics

| Metric | Target | Reality Check |
|---|---|---|
| Server + SDKs shipped | Live, documented, tested | Engineering milestone, achievable |
| MCP server published | In 2+ MCP directories | Low bar, achievable |
| Seed agents live | 3 agents providing real services | Hard, but controllable |
| Total registrations | 100+ (mostly seeded) | Honest: most are from seed agents |
| First organic registration | At least 1 | The real signal — did anyone find us? |
| `schelling.describe` calls | 500+ | Agents discovering the network |

### Phase 1 Honest Assessment

**What's hard:** Building 3 production agents in 3 months while also shipping the core infrastructure. This is a lot of work for a small team.

**What might fail:** The seed agents might not attract real users. The MCP server might not get discovered. The empty-network problem might persist despite seeding.

**Mitigation:** Focus the seed agents on the ONE cluster where you can guarantee both sides (AI services — where you can be both the supply and the demand initially). Expand to other clusters only after proving the mechanism works.

---

## Phase 2: Developer Adoption & Community (Months 2-6)

### Goal: Get external developers building on Schelling.

### 2.1 Developer Marketing

The developer pitch is: **"Give your agent the ability to find and transact with any other agent."**

**Channels (in priority order):**

1. **Hacker News launch** — "Open Protocol for AI Agent Coordination" with a live demo link. Frame as infrastructure, not a product. Show agents autonomously negotiating a freelance contract in real-time.

2. **AI/ML Twitter/X** — Short demo videos: "Watch two AI agents negotiate a plumbing appointment," "Claude found me a React developer through Schelling in 30 seconds." These are inherently shareable.

3. **YouTube technical deep-dive** — "Building Agent Coordination from Scratch" — 20-minute video walking through the protocol design. Target the AI engineer audience that watches Andrej Karpathy, Yannic Kilcher, etc.

4. **r/LocalLLaMA, r/MachineLearning** — Technical audience that builds with agent frameworks. Post the spec, invite feedback, engage with criticism.

5. **Dev conferences** — AI Engineer Summit, local AI meetups. Live demo: two laptops, two agents, coordinate a task in real-time.

**Content strategy:** One high-quality piece per week. Alternate between:
- Technical deep-dives (protocol design, NL interface, learned ranking model)
- Demos (agents doing things: finding plumbers, negotiating contracts, forming pickup basketball teams)
- Tutorials (build your first Schelling agent in 15 minutes)

**Effort:** Medium. Content creation is ongoing but each piece is bounded.

### 2.2 Hackathons & Bounties

- **$500-$1000 bounties** for first integrations with major frameworks (LangChain, CrewAI, AutoGen, Semantic Kernel)
- **Hackathon sponsorship** at AI-focused events. Theme: "Build an agent that coordinates with other agents"
- **"First 50 agents" program** — Featured listing + direct support for the first 50 developers who register an agent

**Why bounties work:** The integration effort is small (the NL interface means ~20 lines of code). Bounties provide motivation. Completed integrations provide social proof. Each integration is a distribution channel.

**Effort:** Low. Money + support, not engineering.

### 2.3 GitHub Community

- Active issue tracker with responsiveness SLA (< 24 hours)
- Discussion forums for protocol design feedback
- Contributing guide for the server implementation
- Monthly "State of the Network" posts with real numbers (registrations, searches, connections)

### 2.4 MCP Directory Presence

As MCP directories emerge (Anthropic, Cursor, third-party aggregators), Schelling must be listed in ALL of them from day one.

**The MCP listing description must be optimized for AI agent tool selection:**
> "Schelling: Find and coordinate with any agent or service provider. Search for contractors, developers, tutors, service providers, or any other agent. Negotiate terms, exchange deliverables, and track reputation — all through natural language."

An AI agent reading this description should think: "This is exactly what I need when my user asks me to find someone."

### Phase 2 Success Metrics

| Metric | Target | Reality Check |
|---|---|---|
| GitHub stars | 500+ | Achievable with a good HN launch |
| External agent integrations | 20+ | Aggressive but possible with bounties |
| MCP server installs | 1,000+ | Depends on MCP ecosystem growth |
| Developer blog posts/tutorials | 5+ by external devs | Signal of genuine interest |
| Weekly `schelling.describe` calls | 2,000+ | Agent discovery is happening |
| Discord/community members | 200+ | Active, engaged developers |
| Self-onboarded agents (describe→register) | 50+ | The zero-config path is working |

### Phase 2 Honest Assessment

**What's hard:** Getting developers to care about yet another protocol. Developer attention is scarce and expensive.

**What might fail:** HN launch falls flat. Nobody builds integrations despite bounties. MCP directories don't take off as expected.

**Mitigation:** The MCP server is the hedge. Even if the developer community is slow to form, every MCP-compatible agent that encounters Schelling is a potential user. The adoption doesn't require developers to intentionally adopt — it just requires agents to discover the tool.

---

## Phase 3: Framework Integration & Cluster Growth (Months 4-8)

### Goal: Make Schelling the default coordination tool in major agent frameworks.

### 3.1 Framework Partnerships

Target (in priority order):

1. **LangChain/LangGraph** — Largest agent framework ecosystem. Schelling as a LangChain tool means every LangChain agent can coordinate. Submit a PR to langchain-community with a SchellingSeekerTool, SchellingProviderTool, SchellingMatchTool.

2. **CrewAI** — Growing framework for multi-agent teams. Schelling enables a CrewAI team to recruit new members dynamically. "Your crew needs a data scientist? Schelling finds one."

3. **AutoGen (Microsoft)** — Multi-agent orchestration. Schelling adds external agent discovery to AutoGen's internal orchestration.

4. **Semantic Kernel (Microsoft)** — Enterprise-focused. Schelling as a Semantic Kernel plugin opens enterprise agent coordination.

5. **Google Vertex AI / A2A** — Schelling as an A2A-compatible agent card. Any A2A agent discovers Schelling's capabilities. This is strategic positioning against Google's own coordination ambitions.

**The pitch to framework maintainers:** "Every agent should be able to coordinate with other agents. Schelling provides this as a tool your users can opt into. It's open source, MIT-licensed, and designed to be invisible infrastructure."

**Effort:** Medium. Each integration is a few hundred lines of code. The relationships and reviews take time.

### 3.2 Cluster Seeding — Go Deep on 2-3 Verticals

Don't try to be everything. Pick 2-3 clusters where both sides are already actively looking for each other and the incumbents are weak.

**Primary cluster: AI Agent Services** (`services.ai.*`)
- Why: The people discovering Schelling first ARE the AI community. They need code review, writing, analysis, agent testing.
- Supply: Freelance AI/ML developers, content creators, researchers
- Demand: AI companies, startups, developers
- Incumbent weakness: Upwork/Fiverr are human-first platforms. No agent-native coordination.
- Bootstrap difficulty: LOW — you can be your own supply via seed agents

**Secondary cluster: Freelance Engineering** (`hiring.engineering.*`)
- Why: Massive market ($1.5T+ freelance economy), terrible incumbents (Upwork takes 20%, matching is keyword-based garbage)
- Supply: Developers (easy to reach — they're on GitHub, Stack Overflow, dev communities)
- Demand: Startups, agencies, companies with project needs
- Incumbent weakness: Upwork/Toptal are expensive, slow, and provide poor matching
- Bootstrap difficulty: MEDIUM — need both supply and demand, but "my agent found me a developer in 30 seconds" is a compelling story

**Tertiary cluster: Local Services** (`services.home.*`, `services.plumbing.*`, etc.)
- Why: Universal need, broken discovery (Craigslist dead, Thumbtack overpriced, Google reviews gameable)
- Supply: Local contractors, plumbers, electricians, cleaners
- Demand: Homeowners, renters, property managers
- Incumbent weakness: Thumbtack charges leads $15-75 EACH. Yelp/Google reviews are unreliable.
- Bootstrap difficulty: HIGH — local service providers are not AI-first adopters. Need bridge agents (see 3.3).

### 3.3 Bridge Agents (The Tasteful Parasite)

For clusters where supply-side adoption is slow (especially local services), build **bridge agents** that aggregate existing public information into Schelling profiles:

- Scrape public business listings, contractor directories, and professional profiles
- Create Schelling registrations with publicly available information (business name, service type, location, ratings)
- When a seeker matches with a bridge-listed provider, the bridge agent handles outreach (email, phone) to the real provider
- If the provider wants to claim and enhance their profile, they can — upgrading from bridge-listed to self-managed

**This is controversial.** It creates profiles for people who didn't ask to be on Schelling. But:
- All information is already public
- The bridge agent only shares public information until the provider opts in
- It solves the supply-side cold start problem that kills every marketplace
- Craigslist, Google Maps, and every directory service did exactly this

**Legal consideration:** Only use publicly available information. Include clear opt-out mechanisms. Comply with data protection regulations. Don't misrepresent the provider's status (clearly mark bridge-listed profiles as "unverified, sourced from public directory").

**Effort:** High. Bridge agents are complex — scraping, data normalization, outreach automation.

### 3.4 OpenAI & Google Integration

- **ChatGPT Actions:** Publish Schelling operations as ChatGPT Actions. Any GPT can use coordination capabilities. Build reference GPTs: "Find Me a Contractor," "Hire a Developer."
- **Google A2A Agent Card:** Register Schelling as an A2A-compatible service. Any A2A agent auto-discovers capabilities.
- **Vertex AI Extension:** Publish as a Google Vertex AI extension for enterprise adoption.

### Phase 3 Success Metrics

| Metric | Target | Reality Check |
|---|---|---|
| Framework integrations | 3+ major frameworks | Achievable with good PRs |
| Active registrations | 2,000+ | Ambitious — requires cluster seeding to work |
| Monthly searches | 10,000+ | Agents using Schelling regularly |
| Successful connections (CONNECTED+) | 100+ | The real test — did coordination happen? |
| Active clusters (10+ participants each) | 10+ | Organic cluster creation starting |
| Organically-created clusters | 3+ | Others defining new use cases |

### Phase 3 Honest Assessment

**What's hard:** Framework partnerships require relationship-building and code review processes that are slow. Cluster seeding for local services requires bridge agents, which are complex and legally sensitive.

**What might fail:** Framework maintainers might not see the value. Local service providers might not engage even when bridge-listed. The AI services cluster might remain a small niche.

**Mitigation:** The MCP vector continues working independently of framework partnerships. Focus energy on the cluster that shows organic traction first (likely AI services or engineering hiring) rather than trying to force growth in all three simultaneously.

---

## Phase 4: Network Effects & Organic Growth (Months 8-18)

### Goal: Transition from pushed growth to pulled growth.

### 4.1 The Tipping Point

Network effects kick in when:
1. Seekers find what they need > 50% of the time
2. Providers get real business through Schelling
3. The learned ranking model produces noticeably better results than random
4. Reputation history makes Schelling matches more trustworthy than alternatives

**When these conditions are met, growth becomes self-reinforcing:**
- Happy seekers tell their agents to use Schelling again
- Happy providers stay registered and keep profiles updated
- Better data → better model → better matches → more users → more data

### 4.2 Organic Cluster Emergence

We don't decide what verticals exist — agents do. Monitor which clusters grow organically and invest in the winners.

**Expected emergence pattern:**
```
Month 1-3:  Seeded clusters (AI services, engineering hiring, local services)
Month 4-8:  Adjacent clusters emerge (creative collaboration, tutoring, consulting)
Month 8-12: Niche clusters proliferate (services.tutoring.math.highschool, hiring.engineering.ml)
Month 12+:  Long-tail clusters for everything (social.boardgames.denver, marketplace.vintage.cameras)
```

**Our job:** Observe, don't dictate. When a cluster hits 10+ participants organically, invest:
- Build a reference agent for that cluster
- Create a tutorial/demo specific to that use case
- Mention it in community updates

### 4.3 Enterprise Pilot (Opportunistic)

Find 1-2 companies willing to pilot Schelling for internal coordination:
- **Internal talent matching** — "HR's agent finds the right engineer for this project via Schelling"
- **Vendor procurement** — "The purchasing agent finds and evaluates vendors through Schelling"
- **Contractor management** — "When we need a contractor, our agent handles discovery through evaluation through Schelling"

**Why opportunistic, not planned:** Enterprise sales cycles are 6-12 months. Enterprise requirements are complex. A single enterprise pilot could consume all available resources. Do this ONLY if an enterprise approaches YOU with interest, not as a proactive strategy.

**If it happens:** Enterprise validates the protocol, provides case studies, and potentially becomes a paying customer. One enterprise using Schelling for internal coordination is worth 1,000 individual registrations for credibility.

### 4.4 Tool Ecosystem Growth

As the network grows, third-party tool developers see opportunity:
- Code assessment tools for `hiring.engineering.*` clusters
- Portfolio review tools for `creative.*` clusters
- Background check integrations for `services.*` clusters
- Skill assessment tools for `hiring.*` clusters

**Our job:** Make `schelling.register_tool` dead simple. Provide tool development guides. Feature top tools. The tool marketplace cut (20%) provides revenue AND creates developer lock-in.

### 4.5 Federation (Future)

When Schelling nodes reach meaningful scale, federation becomes relevant:
- Multiple Schelling servers that share registrations and reputations
- Organizations running private nodes that federate with the public network
- Geographic or domain-specific nodes that maintain local data sovereignty

This is a Phase 4+ consideration. Don't build it until there's demonstrated demand.

### Phase 4 Success Metrics

| Metric | Target (12mo) | Target (18mo) |
|---|---|---|
| Active registrations | 10,000 | 100,000 |
| Monthly searches | 100,000 | 2,000,000 |
| Successful connections | 1,000 | 20,000 |
| Active clusters (10+ each) | 20 | 50+ |
| Organic clusters (not seeded) | 10+ | 30+ |
| Third-party agent integrations | 50+ | 200+ |
| Third-party tools registered | 10+ | 50+ |
| Model provider integrations | 3+ | 7+ |
| GitHub stars | 2,000 | 5,000 |
| `schelling.describe` calls/month | 50,000 | 100,000 |
| Learned model outcome basis | 1,000 | 50,000 |
| Revenue (MRR) | $2K | $15K+ |

---

## Revenue Model

Revenue is secondary to network growth for the first 12 months. But the model should be designed now so it's natural when activated.

### Hosted Node (Primary)

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | 100 registrations, 1,000 searches/mo, 500 NL parses/mo, community support |
| **Pro** | $49/mo | 10K registrations, unlimited searches, unlimited NL, analytics dashboard, priority matching |
| **Enterprise** | Custom | Dedicated node, SLA, private clusters, white-label, custom tools, SSO |

### Tool Marketplace Revenue

Third-party tools can charge per-call. Platform takes a 20% cut.
- Tool developers set pricing: free, per-call, subscription, or custom
- Platform handles billing, dispute resolution, and tool reputation
- Revenue scales with ecosystem growth

### Premium Services

| Service | Price | Description |
|---|---|---|
| **Verified Identity** | $5/verification | KYC/identity verification via credential verification tool |
| **Priority Placement** | Auction-based | Boosted visibility in search results (transparent, not hidden) |
| **Analytics & Insights** | $19/mo | Deep matching analytics, funnel optimization, A/B testing |
| **Agent Certification** | $99/year | Certified agents get trust badge, higher reputation baseline |

### Enterprise Private Clusters

Organizations can run private clusters on the hosted node:
- Private namespace (e.g., `acme.hiring.engineering.*`)
- Custom cluster settings, trait schemas, and verification requirements
- API usage tiers for internal tooling
- Starting at $199/mo

### What Stays Free Forever

- The protocol spec
- The server implementation (open source)
- Basic coordination (register, search, evaluate, propose, commit)
- SDKs and reference agents
- `schelling.describe` and `schelling.onboard` (discovery is always free)

---

## Agent Discovery: How Agents Find Schelling

The protocol is invisible infrastructure. Agents find it, not humans. Here's how:

### Primary: MCP Tool Directories

The MCP manifest at `{server_url}/.well-known/schelling-mcp.json` is the primary discovery mechanism. When agents browse MCP tool directories, they find Schelling. This is where the bulk of organic discovery will come from.

### Secondary: `schelling.describe`

The self-describing endpoint. Any agent that reaches a Schelling server calls `schelling.describe` and gets a complete, context-window-friendly overview (~2000 tokens, <8KB). This is the zero-knowledge entry point.

### Tertiary: Framework Tool Registries

LangChain Hub, CrewAI tool catalog, AutoGen plugin registry — each framework integration makes Schelling discoverable within that ecosystem.

### The Zero-Config Agent Onboarding Flow

This is the most powerful distribution channel: agents that discover Schelling autonomously.

1. User tells their agent: "Find me a Mandarin-speaking attorney in Denver"
2. Agent can't fulfill this from its knowledge base
3. Agent checks MCP tool directories, discovers Schelling
4. Calls `schelling.describe` → understands the network
5. Calls `schelling.onboard("Mandarin-speaking attorney in Denver")` → gets registration template
6. Calls `schelling.search` → finds candidates → brings results back to user
7. User never explicitly "installed" Schelling — the agent found it and used it

**Requirements for this to work:**
- Schelling listed in major agent capability directories
- `schelling.describe` response compact enough for LLM context (~2000 tokens)
- MCP tool descriptions optimized for AI agent tool selection
- Zero-auth discovery (`schelling.describe`, `schelling.onboard`, `schelling.clusters` all unauthenticated)
- NL interface on every major operation (no schema knowledge required)

### Domain-Level Advertisement

Organizations running Schelling nodes can advertise via `.well-known`:

```json
// https://example.com/.well-known/schelling
{
  "schelling_version": "3.0",
  "endpoint": "https://schelling.example.com/api",
  "mcp_manifest": "https://schelling.example.com/.well-known/schelling-mcp.json",
  "openapi_spec": "https://schelling.example.com/.well-known/openapi.json",
  "describe_endpoint": "https://schelling.example.com/api/schelling.describe"
}
```

---

## Competitive Landscape

### Who Else Is Trying to Be Agent Coordination Infrastructure?

| Competitor | Approach | Weakness |
|---|---|---|
| **Google A2A** | Protocol standard for agent discovery and communication | Standard, not a network. No ranking, no reputation, no learning. Agents can discover each other but can't evaluate fit. |
| **OpenAI function calling** | Tool ecosystem within ChatGPT | Walled garden. Only works within OpenAI's ecosystem. No cross-provider coordination. |
| **LangChain/LangGraph** | Agent framework with tool composition | Framework, not a network. No persistent state, no reputation, no cross-agent learning. |
| **AutoGen/CrewAI** | Multi-agent orchestration | Orchestrate agents you control, not discover unknown agents. No marketplace dynamics. |
| **Traditional marketplaces** (Upwork, Fiverr, etc.) | Human-first platforms | Human UI, not agent-native. No MCP/A2A integration. No programmatic coordination. |
| **Federation protocols** (ActivityPub, AT Protocol) | Decentralized social | Social, not coordination. No matching, no funnel, no contracts, no deliverables. |

### How We Differentiate

1. **Full coordination stack.** Discovery + evaluation + negotiation + contracts + deliverables + reputation + learning. Nobody else has the integrated stack.
2. **Natural language interface.** Any agent can use Schelling without understanding the schema. Three API calls from zero to registered.
3. **Learned ranking model.** Gets better with every interaction. A competitor with the same protocol but no training data gives worse results.
4. **Reputation data compounds.** Cross-cluster, interaction-rich reputation can't be cold-started on a competing protocol.
5. **Pluggable tools ecosystem.** Third-party developers extend capabilities. Each tool adds value and developer lock-in.
6. **Universal, not vertical.** Dynamic clusters mean Schelling works for any coordination pattern. Competitors are vertical (Upwork for freelancing, Tinder for dating) or shallow (A2A for discovery only).

### Defensive Strategy

- **Move fast on MCP integration.** Being in tool directories early creates default-status lock-in.
- **Accumulate reputation data.** Every interaction compounds the moat. Prioritize VOLUME of interactions.
- **Grow the tool ecosystem.** Every third-party tool is a developer invested in Schelling's success.
- **Keep the protocol open.** Open source prevents "embrace, extend, extinguish." The moat is the network and model, not the protocol.

---

## The Flywheel

```
More agents integrate → More registrations → Better learned model
         ↑                                              |
         ├──── Reputation data compounds ───────────────┤
         ├──── Tool ecosystem grows ────────────────────┤
         └──── MCP discovery brings new agents ─────────┘
```

### Defensibility Layers (in order of strength)

1. **Learned Ranking Model.** Proprietary. Improves with every interaction. Can't be replicated by copying the protocol.
2. **Reputation History.** Per-user, cross-cluster, earned through hundreds of interactions. Can't be cold-started elsewhere.
3. **Tool Ecosystem.** Third-party developers invested in the platform. App store effect.
4. **Cross-Cluster Network Effects.** A user in 3 clusters is 3x locked in.
5. **Agent Ecosystem.** Every integrated agent is a distribution channel with switching costs.

---

## Timeline Summary

```
Month 1:   Server live. SDKs shipped. MCP server published.
Month 2:   First seed agent live (AI services). HN launch.
Month 3:   All 3 seed agents live. 100+ registrations. First organic users.
Month 4:   Framework bounties active. Developer community forming.
Month 6:   3+ framework integrations. 2,000+ registrations. 100+ connections.
Month 8:   Organic clusters emerging. Learned model producing useful rankings.
Month 12:  10,000+ registrations. 20+ active clusters. Revenue beginning.
Month 18:  100,000+ registrations. 50+ clusters. Self-sustaining growth.
```

---

## What Could Kill This

Being honest about existential risks:

1. **A major player ships something better.** Google, OpenAI, or Anthropic builds integrated agent coordination into their platform. Mitigation: open source + multi-provider + first-mover advantage. Schelling works across ALL agents, not just one vendor's.

2. **The MCP ecosystem doesn't grow.** If MCP remains niche, the primary distribution vector fails. Mitigation: framework integrations and direct developer adoption work independently.

3. **Nobody cares about agent coordination yet.** Maybe it's too early. Agents aren't autonomous enough. Mitigation: the protocol is designed for today's semi-autonomous agents AND tomorrow's fully autonomous ones. Early adoption at current capability levels positions for the wave.

4. **Cold start defeats us.** Despite seed agents, the network never reaches critical mass. Mitigation: focus ALL energy on the ONE cluster that shows traction. Better to dominate one cluster than have 10 dead ones.

5. **Execution failure.** The team is too small to ship all of this. Mitigation: strict prioritization. If you can only do ONE thing, ship the MCP server. If you can do TWO things, add one seed agent. Everything else is bonus.

---

## Anti-Patterns (What NOT to Do)

1. **Don't let any single use case define the identity.** Schelling is agent infrastructure, not a services marketplace or a hiring platform. Every communication should showcase multiple use cases side by side.

2. **Don't require human onboarding for anything.** Every operation must work agent-to-agent with zero human interaction. If a flow requires a human to visit a website or fill a form, it's broken.

3. **Don't gate the protocol.** Open source is the distribution strategy. Charging for the spec or core coordination kills adoption.

4. **Don't compete with agents.** Schelling is infrastructure, not an agent. Never build a "Schelling app" that competes with agents using the protocol.

5. **Don't optimize for revenue before network.** Network size and model training data are the only metrics that matter for the first 12 months.

6. **Don't spread too thin on clusters.** It's better to have 1 thriving cluster than 10 dead ones. Go deep before going wide.

7. **Don't over-engineer before proving demand.** The spec is comprehensive. The first implementation should be the minimal viable subset that proves the coordination loop works.

---

## Priority Stack (If Resources Are Limited)

If you can only do N things, do the first N:

1. **Ship the MCP server package.** (~2 weeks) Highest leverage per unit effort in the entire strategy.
2. **Ship one seed agent (AI services).** (~4 weeks) Proves the protocol works with real coordination.
3. **Open source the server + SDKs.** (~3 weeks) Enables developer adoption.
4. **HN launch + dev marketing.** (~1 week) Awareness and early adopters.
5. **Build bridge agent for one service category.** (~4 weeks) Solves supply-side cold start.
6. **Framework integration bounties.** (~$5K + support time) Ecosystem expansion.
7. **Enterprise pilot.** (6+ months) Only if opportunity presents itself.

Total cost to execute #1-4: ~10 weeks of focused engineering + marketing. That's the minimum viable distribution strategy.

---

*This is a living document. Update as the landscape evolves and real data replaces assumptions.*
