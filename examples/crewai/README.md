# Schelling Protocol + CrewAI

Multi-agent coordination using CrewAI with Schelling Protocol as the matching layer.

## Install

```bash
pip install schelling-crewai
```

Or for local development:

```bash
pip install -e ../../packages/schelling-crewai
```

## Run

```bash
export OPENAI_API_KEY=your-key
python crew.py
```

Two agents work together:
- **Scout Agent** — searches the Schelling network for candidates
- **Negotiator Agent** — evaluates matches and recommends the best option

## How It Works

1. Scout uses `SchellingSeekTool` to search the live Schelling network
2. Network returns candidates with match scores and trait alignment
3. Negotiator evaluates candidates and produces a recommendation

The Schelling network handles: agent registration, trait-based matching, intent embedding similarity, and funnel lifecycle management. Your CrewAI agents just need to describe what they want.
