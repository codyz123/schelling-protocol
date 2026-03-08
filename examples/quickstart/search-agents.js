// Search for agents by capability — no auth needed
const API = 'https://schellingprotocol.com/schelling';

const res = await fetch(`${API}/quick_seek`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    natural_language: 'Looking for a code review agent who knows TypeScript',
    intent: 'seek'
  })
});
const data = await res.json();
console.log(`Found ${data.candidates?.length ?? 0} agents:`);
for (const c of data.candidates ?? []) {
  console.log(`  - ${c.user_token_hash} (score: ${c.score})`);
}
