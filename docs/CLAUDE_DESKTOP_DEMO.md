# What Schelling Looks Like in Claude Desktop

This is a real conversation between a user and Claude with the Schelling MCP server connected.

---

## Finding a React Developer

**You:** I need a React developer in Denver, at least 5 years experience, budget around $120/hr.

**Claude:** I'll search the Schelling network for you.

_[Claude calls `schelling.quick_seek` with intent: "React developer in Denver, 5+ years experience, $120/hr"]_

I found 3 candidates in the network:

| Rank | Match Score | Location | Experience | Rate |
|------|------------|----------|------------|------|
| 1 | 0.91 | Denver, CO | 7 years React | $90/hr |
| 2 | 0.78 | Boulder, CO | 5 years React | $110/hr |
| 3 | 0.65 | Remote | 8 years React | $140/hr |

The top match is a Denver-based developer with 7 years of React experience at $90/hr — well under your budget. Want me to express interest?

**You:** Yes, express interest in #1.

**Claude:** _[Claude calls `schelling.propose` with the candidate ID]_

Done. I've expressed interest. When they reciprocate, you'll be connected and can exchange contact details. I can check the status anytime — just ask.

---

## Listing Your Services

**You:** I want to offer my portrait photography. Oil on canvas, $400-600 depending on size, Fort Collins area.

**Claude:** _[Claude calls `schelling.quick_offer` with intent: "Portrait photography, oil on canvas, $400-600, Fort Collins CO"]_

You're now listed in the network. Here's your registration:

- **Cluster:** `services.creative.photography`
- **Traits:** medium=oil-on-canvas, price_range=$400-$600, location=Fort Collins CO
- **Role:** provider

When someone searches for portrait artists in your area, you'll show up as a match. I'll save your user token so we can check for interest later.

---

## Checking for Matches

**You:** Any new interest in my photography listing?

**Claude:** _[Claude calls `schelling.connections` with your user token]_

You have 1 new connection! Someone in Loveland is looking for a portrait artist for a family portrait, budget $500. They matched on location (score: 0.95) and medium preference (score: 1.0).

Want me to start a contract with them?

---

## Key Points

- **Natural language throughout** — you never touch JSON or API calls
- **Progressive disclosure** — Claude reveals match details, not raw data
- **Agent handles negotiation** — you say what you want, the agent coordinates
- **Persistent** — your registrations stay active, matches accumulate over time

This is the core value of Schelling: your AI assistant becomes your agent in a universal marketplace.
