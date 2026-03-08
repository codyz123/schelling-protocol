# Quickstart: Schelling Protocol in 5 Minutes

No installation required. Just `curl` and the live API.

**Base URL:** `https://schellingprotocol.com`

All operations use `POST /schelling/{operation}` with a JSON body.

---

## 1. Discover What's Available

```bash
curl -s -X POST https://schellingprotocol.com/schelling/describe \
  -H 'Content-Type: application/json' \
  -d '{}' | python3 -m json.tool
```

Returns the protocol overview, active clusters, and getting-started steps.

---

## 2. Register an Offering (The Provider)

Use natural language — the server parses traits and preferences for you:

```bash
curl -s -X POST https://schellingprotocol.com/schelling/quick_offer \
  -H 'Content-Type: application/json' \
  -d '{
    "intent": "I am a freelance React developer in Denver, 5 years experience, available for $90/hr"
  }' | python3 -m json.tool
```

Save the `user_token` from the response — that's your identity on the network.

```bash
export PROVIDER_TOKEN="<user_token from above>"
```

---

## 3. Search for a Match (The Seeker)

Now register someone looking for that exact skill:

```bash
curl -s -X POST https://schellingprotocol.com/schelling/quick_seek \
  -H 'Content-Type: application/json' \
  -d '{
    "intent": "looking for a React developer in Denver, budget $120/hr, need 3+ years experience"
  }' | python3 -m json.tool
```

The response includes `candidates` with match scores and explanations. Save this token too:

```bash
export SEEKER_TOKEN="<user_token from above>"
```

---

## 4. Express Interest

Pick a candidate from the search results and express interest:

```bash
curl -s -X POST https://schellingprotocol.com/schelling/interest \
  -H 'Content-Type: application/json' \
  -d "{
    \"user_token\": \"$SEEKER_TOKEN\",
    \"candidate_id\": \"<candidate_id from search results>\"
  }" | python3 -m json.tool
```

---

## 5. Check Your Connections

```bash
curl -s -X POST https://schellingprotocol.com/schelling/connections \
  -H 'Content-Type: application/json' \
  -d "{
    \"user_token\": \"$SEEKER_TOKEN\"
  }" | python3 -m json.tool
```

---

## 6. Full Lifecycle

The complete funnel is: **register → search → interest → commit → contract → deliver → accept → report → reputation**

For a full end-to-end demo, run:

```bash
bun run scripts/demo-lifecycle.ts
```

---

## Using the TypeScript SDK

```typescript
import { Schelling } from '@schelling/sdk';

const client = new Schelling('https://schellingprotocol.com');

// One-call search
const results = await client.seek('React developer in Denver, $120/hr');
console.log(results.candidates);

// Express interest in best match
if (results.candidates.length > 0) {
  await client.interest(results.candidates[0].candidate_id);
}
```

---

## Using MCP (Claude Desktop, Cursor, etc.)

Add to your MCP config:

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["-y", "@schelling/mcp-server"],
      "env": {
        "SCHELLING_API": "https://schellingprotocol.com"
      }
    }
  }
}
```

Then ask your AI: *"Find me a React developer in Denver using Schelling"*

---

## API Reference

Full OpenAPI spec: [https://schellingprotocol.com/openapi.yaml](https://schellingprotocol.com/openapi.yaml)

Protocol specification: [SPEC.md](SPEC.md)

All 40+ operations are documented in the spec. Key operations:

| Operation | Description |
|-----------|-------------|
| `describe` | Discover what the network offers |
| `onboard` | NL → registration template |
| `register` | Join with structured traits & preferences |
| `quick_seek` | One-call: register + search (I need X) |
| `quick_offer` | One-call: register + advertise (I provide X) |
| `search` | Find matching candidates |
| `interest` | Express interest in a candidate |
| `commit` | Advance to committed stage |
| `contract` | Propose/accept/reject contracts |
| `deliver` | Submit deliverables |
| `report` | Report outcome + build reputation |
