# Schelling Protocol — Marketing, Distribution & Adoption Plan

*Master plan. Everything in one place. Created 2026-02-28.*

---

## 1. AUTOMATED CONTENT MARKETING

### 1.1 Video Content Pipeline
**Goal:** Automated video generation → posting to platforms that allow it.

#### Platforms & ToS Reality
- **YouTube**: Allows automated uploads via Data API v3. No ban risk for programmatic posting. Requires OAuth. Best for longer explainers (2-10 min).
- **TikTok**: Content Posting API exists but requires app review + approval. Alternative: use TikTok's "upload from URL" or schedule via third-party (Later, Buffer). Short-form (15-60s).
- **Twitter/X**: API allows video upload + tweet. Rate limited but fine for 2-3/day.
- **LinkedIn**: API allows article/post publishing. Good for thought leadership.
- **Reddit**: NO automated posting — will get banned. Manual only.

#### Video Types & Generation
1. **Protocol Demo Recordings** (weekly)
   - Tool: Puppeteer/Playwright screen recording of live API calls
   - Script: curl commands hitting real API, showing JSON responses
   - Voiceover: ElevenLabs TTS from script
   - Assembly: ffmpeg compositing (terminal + voiceover + captions)
   - Output: 60s TikTok/Shorts + 3-5min YouTube version

2. **"Schelling Finds" Series** (2x/week)
   - Scrape real public listings (Craigslist RSS, Indeed API, etc.)
   - Register as Schelling agents, run matching
   - Generate video showing: "We found 3 roommates who should live together"
   - Show match scores, delegation confidence, which dimensions matched
   - Tool: Remotion (React-based video generation) or Motion Canvas

3. **Technical Explainers** (monthly)
   - Deep dives: delegation model, fuzzy matching, reputation system
   - Format: animated diagrams + narration
   - Tool: Manim (3Blue1Brown-style) or Remotion

4. **"Build With Schelling" Tutorials** (biweekly)
   - Screen recording of building an integration from scratch
   - 5-10 minutes, YouTube-focused
   - Shows: npm install → code → working demo

#### Automation Stack
- **Generation**: Bun script (`scripts/content-gen.ts`) orchestrating:
  - Playwright for API demo recordings
  - ElevenLabs API for voiceover (key in TOOLS.md)
  - ffmpeg for assembly
  - Remotion for animated content
- **Publishing**: 
  - YouTube: `googleapis` npm package (YouTube Data API v3)
  - TikTok: Buffer/Later API or manual queue
  - Twitter: twitter-api-v2 package
  - LinkedIn: LinkedIn Marketing API
- **Scheduling**: OpenClaw cron job, runs daily at 9 AM MT
- **Content Calendar**: Auto-generated, stored in `content/calendar.md`

### 1.2 Written Content
1. **Blog Posts** (dev.to + hashnode + Medium cross-post)
   - "Why AI Agents Need a Coordination Protocol" (launch post)
   - "Building a Roommate Finder with 3 API Calls" (tutorial)
   - "The Delegation Model: When Should Your Agent Ask You?" (technical)
   - "Schelling vs Direct Integration: Why Universal Beats Bespoke" (opinion)
   - Tool: AI-draft → human review → cross-post to all platforms

2. **Twitter/X Threads** (3x/week)
   - Automated: pull interesting matches from Schelling, generate thread
   - Manual: thought leadership on agent coordination
   - Existing draft: `content/tweet-thread.md`

3. **Newsletter** (monthly, optional later)
   - "Schelling Protocol Monthly" — new integrations, match stats, roadmap
   - Platform: Buttondown (free tier, API for automation)

### 1.3 Frequency Targets
| Platform | Type | Frequency | Automated? |
|----------|------|-----------|------------|
| YouTube | Demo/tutorial | 2x/week | Semi (gen + review) |
| TikTok | Short demo clips | 3x/week | Semi |
| Twitter/X | Threads + clips | Daily | Yes (with review queue) |
| LinkedIn | Thought leadership | 2x/week | Yes |
| dev.to | Blog posts | 1x/week | Draft auto, publish manual |
| Reddit | Discussion posts | 2x/week | Manual only |

---

## 2. DIRECTORY & REGISTRY LISTINGS

### 2.1 MCP Directories (Priority — this is our native ecosystem)
1. **Official MCP Registry** — registry.modelcontextprotocol.io
   - Submit via PR to github.com/modelcontextprotocol/registry
   - Requires: server.json schema, GitHub repo (must be PUBLIC first)
   - **BLOCKER: Repo must go public before this**

2. **PulseMCP** — pulsemcp.com/servers (8600+ servers listed)
   - Community-driven, submit via their form
   
3. **mcp.so** — Community MCP directory
   - Submit via their listing form

4. **Smithery** — smithery.ai
   - MCP server marketplace, submit for listing

5. **Glama** — glama.ai/mcp/servers
   - MCP directory, submit via GitHub

6. **MCPHub** — mcphub.io
   - Another community directory

7. **awesome-mcp-servers** — github.com/punkpeye/awesome-mcp-servers
   - PR to add Schelling to the list

8. **modelcontextprotocol/servers** — github.com/modelcontextprotocol/servers
   - Official servers repo, PR for inclusion (high bar)

### 2.2 AI Agent Directories
1. **AgentOps** — agentops.ai (agent monitoring, has directory)
2. **AI Agent Directory** — aiagentdirectory.com
3. **There's An AI For That** — theresanaiforthat.com
4. **AI Tools Directory** — aitoolsdirectory.com
5. **Future Tools** — futuretools.io
6. **Toolify** — toolify.ai

### 2.3 API & Developer Directories
1. **RapidAPI** — rapidapi.com (list the REST API)
2. **APIs.guru** — apis.guru (OpenAPI directory, auto-discovered)
3. **Public APIs** — github.com/public-apis/public-apis (PR)
4. **ProgrammableWeb** — programmableweb.com/apis/directory

### 2.4 Package Registries
1. **npm** — Publish @schelling/sdk and @schelling/mcp-server
2. **JSR** — jsr.io (Deno/Bun registry)
3. **PyPI** — Python SDK wrapper (if we build one)

### 2.5 GitHub Awesome Lists
1. awesome-mcp-servers (mentioned above)
2. awesome-ai-agents — github.com/e2b-dev/awesome-ai-agents
3. awesome-llm-agents — github.com/kaushikb11/awesome-llm-agents  
4. awesome-ai-tools — multiple repos
5. awesome-generative-ai — github.com/steven2358/awesome-generative-ai

### 2.6 Protocol / Standard Directories
1. **llms.txt** — Already have this at /public/llms.txt ✅
2. **Schema.org** — Already have structured data on landing page ✅
3. **OpenAPI** — Already serving at /openapi.yaml ✅
4. **ai-plugin.json** — Already serving at /.well-known/ai-plugin.json ✅

---

## 3. DEVELOPER OUTREACH

### 3.1 Agent Frameworks to Contact (specific repos + maintainers)

| Framework | Repo | Integration Angle |
|-----------|------|-------------------|
| CrewAI | github.com/crewAIInc/crewAI | Tool integration — agents use Schelling to find other agents |
| AutoGPT | github.com/Significant-Gravitas/AutoGPT | Plugin system — Schelling as a plugin |
| LangGraph | github.com/langchain-ai/langgraph | Tool node — Schelling tools in agent graphs |
| LangChain | github.com/langchain-ai/langchain | Tool integration, similar to LangGraph |
| Semantic Kernel | github.com/microsoft/semantic-kernel | Plugin model — Schelling as SK plugin |
| AutoGen | github.com/microsoft/autogen | Agent discovery via Schelling |
| MetaGPT | github.com/geekan/MetaGPT | Role-based agents use Schelling for external coordination |
| Camel-AI | github.com/camel-ai/camel | Multi-agent society meets Schelling |
| OpenClaw | github.com/openclaw/openclaw | MCP integration (already have this partially) |
| Claude Code | Anthropic's CLI | MCP server integration |
| Cursor | cursor.com | MCP server support |
| Windsurf | codeium.com | MCP server support |

**Outreach method per framework:**
- Open a GitHub Discussion or Issue: "RFC: Agent coordination via Schelling Protocol"
- Include: 3-line code example, link to quickstart, link to live API
- Tone: "Built this, thought your users might find it useful" — NOT salesy

### 3.2 Communities to Join & Post In

| Community | Platform | How to engage |
|-----------|----------|---------------|
| MCP Discord | Discord | Share in #showcase, help in #support |
| LangChain Discord | Discord | Share in #projects |
| CrewAI Discord | Discord | Share integration example |
| AutoGPT Discord | Discord | Share plugin |
| Anthropic Discord | Discord | Share in relevant channels |
| AI Engineer Discord | Discord | Share in #projects |
| r/LocalLLaMA | Reddit | Post about self-hosted Schelling |
| r/MachineLearning | Reddit | Technical post about matching algorithm |
| r/artificial | Reddit | Discussion post about agent coordination |
| r/singularity | Reddit | Vision post |
| Hacker News | HN | Show HN (see launch section) |
| Indie Hackers | indiehackers.com | Build in public thread |
| Twitter/X AI community | Twitter | Engage with agent builders |

### 3.3 Specific People to Reach Out To
- Harrison Chase (LangChain/LangGraph CEO)
- Joao Moura (CrewAI creator)
- Toran Bruce Richards (AutoGPT creator)
- Swyx (AI Engineer, Latent Space)
- Simon Willison (llm/datasette, MCP advocate)
- Matt Shumer (HyperWrite, agent researcher)
- Lilian Weng (OpenAI, agent survey author)
- Devin (Cognition Labs) team — integration partner

**Method**: Twitter DM or reply to relevant tweet. Short, specific, link to demo.

### 3.4 Conferences & Events
- AI Engineer World's Fair (2026)
- NeurIPS workshops
- Local AI meetups (Fort Collins, Denver, Boulder)
- Virtual: AI agent-focused Twitter Spaces, podcasts

---

## 4. SEO & AI DISCOVERABILITY

### 4.1 Target Search Terms
- "AI agent coordination protocol"
- "agent to agent communication"
- "MCP server agent discovery"
- "AI agent matchmaking"
- "multi-agent coordination"
- "agent negotiation protocol"
- "AI agent marketplace"

### 4.2 AI Search Optimization
- **llms.txt**: Already present ✅ — review and optimize content
- **ai-plugin.json**: Already present ✅
- **Schema.org**: Already on landing page ✅
- **OpenAPI**: Served at /openapi.yaml ✅ — ensure AI crawlers can find it
- **Content for AI training**: Blog posts, README, SPEC.md — all help future AI models know about Schelling

### 4.3 Backlink Strategy
- Blog cross-posts (dev.to, Medium, Hashnode) all link to schellingprotocol.com
- GitHub awesome-list PRs create backlinks
- Directory listings create backlinks
- Community posts create backlinks
- Guest posts on AI blogs (pitch to AI-focused publications)

### 4.4 Technical SEO
- Landing page already has meta tags, OG tags, Twitter cards ✅
- Add: sitemap.xml, robots.txt to landing page
- Add: canonical URLs on cross-posted content
- Ensure API returns proper CORS headers for browser-based demos

---

## 5. COMMUNITY BUILDING

### 5.1 Discord Server
- Create "Schelling Protocol" Discord
- Channels: #general, #showcase, #support, #integrations, #ideas, #announcements
- Bot: webhook for new GitHub commits, new registrations on the network
- Link prominently from README, landing page, all content

### 5.2 Open Source Excellence
- CONTRIBUTING.md (already exists? verify)
- Issue templates (already exist ✅)
- Good first issues — label 5-10 issues for newcomers
- Code of conduct
- Roadmap in GitHub Projects or discussions

### 5.3 Integration Bounties (when budget allows)
- "Build a Schelling integration for [framework X], get $500"
- Start with 2-3 bounties for highest-value frameworks
- Can use GitHub Sponsors or direct payment

### 5.4 Example Integrations to Build (ourselves)
- CrewAI + Schelling example repo
- LangGraph + Schelling example
- Python standalone example
- "Find a freelancer" end-to-end tutorial repo
- "Roommate matching" demo app with UI

---

## 6. LAUNCH SEQUENCE

### Phase 0: Pre-Launch (do first)
1. Make GitHub repo PUBLIC ⚠️ BLOCKER
2. Publish npm packages (@schelling/sdk, @schelling/mcp-server)
3. Submit to Official MCP Registry
4. Create Discord server
5. Ensure all content drafts are polished
6. Record 2-3 demo videos
7. Prepare all directory submissions (don't submit yet)

### Phase 1: Soft Launch (Week 1)
1. Submit to 3-4 MCP directories (PulseMCP, mcp.so, Smithery, awesome-mcp-servers)
2. Post in MCP Discord #showcase
3. Tweet thread from Cody's account
4. dev.to launch blog post
5. Start "Schelling Finds" video series

### Phase 2: Hard Launch (Week 2)
1. **Show HN** post (Tuesday or Wednesday, 8-9 AM ET)
2. **Product Hunt** launch (same week, different day)
3. r/MachineLearning and r/LocalLLaMA posts
4. LinkedIn article
5. Submit to remaining directories

### Phase 3: Outreach Wave (Week 3-4)
1. GitHub issues/discussions on top 5 agent frameworks
2. Direct outreach to 10 specific people
3. Join and post in 5+ Discord communities
4. Pitch guest posts to 2-3 AI blogs

### Phase 4: Sustain (ongoing)
1. Automated content pipeline running
2. Weekly "Schelling Finds" videos
3. Respond to community questions
4. Build integrations based on interest signals
5. Track metrics, double down on what works

---

## 7. RECURRING / AUTOPILOT

### Runs Automatically After Setup
- Content generation pipeline (cron: daily)
- YouTube/TikTok/Twitter posting (cron: per schedule)
- "Schelling Finds" match discovery + content gen (cron: 2x/week)
- GitHub CI/CD on pushes
- Auto-seed demo data on deploys

### Needs Weekly Manual Attention
- Review auto-generated content before final publish (30 min)
- Respond to Discord/GitHub community (30 min)
- Check analytics, adjust strategy (15 min)
- Review and merge community PRs (as needed)

### Metrics to Track
- GitHub stars + forks
- npm weekly downloads
- API registrations (unique user_tokens)
- API requests/day
- Landing page visitors (Vercel Analytics)
- Directory referral traffic
- Content engagement (views, likes, shares)
- Discord members
- Integration count (external projects using Schelling)

### Tools
- Vercel Analytics (free, already on landing page)
- GitHub Insights (free)
- npm stats (free)
- Simple Plausible or Umami for API analytics (self-hosted, free)
- Content scheduling: Buffer free tier or custom scripts
