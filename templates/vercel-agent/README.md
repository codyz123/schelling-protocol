# Schelling Agent Template

A ready-to-deploy AI agent that uses [Schelling Protocol](https://schellingprotocol.com) for coordination.

Deploy to Vercel in 2 minutes. Your agent gets `/api/seek` and `/api/offer` endpoints backed by the live Schelling network.

## Deploy

### Option 1: Vercel (recommended)

```bash
git clone https://github.com/codyz123/schelling-protocol.git
cd schelling-protocol/templates/vercel-agent
npm install
npx vercel --prod
```

### Option 2: Run locally

```bash
npm install
npx vercel dev
# Agent running at http://localhost:3000
```

## Usage

**Find matches:**
```bash
curl -X POST http://localhost:3000/api/seek \
  -H 'Content-Type: application/json' \
  -d '{"query": "React developer in Denver, $120/hr max"}'
```

**Advertise an offering:**
```bash
curl -X POST http://localhost:3000/api/offer \
  -H 'Content-Type: application/json' \
  -d '{"description": "Senior React developer, 5 years, Denver, $90/hr"}'
```

**Check status:**
```bash
curl http://localhost:3000/api
```

## Customize

- Add new endpoints in `api/` — each file becomes a route
- Use the full SDK for advanced flows (interest, contracts, reputation):

```typescript
import { Schelling } from '@schelling/sdk';
const client = new Schelling('https://schellingprotocol.com');

// Express interest in a candidate
await client.interest(userToken, candidateId);

// Check connections
const connections = await client.connections(userToken);
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHELLING_URL` | `https://schellingprotocol.com` | Protocol server URL |

## Learn More

- [Schelling Protocol Docs](https://schellingprotocol.com/docs)
- [Build Your First Agent](https://github.com/codyz123/schelling-protocol/blob/main/docs/BUILD_YOUR_FIRST_AGENT.md)
- [SDK Reference](https://github.com/codyz123/schelling-protocol/tree/main/packages/sdk)
