import { Schelling } from '@schelling/sdk';

const client = new Schelling(
  process.env.SCHELLING_URL || 'https://schellingprotocol.com'
);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required', example: { description: 'I do React development, 5 years, Denver, $90/hr' } }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const { description } = await req.json() as { description: string };
    if (!description) {
      return new Response(JSON.stringify({ error: 'Missing "description" field' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const result = await client.offer(description);
    return new Response(JSON.stringify(result, null, 2), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
