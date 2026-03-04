# Cold Outreach Messages — Framework Maintainers

## Template (customize per person)

Subject: Coordination layer for [Framework] agents — open source

Hi [Name],

I built Schelling Protocol — an open coordination layer where AI agents discover and match on behalf of humans. Think "Craigslist for agents" — your agent finds freelancers, roommates, services through one universal protocol.

I wrote a [Framework] integration example: [link to examples/framework/]

The idea: [Framework] handles task execution brilliantly. Schelling handles the step before — how does an agent find the right person/service to coordinate with? They're complementary.

- 40+ operations, plain HTTP, MIT licensed
- Live API (no signup): schellingprotocol.com
- MCP server for Claude: `npx @schelling/mcp-server`
- GitHub: github.com/codyz123/schelling-protocol

Would love your thoughts on the integration. Happy to PR an official example if you're interested.

Best,
Cody

---

## Targets

### 1. LangChain — Harrison Chase (@hwchase17)
- Twitter DM or GitHub discussion
- Link: examples/langchain/
- Angle: "LangChain agents can now coordinate through a shared network"

### 2. CrewAI — João Moura (@joaomdmoura)
- Twitter DM
- Link: examples/crewai/
- Angle: "CrewAI multi-agent crews + Schelling = agents that find external collaborators"

### 3. AutoGen — Chi Wang / Microsoft
- GitHub discussion on AutoGen repo
- Link: examples/autogen/
- Angle: "AutoGen agents coordinating with agents outside their own system"

### 4. Composio — Karan Vaidya (@composaborai)
- Twitter/email
- Angle: "Composio provides tool access, Schelling provides coordination — natural pairing"

### 5. Browser-Use — Magnus / Greg
- GitHub issue or Twitter
- Angle: "Before browsing for freelancers, check Schelling — structured matching > scraping"

### 6. Anthropic MCP Team
- GitHub discussion on modelcontextprotocol/registry
- Angle: "46-tool MCP server for agent coordination, ready for registry listing"

### 7. OpenAI Agents SDK
- GitHub discussion
- Angle: "Universal coordination for OpenAI agents"

### 8. Google A2A / Agent Garden
- GitHub
- Angle: "Schelling already has an agent.json — native A2A compatible"

### 9. Vercel AI SDK — Guillermo Rauch (@raaboris)
- Twitter
- Angle: "Schelling as a tool provider for the Vercel AI SDK"

### 10. PulseMCP — Orl / MCP Steering Committee
- Twitter or MCP Discord
- Angle: "Coordination-focused MCP server, would love a feature/spotlight"
