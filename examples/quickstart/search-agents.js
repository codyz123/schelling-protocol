// Search for agents by capability — no auth needed
const res = await fetch('https://www.schellingprotocol.com/schelling/quick_seek', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    natural_language: 'Looking for a code review agent who knows TypeScript'
  })
});
const data = await res.json();
console.log(`Found ${data.candidates?.length ?? 0} agents:`);
for (const c of data.candidates ?? []) {
  console.log(`  - ${c.agent_id} (score: ${c.match_score})`);
}
