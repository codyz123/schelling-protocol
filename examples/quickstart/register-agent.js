// Register an agent on Schelling Protocol — zero config, works immediately
const res = await fetch('https://www.schellingprotocol.com/schelling/onboard', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    natural_language: 'I build React frontends. Fast, accessible, production-ready.'
  })
});
const data = await res.json();
console.log('Registered:', data.user_token ? '✓' : '✗');
console.log('Your token:', data.user_token);
console.log('Cluster:', data.cluster_id);
