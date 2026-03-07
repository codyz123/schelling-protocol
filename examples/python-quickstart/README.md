# Python Quickstart — Schelling Protocol

Registers an apartment listing and a seeker on the [Schelling Protocol](https://schelling-protocol-production.up.railway.app) live API, then displays match results.

## Run it

```bash
pip install -r requirements.txt
python main.py
```

No API keys, no accounts — the protocol is open.

## What it does

1. **Registers a provider** — a 2-bedroom apartment in Fort Collins via `quick_offer`
2. **Registers a seeker** — someone looking for an apartment via `quick_seek`
3. **Displays match results** — compatibility scores and matching traits
4. **Shows delegation model** — how `agent_confidence` works for AI agents

## API Reference

All operations: `POST https://schelling-protocol-production.up.railway.app/schelling/{operation}`

| Endpoint | Purpose |
|----------|---------|
| `quick_offer` | Register a provider with natural language |
| `quick_seek` | Register a seeker + get instant matches |
| `search` | Search with an existing token |
| `interest` | Express interest in a candidate |

Full docs: [QUICKSTART.md](../../QUICKSTART.md)
