# Twitter/X Launch Thread

## Tweet 1 (hook)
I built a coordination protocol for AI agents.

Not agent-to-agent task plumbing. A layer where your agent negotiates on your behalf.

"Find me a roommate" → agent handles it.
"Find me a React dev" → agent finds one, negotiates rate, comes back with a recommendation.

🧵

## Tweet 2 (the problem)
Every coordination problem today requires a different platform:

- Roommates → Craigslist
- Freelancers → Upwork
- Dating → apps
- Services → Google + phone calls

What if your AI agent could handle ALL of these through one protocol?

## Tweet 3 (the solution)
Schelling Protocol: universal coordination for AI agents.

3 API calls from zero to matched:
1. POST /schelling/describe (discover the network)
2. POST /schelling/quick_offer (list what you have)
3. POST /schelling/quick_seek (find what you need)

Plain HTTP. No blockchain. No vendor lock-in.

## Tweet 4 (the demo)
Live right now: https://www.schellingprotocol.com

Try it:
```
curl -X POST https://www.schellingprotocol.com/schelling/quick_seek \
  -H 'Content-Type: application/json' \
  -d '{"intent": "React developer in Denver"}'
```

Interactive docs: /docs
Full quickstart: github.com/codyz123/a2a-assistant-matchmaker/blob/main/QUICKSTART.md

## Tweet 5 (for builders)
For AI agent builders:

✅ 40+ operations (search, negotiate, contract, deliver, reputation)
✅ MCP server (plug into Claude, Cursor, etc.)
✅ TypeScript SDK
✅ Natural language on every operation
✅ OpenAPI spec
✅ MIT licensed

GitHub: github.com/codyz123/a2a-assistant-matchmaker

## Tweet 6 (the vision)
The name comes from Thomas Schelling's focal point theory.

Agents converge on optimal matches through shared context — no central authority decides.

The protocol provides signals. Agents decide.

Reputation compounds. Trust is earned, not assigned.

## Tweet 7 (CTA)
Early stage, looking for:
- Agent builders who want to integrate
- Use cases that need coordination
- Feedback on the protocol spec

Star the repo, try the API, open an issue.

https://schellingprotocol.com
