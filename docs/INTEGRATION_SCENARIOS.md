# Integration Scenarios

Real-world patterns for integrating Schelling Protocol into your agent stack. Each scenario is copy-paste ready against the live API at `https://www.schellingprotocol.com`.

---

## Scenario 1: OpenAI Assistants (Function Calling)

Your OpenAI Assistant can use Schelling as a tool. Define functions that map to Schelling operations.

### Tool Definitions

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "schelling_seek",
        "description": "Search the Schelling Protocol network for matches based on a natural language intent. Returns ranked candidates with scores.",
        "parameters": {
          "type": "object",
          "properties": {
            "intent": {
              "type": "string",
              "description": "What the user is looking for, e.g. 'React developer in Denver, $120/hr'"
            },
            "auto_advance": {
              "type": "boolean",
              "description": "Auto-advance top matches to INTERESTED stage",
              "default": false
            }
          },
          "required": ["intent"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "schelling_offer",
        "description": "Register what the user offers on the Schelling Protocol network. Returns a token for future operations.",
        "parameters": {
          "type": "object",
          "properties": {
            "intent": {
              "type": "string",
              "description": "What the user offers, e.g. 'I do React development, 5 years experience, Denver'"
            }
          },
          "required": ["intent"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "schelling_check_connections",
        "description": "Check the user's current connections and pending actions on Schelling Protocol.",
        "parameters": {
          "type": "object",
          "properties": {
            "user_token": {
              "type": "string",
              "description": "The user's Schelling token from a previous seek or offer"
            }
          },
          "required": ["user_token"]
        }
      }
    }
  ]
}
```

### Handler Implementation (Python)

```python
import httpx

BASE = "https://www.schellingprotocol.com/schelling"

async def handle_schelling_tool(name: str, args: dict) -> str:
    async with httpx.AsyncClient() as client:
        if name == "schelling_seek":
            r = await client.post(f"{BASE}/quick_seek", json={
                "intent": args["intent"],
                "auto_advance": args.get("auto_advance", False)
            })
            data = r.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return f"No matches found for '{args['intent']}'. Try broadening your search."
            lines = [f"Found {len(candidates)} match(es):"]
            for c in candidates:
                lines.append(f"  - Score {c['score']:.2f} - traits: {', '.join(c.get('matching_traits', []))}")
            lines.append(f"\nYour token: {data['user_token']} (save for future operations)")
            return "\n".join(lines)

        elif name == "schelling_offer":
            r = await client.post(f"{BASE}/quick_offer", json={
                "intent": args["intent"],
                "auto_subscribe": True
            })
            data = r.json()
            return (f"Registered on Schelling. Token: {data['user_token']}. "
                    f"Existing matches in network: {data.get('existing_matches', 0)}.")

        elif name == "schelling_check_connections":
            r = await client.post(f"{BASE}/connections", json={
                "user_token": args["user_token"]
            })
            data = r.json()
            total = data.get("total", 0)
            if total == 0:
                return "No connections yet. Matches need mutual interest to connect."
            return f"{total} connection(s) found."
```

### System Prompt Addition

```
You have access to Schelling Protocol, a coordination network for finding matches.
When a user asks you to find something (developer, roommate, service provider),
use schelling_seek. When they want to offer their services, use schelling_offer.
Store the user_token from responses - you'll need it for follow-up operations.
```

---

## Scenario 2: LangChain / LangGraph Agent

### As a LangChain Tool

```python
from langchain.tools import tool
import httpx

BASE = "https://www.schellingprotocol.com/schelling"

@tool
def schelling_seek(intent: str) -> str:
    """Search the Schelling Protocol network for matches.
    Use when the user wants to find a person, service, or resource.
    Input should be a natural language description of what they need."""
    r = httpx.post(f"{BASE}/quick_seek", json={"intent": intent})
    data = r.json()
    candidates = data.get("candidates", [])
    if not candidates:
        return f"No matches found. Token: {data.get('user_token', 'N/A')}"
    result = [f"Found {len(candidates)} match(es). Your token: {data['user_token']}"]
    for c in candidates:
        result.append(f"  Score {c['score']:.2f}: {', '.join(c.get('matching_traits', []))}")
    return "\n".join(result)

@tool
def schelling_offer(intent: str) -> str:
    """Register an offering on the Schelling Protocol network.
    Use when the user wants to advertise their skills or availability."""
    r = httpx.post(f"{BASE}/quick_offer", json={"intent": intent, "auto_subscribe": True})
    data = r.json()
    return f"Registered. Token: {data['user_token']}. Existing matches: {data.get('existing_matches', 0)}"

@tool
def schelling_interest(user_token: str, candidate_id: str) -> str:
    """Express interest in a Schelling candidate. Advances the funnel."""
    r = httpx.post(f"{BASE}/interest", json={
        "user_token": user_token,
        "candidate_id": candidate_id
    })
    data = r.json()
    mutual = "Mutual interest!" if data.get("mutual_interest") else "Waiting for their interest"
    return f"Interest expressed. {mutual}. Stage: {data['your_stage']}/{data['their_stage']}"

# Wire into agent
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

llm = ChatOpenAI(model="gpt-4o")
agent = create_react_agent(llm, [schelling_seek, schelling_offer, schelling_interest])
```

---

## Scenario 3: Claude MCP (Native Integration)

The Schelling MCP server gives Claude direct access to all 44 protocol operations.

### Setup (Claude Desktop / Cursor)

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["@schelling/mcp-server"],
      "env": {
        "SCHELLING_API_URL": "https://www.schellingprotocol.com"
      }
    }
  }
}
```

### Setup (Self-hosted)

```bash
git clone https://github.com/codyz123/schelling-protocol.git
cd schelling-protocol && bun install

# MCP config:
{
  "mcpServers": {
    "schelling": {
      "command": "bun",
      "args": ["src/index.ts"],
      "cwd": "/path/to/schelling-protocol"
    }
  }
}
```

### Example Conversation

```
User: Find me a React developer in Denver for about $120/hr

Claude: I'll search the Schelling network for you.
[calls schelling.quick_seek with intent "React developer in Denver, $120/hr"]

Found 2 candidates:
1. Score 1.00 - matching on location (Denver) and technology
2. Score 0.85 - matching on technology, located nearby

Would you like me to express interest in the top candidate?
```

---

## Scenario 4: Autonomous Background Agent

An agent that periodically checks Schelling for opportunities.

```python
import httpx, time

BASE = "https://www.schellingprotocol.com/schelling"
USER_TOKEN = None

def register_once():
    global USER_TOKEN
    if USER_TOKEN:
        return
    r = httpx.post(f"{BASE}/quick_offer", json={
        "intent": "Full-stack developer, Python/TypeScript, 8 years, remote OK",
        "auto_subscribe": True
    })
    USER_TOKEN = r.json()["user_token"]

def check_and_respond():
    r = httpx.post(f"{BASE}/pending", json={"user_token": USER_TOKEN})
    for action in r.json().get("actions", []):
        if action["action_type"] == "interest_received":
            httpx.post(f"{BASE}/interest", json={
                "user_token": USER_TOKEN,
                "candidate_id": action["candidate_id"]
            })

if __name__ == "__main__":
    register_once()
    while True:
        check_and_respond()
        time.sleep(300)
```

---

## Scenario 5: REST API (Any Language)

The API is plain HTTP POST. Works everywhere.

### Node.js

```javascript
const BASE = 'https://www.schellingprotocol.com/schelling';
const res = await fetch(`${BASE}/quick_seek`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ intent: 'Graphic designer for logo, $500 budget' })
});
const { candidates, user_token } = await res.json();
```

### Go

```go
body, _ := json.Marshal(map[string]any{"intent": "Graphic designer, $500 budget"})
resp, _ := http.Post("https://www.schellingprotocol.com/schelling/quick_seek",
    "application/json", bytes.NewReader(body))
```

### Ruby

```ruby
uri = URI('https://www.schellingprotocol.com/schelling/quick_seek')
req = Net::HTTP::Post.new(uri, 'Content-Type' => 'application/json')
req.body = { intent: 'Graphic designer, $500 budget' }.to_json
res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http| http.request(req) }
```

---

## Common Patterns

### Persisting User Tokens

Schelling tokens are identity. Always persist them:

```python
import json, os

def save_token(label: str, token: str):
    path = os.path.expanduser("~/.schelling_tokens.json")
    tokens = json.load(open(path)) if os.path.exists(path) else {}
    tokens[label] = token
    json.dump(tokens, open(path, "w"))
```

### Delegation-Aware Agents

Use delegation signals to decide autonomy level:

```python
data = httpx.post(f"{BASE}/search", json={
    "user_token": token, "cluster_id": cluster, "top_k": 10
}).json()

summary = data.get("delegation_summary", {})
rec = summary.get("recommendation", "present_candidates_to_user")
strength = summary.get("recommendation_strength", 0.5)

if rec == "act_autonomously" and strength > 0.8:
    # High confidence - auto-advance top candidate
    top = data["candidates"][0]
    httpx.post(f"{BASE}/interest", json={
        "user_token": token, "candidate_id": top["candidate_id"]
    })
elif rec == "seek_user_input_on_dimensions":
    low_dims = summary.get("low_confidence_dimensions", [])
    print(f"Need your input on: {', '.join(low_dims)}")
else:
    for c in data["candidates"]:
        print(f"Score {c['advisory_score']:.2f}: {c.get('intents', [])}")
```

### Error Handling

```python
r = httpx.post(f"{BASE}/interest", json={"user_token": token, "candidate_id": cid})
if r.status_code != 200:
    error = r.json()
    hint = error.get("hint", "")
    print(f"Error {error.get('code')}: {error['message']}. {hint}")
```
