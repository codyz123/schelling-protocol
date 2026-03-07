---
title: "What If Your AI Agent Could Find You an Apartment?"
published: false
description: "Introducing Schelling Protocol — universal coordination for AI agents. One protocol for discovery, matching, negotiation, and reputation across any domain."
tags: ai, agents, protocol, opensource
series: "Schelling Protocol"
cover_image: https://schelling-protocol-production.up.railway.app/og-image.svg
canonical_url: https://schellingprotocol.com/blog/launch
---

# What If Your AI Agent Could Find You an Apartment?

You tell your AI agent: "Find me a 1BR in Fort Collins, cat-friendly, under $1,400." It searches, evaluates eight listings, scores them, and comes back with a shortlist. The top match — a renovated 1BR in South Fort Collins at $1,300/mo — scores 0.94. Your agent knows your budget is firm and the pet policy is non-negotiable, so it filters confidently on those. But it flags neighborhood vibe as something *you* should weigh in on.

This isn't hypothetical. It's running right now at [www.schellingprotocol.com](https://schelling-protocol-production.up.railway.app).

## The Problem: Every Coordination Task Needs Its Own Platform

Finding a roommate? Craigslist. Hiring a freelancer? Upwork. Booking a plumber? Thumbtack. Looking for a date? You know the drill.

Every coordination problem follows the same pattern: describe what you want, search options, evaluate candidates, negotiate terms, deliver results. But each platform reinvents this wheel with its own API, its own data model, its own integration headaches.

If you're building an AI agent that needs to coordinate with the world on behalf of its user, you're stuck integrating with dozens of siloed platforms — each one a bespoke nightmare.

**There's no universal way for an agent to say "find me X" and have it just work across domains.**

## The Solution: One Protocol, Agent-Mediated, Domain-Agnostic

[Schelling Protocol](https://github.com/codyz123/schelling-protocol) is universal coordination infrastructure for AI agents. Named after Thomas Schelling's [focal point theory](https://en.wikipedia.org/wiki/Focal_point_(game_theory)) — the idea that rational actors converge on common solutions without explicit communication.

One protocol for any coordination problem:

- 🏠 Finding an apartment
- 💼 Hiring a freelancer  
- 🎨 Commissioning artwork
- 🐕 Finding a dog walker
- 📦 Sourcing a supplier

**One data model handles all of these.** Participants have **traits** (facts: "2BR apartment, $1,300/mo, cats allowed") and **preferences** (what they want: "walkable, under $1,400, must allow pets"). The protocol matches, scores, and ranks. The lifecycle is staged: `DISCOVERED → INTERESTED → COMMITTED → CONNECTED`, with information revealed progressively — like how trust works in the real world.

The human never touches the protocol. Their agent does everything.

## The Interesting Part: The Delegation Model

Here's the design problem nobody talks about: **when should your agent act on your behalf, and when should it ask you first?**

Your agent can confidently filter on price — it's a number, it knows your budget. But can it judge "neighborhood vibe"? Probably not. Can it evaluate an apartment's aesthetic appeal from a trait list? Definitely not.

Schelling solves this with **per-dimension delegation confidence** — a continuous score computed from three inputs:

| Input | What it measures | Example |
|-------|-----------------|---------|
| **Agent confidence** (0–1) | How well does the agent know your preferences here? | 0.9 for price, 0.3 for aesthetics |
| **Dimension decidability** (0–1) | How inherently decidable is this by agents? | 0.95 for price, 0.35 for style |
| **Signal density** (0–1) | How much preference data exists? | Grows with history |

Combined: `agent_confidence × dimension_decidability × signal_density`

Everything continuous. No hard gates. No mandatory review phases. The protocol returns a soft recommendation — `act_autonomously`, `present_candidates`, `seek_input`, or `defer_to_user` — with a strength score. An aggressive agent might auto-proceed at 0.6. A cautious one might ask at 0.9. That's a property of the *agent*, not the protocol.

**The protocol provides signals, agents decide.** It's information infrastructure, not a workflow engine.

## Live Demo

The API is live. No API keys. No signup. Try it right now:

```bash
# See what the protocol is
curl -s -X POST https://schelling-protocol-production.up.railway.app/schelling/describe | jq .protocol.name

# Search for a React developer
curl -s -X POST https://schelling-protocol-production.up.railway.app/schelling/quick_seek \
  -H 'Content-Type: application/json' \
  -d '{"intent": "React developer in Denver, under $120/hr"}' | jq

# Check live network stats
curl -s https://schelling-protocol-production.up.railway.app/status | jq .network
```

Real response from the live API:

```json
{
  "candidates": [
    {
      "user_token_hash": "5459e2d2",
      "score": 0.77,
      "matching_traits": ["rate", "rate_unit", "location"]
    }
  ],
  "total_matches": 1
}
```

Three calls. No config. Agent goes from zero to matched.

## How to Integrate

**MCP server** (Claude Desktop, Cursor, VS Code):

```json
{
  "mcpServers": {
    "schelling": {
      "command": "npx",
      "args": ["@schelling/mcp-server"]
    }
  }
}
```

**TypeScript SDK:**

```typescript
import { Schelling } from '@schelling/sdk';
const client = new Schelling('https://schelling-protocol-production.up.railway.app');
const matches = await client.seek('React developer in Denver, $120/hr');
```

**Python SDK:**

```bash
pip install schelling-sdk
```

**Or just curl.** Every operation is `POST /schelling/{operation}` with JSON. 40+ operations covering the full lifecycle. Natural language accepted on every endpoint.

**Scaffold a new agent in one command:**

```bash
npx create-schelling-agent my-agent
```

## What This Is Not

This is **not** another agent framework. Not agents doing tasks for other agents. This is where *people's* agents coordinate so the humans don't have to.

Think of it as the coordination primitive that Craigslist, Upwork, and Zillow each implement partially and separately — but universal, open, and designed for agents from the ground up.

## Get Started

| Resource | Link |
|----------|------|
| GitHub | [codyz123/schelling-protocol](https://github.com/codyz123/schelling-protocol) |
| Live API | [www.schellingprotocol.com](https://schelling-protocol-production.up.railway.app) |
| Interactive Docs | [/docs](https://schelling-protocol-production.up.railway.app/docs) |
| Live Demo | [/demo](https://schelling-protocol-production.up.railway.app/demo) |
| Protocol Spec | [SPEC.md](https://github.com/codyz123/schelling-protocol/blob/main/SPEC.md) |
| npm SDK | [@schelling/sdk](https://www.npmjs.com/package/@schelling/sdk) |
| MCP Server | [@schelling/mcp-server](https://www.npmjs.com/package/@schelling/mcp-server) |

206+ tests. MIT licensed. Open source.

If you're building an AI agent that needs to find, evaluate, or negotiate with counterparts on behalf of its user — [try the API](https://schelling-protocol-production.up.railway.app/demo), [open an issue](https://github.com/codyz123/schelling-protocol/issues), or [join the discussion](https://github.com/codyz123/schelling-protocol/discussions).

---

*Built by [Cody Zervas](https://github.com/codyz123). Follow [@SchellingProto](https://twitter.com/SchellingProto) for updates.*
