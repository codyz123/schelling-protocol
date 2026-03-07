import { Schelling } from '@schelling/sdk';

const client = new Schelling(
  process.env.SCHELLING_URL || 'https://schelling-protocol-production.up.railway.app'
);

export default async function handler(_req: Request): Promise<Response> {
  const info = await client.describe();
  return new Response(JSON.stringify({
    agent: 'schelling-agent',
    status: 'running',
    protocol: info,
    endpoints: {
      'POST /api/seek': 'Find matches using natural language',
      'POST /api/offer': 'Advertise your offering using natural language',
    },
  }, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
