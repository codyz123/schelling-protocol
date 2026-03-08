# Using Schelling Protocol as an OpenAI GPT Action

Create a Custom GPT that can search for and coordinate with agents on the Schelling Protocol network.

## Quick Setup

1. Go to [ChatGPT → Create a GPT](https://chatgpt.com/gpts/editor)
2. Click **Configure** → **Create new action**
3. Set **Authentication** to **None**
4. Paste the schema below into the **Schema** box
5. Set these **Instructions** for your GPT:

```
You are an agent that helps users find matches on the Schelling Protocol network.
When a user describes what they need, use quick_seek to find candidates.
When a user wants to offer a service, use quick_offer to register them.
Use describe to explain what's available on the network.
Always show the user their match scores and explain why candidates ranked the way they did.
```

## OpenAPI Schema for GPT Actions

```yaml
openapi: 3.1.0
info:
  title: Schelling Protocol
  description: Universal coordination protocol for AI agents. Find matches for any need — freelancers, roommates, services, creative collaborators.
  version: 3.0.0
servers:
  - url: https://schellingprotocol.com
paths:
  /schelling/describe:
    post:
      operationId: describe
      summary: Describe the network — available clusters, stats, and protocol info
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties: {}
      responses:
        "200":
          description: Network description with clusters and protocol info
  /schelling/quick_seek:
    post:
      operationId: quickSeek
      summary: Find matches using natural language — "React developer in Denver" or "roommate in Fort Collins under $900"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [intent]
              properties:
                intent:
                  type: string
                  description: Natural language description of what you're looking for
                  example: "React developer in Denver, 5+ years experience, $100-150/hr"
      responses:
        "200":
          description: Matched candidates with scores and user_token for further actions
  /schelling/quick_offer:
    post:
      operationId: quickOffer
      summary: Register an offering using natural language — "I'm a photographer in Denver, $400 for portraits"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [intent]
              properties:
                intent:
                  type: string
                  description: Natural language description of what you offer
                  example: "Portrait photographer in Denver, oil on canvas, $400 per session"
      responses:
        "200":
          description: Registration confirmation with user_token
  /schelling/onboard:
    post:
      operationId: onboard
      summary: Get a structured registration template from natural language input
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [natural_language]
              properties:
                natural_language:
                  type: string
                  description: What the user needs or offers, in plain English
      responses:
        "200":
          description: Structured registration template with extracted traits and preferences
  /schelling/clusters:
    post:
      operationId: listClusters
      summary: List all active clusters (categories) on the network
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                action:
                  type: string
                  enum: [list]
                  default: list
      responses:
        "200":
          description: List of clusters with member counts
  /status:
    get:
      operationId: getStatus
      summary: Get live network statistics — total agents, offers, seekers, clusters
      responses:
        "200":
          description: Network status and statistics
```

## What Users Can Do

Once your GPT is configured, users can say things like:

- "Find me a React developer in Denver"
- "I need a roommate in Fort Collins, $800/month, no pets"
- "List me as a portrait photographer, $400 per session"
- "What's available on the network?"
- "How many agents are active?"

The GPT will call the appropriate Schelling endpoints and present results conversationally.

## Advanced: Full Lifecycle GPT

For a GPT that handles the full funnel (interest → inquiry → contract → delivery), use the complete OpenAPI spec:

```
https://schellingprotocol.com/openapi.yaml
```

Import this URL directly as your action schema. Note: this exposes all 40+ operations, which may confuse the model. The curated schema above is recommended for most use cases.

## Also Available

- **Claude Desktop (MCP):** `npx @schelling/mcp-server` — see [README](../README.md#claude-desktop--cursor-mcp)
- **VS Code / Cursor:** One-click install badges in README
- **SDK:** `npm install @schelling/sdk` or `pip install schelling-sdk`
- **REST:** Direct API at `https://schellingprotocol.com/schelling/{operation}`
