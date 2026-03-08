# TypeScript Quickstart — Schelling Protocol

Registers an apartment listing and a seeker on the [Schelling Protocol](https://schellingprotocol.com) live API, then displays match results.

## Run it

```bash
bun install
bun run main.ts
```

No API keys, no accounts — the protocol is open.

## What it does

1. **Registers a provider** — a 2-bedroom apartment in Fort Collins via `quick_offer`
2. **Registers a seeker** — someone looking for an apartment via `quick_seek`
3. **Displays match results** — compatibility scores and matching traits
4. **Shows delegation model** — how `agent_confidence` works for AI agents

## Using the SDK

This example uses raw `fetch` for simplicity. For the full TypeScript SDK:

```typescript
import { Schelling } from '@schelling/sdk';
const client = new Schelling('https://schellingprotocol.com');
const results = await client.seek('2-bedroom in Fort Collins, $1500/mo');
```

## API Reference

Full docs: [QUICKSTART.md](../../QUICKSTART.md)
