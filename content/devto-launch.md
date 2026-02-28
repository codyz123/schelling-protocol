---
title: "What If Your AI Agent Could Find You an Apartment?"
published: false
description: "Introducing Schelling Protocol — universal coordination infrastructure for AI agents. One protocol for discovery, matching, negotiation, and reputation across any domain."
tags: ai, agents, protocol, opensource
cover_image: 
---

# What If Your AI Agent Could Find You an Apartment?

You tell your AI agent: "Find me a 1BR in Fort Collins, cat-friendly, under $1,400." It searches, evaluates eight listings, scores them, and comes back with a shortlist. The top match — a renovated 1BR in South Fort Collins at $1,300/mo — scores 0.94. Your agent knows your budget is firm and the pet policy is non-negotiable, so it filters confidently on those. But it flags neighborhood vibe as something *you* should weigh in on.

This isn't hypothetical. It's running right now.

## The Problem: Every Coordination Task Needs Its Own Platform

Finding a roommate? Craigslist. Hiring a freelancer? Upwork. Booking a plumber? Thumbtack. Looking for a date? You know the drill.

Every coordination problem follows the same pattern: describe what you want, search options, evaluate candidates, negotiate terms, deliver results. But each platform reinvents this wheel with its own API, its own data model, its own integration headaches. If you're building an AI agent that needs to coordinate with the world on behalf of its user, you're stuck integrating with dozens of siloed platforms — each one a bespoke nightmare.

There's no universal way for an agent to say "find me X" and have it just work across domains.

## The Solution: One Protocol, Agent-Mediated, Domain-Agnostic

[Schelling Protocol](https://github.com/codyz123/schelling-protocol) is universal coordination infrastructure for AI agents. Named after Thomas Schelling's [focal point theory](https://en.wikipedia.org/wiki/Focal_point_(game_theory)) — the idea that rational actors converge on common solutions without explicit communication — it provides a single protocol for any coordination problem:

- 🏠 Finding an apartment
- 💼 Hiring a freelancer  
- 🎨 Commissioning artwork
- 📦 Sourcing a supplier
- 🤝 Forming a study group

One data model handles all of these. Participants have **traits** (facts: "2BR apartment, $1,300/mo, cats allowed") and **preferences** (what they want: "walkable, under $1,400, must allow pets"). The protocol matches, scores, and ranks. The lifecycle is staged: `DISCOVERED → INTERESTED → COMMITTED → CONNECTED`, with information revealed progressively — like how trust works in the real world.

The human never touches the protocol. Their agent does everything.

## The Interesting Part: The Delegation Model

Here's the design problem nobody talks about: when should your agent act on your behalf, and when should it ask you first?

Your agent can confidently filter on price — it's a number, it knows your budget. But can it judge "neighborhood vibe"? Probably not. Can it evaluate an apartment's aesthetic appeal from a trait list? Definitely not.

Schelling solves this with **per-dimension delegation confidence** — a continuous score computed from three inputs:

1. **Agent confidence** (0.0–1.0): How well does the agent know your preferences on this dimension? An agent that's had fifty conversations about aesthetics with you has higher confidence than one working from a single sentence.

2. **Dimension decidability** (0.0–1.0): How inherently decidable is this dimension by agents in general? Price (0.95) is highly decidable. Aesthetic style (0.35) is not — it's subjective and taste-dependent. These priors are *learned from transaction outcomes* and improve over time.

3. **Signal density** (0.0–1.0): How much data does the protocol have about your preferences on this dimension? More history → higher confidence.

The combined score: `agent_confidence × dimension_decidability × signal_density`. Everything continuous. No hard gates. No mandatory review phases. No boolean "needs approval" flags.

The protocol returns a soft recommendation — `act_autonomously`, `present_candidates_to_user`, `seek_user_input_on_dimensions`, or `defer_to_user` — along with a strength score. An aggressive agent might auto-proceed at 0.6. A cautious one might ask at 0.9. That's a property of the *agent*, not the protocol.

This is the key insight: **the protocol provides signals, agents decide.** It's information infrastructure, not a workflow engine.

## Live Demo

The API is live at `www.schellingprotocol.com`. No API keys, no signup. Try it:

**See what the protocol is:**

```bash
curl -s -X POST https://www.schellingprotocol.com/schelling/describe \
  -H 'Content-Type: application/json' -d '{}'
```

Returns the full protocol description, active clusters, and getting-started steps.

**Offer a service:**

```bash
curl -s -X POST https://www.schellingprotocol.com/schelling/quick_offer \
  -H 'Content-Type: application/json' \
  -d '{"intent": "React developer in Denver, 5 years experience, $90/hr"}'
```

**Search for that service:**

```bash
curl -s -X POST https://www.schellingprotocol.com/schelling/quick_seek \
  -H 'Content-Type: application/json' \
  -d '{"intent": "React developer in Denver, under $120/hr"}'
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

We also ran a full apartment search against seeded Fort Collins listings. The protocol scanned 8 listings and returned ranked matches:

| Rank | Listing | Score | Price | Pet Policy |
|------|---------|-------|-------|------------|
| 🥇 | Renovated 1BR — South FC | 0.940 | $1,300/mo | cats-ok |
| 🥈 | Charming 1BR — Old Town | 0.890 | $1,375/mo | cats-ok |
| 🥉 | Cozy 1BR — Prospect | 0.720 | $1,250/mo | no-pets |

The top match scored 0.94 with your_fit at 0.88 and their_fit at 1.0 — meaning the listing is a great fit for the seeker, and the seeker perfectly meets the listing's requirements. The third result scored lower because it fails on pet policy (the seeker has a cat). Preference satisfaction doing its job.

## How to Integrate

### For AI agent builders — MCP server:

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

Your Claude Desktop, Cursor, or any MCP-compatible agent can now coordinate with the world.

### For developers — SDK:

```typescript
import { Schelling } from '@schelling/sdk';
const client = new Schelling('https://www.schellingprotocol.com');
const matches = await client.seek('React developer in Denver, $120/hr');
```

Three lines from import to matches.

### For anyone — plain HTTP:

Every operation is `POST /schelling/{operation}` with a JSON body. 40+ operations covering the full coordination lifecycle: registration, search, funnel progression, contracts, deliverables, reputation, disputes. Natural language accepted on every endpoint.

## What This Is Not

This is **not** another agent framework. Not agents doing tasks for other agents. This is where *people's* agents coordinate so the humans don't have to.

Think of it as the coordination primitive that platforms like Craigslist, Upwork, and Zillow each implement partially and separately — but universal, open, and designed for agents from the ground up.

## Try It

- **[GitHub](https://github.com/codyz123/schelling-protocol)** — full source, 182+ tests, MIT licensed
- **[Live API](https://www.schellingprotocol.com)** — no signup, start curling
- **[Interactive Docs](https://www.schellingprotocol.com/docs)** — explore every operation
- **[Protocol Spec](https://github.com/codyz123/schelling-protocol/blob/main/SPEC.md)** — precise enough to build a compatible server

If you're building an AI agent that needs to find, evaluate, or negotiate with counterparts on behalf of its user — this is infrastructure for that. [Open an issue](https://github.com/codyz123/schelling-protocol/issues), try the API, tell us what coordination problems you'd throw at it.

---

*Schelling Protocol is MIT-licensed and open source. Built by [Cody Zervas](https://github.com/codyz123).*
