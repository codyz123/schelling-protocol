# Schelling Protocol — Distribution Roadmap v2

**Thesis:** Increasingly, people will use agents on their behalf to do almost everything. Developers and power users adopt first, but eventually it's everyone. Schelling is the coordination layer for this future.

**Implication:** We're building infrastructure for a market that's forming right now. The strategy has two horizons:
- **Horizon 1 (Now → 6 months):** Developers and agent builders. Prove the protocol works. Earn credibility.
- **Horizon 2 (6-18 months):** Agent platforms and consumer products. Schelling becomes the invisible coordination layer inside products regular people use.

**Reality check:** Zero users. Solo founder. Limited time. Horizon 1 earns the right to play Horizon 2.

---

## Horizon 1: Developer Infrastructure (Months 1-6)

### The Three Things (solo founder can do 3 things well)

#### 1. Framework Integrations (70% of time)

The entire distribution strategy. Get embedded in existing agent toolchains.

**Priority order:**
1. **CrewAI** — most accessible, Python-first, active tool ecosystem
2. **LangChain/LangGraph** — largest surface area
3. **Vercel AI SDK** — TypeScript-native like Schelling
4. **OpenAI Agents SDK** — newest, hungry for ecosystem
5. **AutoGen** — Microsoft/enterprise credibility

**For each, ship:**
- Standalone package (`pip install schelling-crewai`)
- Complete example: Agent A posts task → Agent B discovers + bids → contract completes
- 5-minute quickstart README
- Public post on the framework's GitHub Discussions showing the integration

**Timeline:**
- Week 1-2: CrewAI package + demo + post
- Week 3-4: LangChain package + post
- Week 5-6: Vercel AI SDK + post
- Week 7-8: Assess which channel works. Double down.

#### 2. One Killer Demo (15% of time)

Two agents coordinating end-to-end on video. 90 seconds. No narration — the terminal output tells the story:
1. Human: "Find me a React developer in Denver under $120/hr"
2. Agent A searches Schelling, finds Agent B
3. Agents negotiate through contract lifecycle
4. Contract completes. Human gets the result.

Lives on: GitHub README (GIF), YouTube (single video), schellingprotocol.com.

#### 3. Developer Experience (15% of time)

Time-to-first-match under 2 minutes:
- `npx create-schelling-agent` → working agent in one command
- 20+ seeded agent profiles so new agents get matches immediately
- `docker compose up` for local development
- Error messages that tell you what to do next

---

### What's Cut

| Item | Status | Why |
|------|--------|-----|
| Daily YouTube videos | CUT | One demo video. No channel. |
| Daily Twitter | CUT | Post 2-3x/week when something real ships. |
| TikTok | CUT | Not the audience, not the format. |
| Weekly blog | CUT | Write integration tutorials only, posted where framework users are. |
| Discord/Slack | CUT | GitHub Discussions. Revisit at 50 active integrators. |
| Cold DMs to maintainers | CUT | Replace with public integration demos on their repos. |
| Reddit in 4 subreddits | CUT | One post in r/mcp when you have a framework integration. |
| Badges, leaderboards | CUT | Nobody uses these with 0 users. |
| Conference talks | DEFERRED | Lightning talk at local meetup once demo exists. |
| Enterprise tier | DEFERRED | Irrelevant until 100+ integrators. |

---

### Realistic Metrics (Horizon 1)

| Metric | Month 1 | Month 3 | Month 6 |
|--------|---------|---------|---------|
| Framework integrations shipped | 2 | 4 | 5+ |
| GitHub stars | 20-40 | 80-200 | 200-500 |
| npm downloads/week | 5-15 | 30-80 | 100-300 |
| API calls/day (non-founder) | 0-5 | 20-100 | 100-500 |
| Active integrators | 0-2 | 5-15 | 20-50 |

**North star metric:** Active integrations (distinct projects making weekly Schelling API calls).

---

## Horizon 2: Platform Layer (Months 6-18)

Once developers prove the protocol works, the next phase is becoming invisible infrastructure inside consumer-facing products. This is where the thesis comes alive.

### The Shift

Horizon 1 developers build agents for themselves. Horizon 2 is products that give *regular people* agents — and those agents coordinate through Schelling without the user knowing or caring.

**Target customers shift from:**
- Agent framework developers
- → Agent platform companies (who serve end users)

**Examples of what Horizon 2 looks like:**
- A personal assistant app where your agent finds you a plumber by coordinating with service provider agents on Schelling
- A freelance platform where matching and negotiation happen agent-to-agent under the hood
- A property management tool where tenant/landlord agents negotiate lease terms through Schelling
- A travel app where your agent coordinates flights, hotels, and restaurants by negotiating with vendor agents

### Enabling This Future

These are Horizon 2 distribution actions (don't start until Horizon 1 metrics are hit):

**Platform Partnerships:**
- [ ] Partner with 1-2 agent platform startups building consumer products (embed Schelling as their coordination backend)
- [ ] Ship hosted Schelling as a managed service (so platform companies don't self-host)
- [ ] Build SDKs for mobile (Swift, Kotlin) — consumer apps are mobile-first

**Consumer-Facing Proof Points:**
- [ ] Build one reference consumer app (e.g., "AgentMatch" — your personal agent finds you services) to prove the end-to-end UX
- [ ] Document the "invisible Schelling" pattern: how to build a consumer product where users never see the protocol

**Network Effects at Scale:**
- [ ] Federation: multiple Schelling servers discovering each other (like email — your agent's server talks to their agent's server)
- [ ] Universal agent identity: agents carry reputation across platforms
- [ ] Cluster marketplace: platform companies create domain-specific clusters (healthcare agents, legal agents, real estate agents)

**Positioning Shift:**
- Horizon 1: "Open coordination protocol for AI agents" (developer pitch)
- Horizon 2: "The infrastructure layer that lets your agent negotiate on your behalf" (platform pitch)
- Horizon 3 (years out): Regular people say "my agent handled it" and Schelling is the invisible rails, like TCP/IP is invisible when you browse the web.

### Horizon 2 Metrics

| Metric | Month 6 | Month 12 | Month 18 |
|--------|---------|----------|----------|
| Platform partnerships | 0-1 | 2-5 | 5-10 |
| Agents registered (including consumer product agents) | 50-200 | 1K-5K | 10K+ |
| Daily coordinations | 100-500 | 1K-5K | 10K+ |
| Revenue (if monetized) | $0 | $1K-5K/mo | $10K+/mo |

---

## Solving the Cold Start

The cold-start problem is different at each horizon:

**Horizon 1 (developers):**
- Seed 20+ realistic agent profiles across 3-4 verticals
- Ship 10 always-on demo agents that respond predictably (mock contracts, real coordination flows)
- `create-schelling-agent` scaffolder generates a working pair (seeker + offerer) that coordinates locally
- The network feels alive even when it's bootstrapped

**Horizon 2 (platforms):**
- First platform partner gets exclusive cluster access + co-marketing
- Cross-network reputation portability (agents bring their Schelling reputation to new platforms)
- Subsidize early coordination (free tier, generous rate limits) until network density hits critical mass
- The "Schelling moment": when enough agents are on the network that coordination happens faster through Schelling than through any single platform

---

## Week 1 Action Plan

| Day | Action | Time |
|-----|--------|------|
| 1 | Check HN post results. Did it convert? Fix the bottleneck. | 1hr |
| 1-2 | Build CrewAI integration package + working example | 6hr |
| 3 | Record killer demo (two agents coordinating via Schelling) | 3hr |
| 4 | Write tutorial: "Add agent coordination to CrewAI in 5 min" | 2hr |
| 5 | Post integration + tutorial to CrewAI GitHub Discussions + r/mcp | 1hr |
| 5 | Ship `npx create-schelling-agent` scaffolder | 3hr |
| 6-7 | Start LangChain integration | 4hr |

---

## Positioning

**Horizon 1:** "Open coordination protocol for AI agents. Discovery, matching, negotiation, and reputation over plain HTTP."

**Horizon 2:** "The infrastructure that lets agents negotiate on behalf of people."

**Horizon 3:** Invisible. Like how nobody says "I used TCP/IP today." They say "my agent found me a great plumber."

---

## The Uncomfortable Truth

If after 90 days of focused integration work, zero developers are using Schelling, the problem isn't distribution — it's timing. The protocol might be solving a problem that's 12-24 months away from mattering. That's fine. The thesis (agents doing everything for people) is directionally correct. The question is whether the infrastructure needs to exist *now* or whether it's premature.

The distribution roadmap is designed to give you that signal as fast as possible.
