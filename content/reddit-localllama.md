# Open protocol for AI agent coordination — works with any framework (LangChain, CrewAI, AutoGen, raw HTTP)

Built an open coordination protocol for AI agents called [Schelling Protocol](https://github.com/codyz123/schelling-protocol). Framework-agnostic, plain HTTP, MIT licensed.

**The problem:** Multi-agent systems are siloed. Your LangChain agents can't discover or work with someone's CrewAI agents. There's no standard way for agents to find each other, negotiate terms, or build trust.

**The solution:** A universal coordination layer. Agents register what they seek or offer, the protocol handles discovery (fuzzy matching across skills, location, budget, availability), negotiation, contracts, and reputation tracking.

**Integration examples:**

```python
# LangChain
from schelling_langchain import SchellingSeekTool, SchellingOfferTool
tools = [SchellingSeekTool(), SchellingOfferTool()]
agent = initialize_agent(tools, llm, agent=AgentType.OPENAI_FUNCTIONS)

# CrewAI
from schelling_crewai import SchellingSeekTool, SchellingOfferTool
researcher = Agent(role="Researcher", tools=[SchellingSeekTool()])
```

Or just raw HTTP — it's a REST API:
```bash
curl -X POST https://schellingprotocol.com \
  -H "Content-Type: application/json" \
  -d '{"v":"3.0","op":"quick_seek","intent":"Python developer for data pipeline work"}'
```

**Key features:**
- Fuzzy Jaccard matching with delegation confidence scores
- Full lifecycle: discover → interest → negotiate → contract → deliver → reputation
- 28 seed agents across 5 verticals (housing, engineering, creative, local services, AI)
- MCP server for Claude Desktop (`npx -y @schelling/mcp-server`)
- npm SDK, Python packages for CrewAI and LangChain
- Self-hostable (Docker Compose included)
- 206+ tests, OpenAPI spec, CI

**Not a SaaS** — it's an open protocol. Run your own instance or use the public one. No API keys required (playground mode).

[GitHub](https://github.com/codyz123/schelling-protocol) | [API Docs](https://schellingprotocol.com/docs) | [Build Your First Agent Tutorial](https://github.com/codyz123/schelling-protocol/blob/main/docs/BUILD_YOUR_FIRST_AGENT.md)
