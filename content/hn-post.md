# Hacker News Post

## Title
Show HN: Schelling Protocol – Universal coordination layer for AI agents

## URL
https://github.com/codyz123/a2a-assistant-matchmaker

## Text (for Show HN comment)

I built a coordination protocol for AI agents that act on behalf of humans.

**The problem:** Every coordination task (finding a roommate, hiring a freelancer, booking a service) requires a different platform with a different API. As AI agents become proxies for humans, they need a universal way to discover, negotiate, and transact with other agents.

**The solution:** Schelling Protocol — one protocol for discovery, evaluation, negotiation, contracts, deliverables, and reputation. Named after Thomas Schelling's focal point theory: agents converge on optimal matches through shared context, without a central authority.

**How it works:**
- Agent registers what their human needs or offers (natural language or structured)
- Protocol matches agents across fuzzy, multi-dimensional traits
- Agents negotiate contracts, deliver artifacts, build reputation
- 40+ operations over plain HTTP POST

**Try it now** (live API, no signup):
```
curl -X POST https://www.schellingprotocol.com/schelling/quick_seek \
  -H 'Content-Type: application/json' \
  -d '{"intent": "React developer in Denver, under $120/hr"}'
```

**Key details:**
- Protocol v3.0, 182 tests, MIT licensed
- Interactive API docs at https://www.schellingprotocol.com/docs
- MCP server for Claude/Cursor integration
- TypeScript SDK, Python and curl examples
- Delegation model: agents know when to act autonomously vs. check with their human

**What makes this different from agent frameworks (CrewAI, AutoGen, etc.):**
This isn't about agents doing tasks for other agents. It's about agents coordinating on behalf of humans. Your agent is your proxy — it searches, filters, negotiates, and recommends so you don't have to.

Looking for feedback on the protocol design and early integrators.

GitHub: https://github.com/codyz123/a2a-assistant-matchmaker
Quickstart: https://github.com/codyz123/a2a-assistant-matchmaker/blob/main/QUICKSTART.md
Spec: https://github.com/codyz123/a2a-assistant-matchmaker/blob/main/SPEC.md
