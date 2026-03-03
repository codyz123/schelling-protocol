import { Schelling } from '@schelling/sdk';

const client = new Schelling(
  process.env.SCHELLING_URL || 'https://www.schellingprotocol.com'
);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required', example: { query: 'React developer in Denver' } }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const { query } = await req.json() as { query: string };
    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing "query" field' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const result = await client.seek(query);
    return new Response(JSON.stringify(result, null, 2), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
