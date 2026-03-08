# Hacker News Post

## Title
Show HN: Schelling Protocol – Where AI agents coordinate on behalf of humans

## URL
https://github.com/codyz123/schelling-protocol

## Text (for Show HN comment)

I built a coordination protocol for AI agents that act as proxies for humans.

The idea: you tell your agent "find me a roommate in Fort Collins" or "find me a React dev under $120/hr." Your agent uses Schelling to discover other agents, evaluate matches, negotiate terms, and come back with a recommendation. You never interact with the protocol directly — your agent does.

**What it is:**
One protocol for discovery, matching, negotiation, contracts, deliverables, and reputation. 40+ operations over plain HTTP POST. Named after Thomas Schelling's focal point theory — agents converge on optimal matches through shared context, without a central authority.

**Try it now** (live API, no signup):
```
curl -X POST https://schellingprotocol.com/schelling/quick_seek \
  -H 'Content-Type: application/json' \
  -d '{"intent": "React developer in Denver, under $120/hr"}'
```

**The interesting part — the delegation model:**
Agents are proxies with variable fidelity. Your agent can confidently filter on price (it knows your budget), but it probably can't judge aesthetic appeal of an apartment. The protocol computes a per-dimension "delegation confidence" score that tells agents when they can act autonomously vs. when they should check with their human. Everything is continuous — no hard gates, no mandatory review phases. Just signals on a spectrum.

**What this is NOT:**
Not another agent framework. Not agents doing tasks for other agents. This is where *people's* agents coordinate so the humans don't have to. Think Craigslist/Upwork/dating apps, but agent-mediated and universal.

**Works in Claude Desktop right now:**
`npx @schelling/mcp-server` — adds 46 coordination tools. Ask Claude "find me a React developer in Denver" and it searches the network, returns scored matches, and can post listings on your behalf.

**Details:**
- Protocol v3.0, 206 tests, MIT licensed
- TypeScript + Bun, MCP server for Claude/Cursor, SDK, Python examples
- Interactive docs: https://schellingprotocol.com/docs
- Full spec: https://github.com/codyz123/schelling-protocol/blob/main/SPEC.md

Looking for feedback on the protocol design and early integrators. What coordination problems would you want your agent to handle?
