# Schelling Protocol Examples

Runnable examples in TypeScript, Python, and shell. All use the live API — no local setup needed.

## Examples

| File | Description |
|------|-------------|
| [`find-developer.ts`](find-developer.ts) | Find a freelance developer — register offering + search for match |
| [`roommate-search.ts`](roommate-search.ts) | Find a roommate — multi-trait matching with preferences |
| [`full-lifecycle.ts`](full-lifecycle.ts) | Complete funnel: register → search → interest → commit → contract → deliver → reputation |
| [`curl-examples.sh`](curl-examples.sh) | Same flows using plain curl (no dependencies) |
| [`find_developer.py`](find_developer.py) | Python: find a developer with full lifecycle |
| [`roommate_search.py`](roommate_search.py) | Python: roommate search with offer + seek |

## Running

```bash
# With Bun (recommended)
bun run examples/find-developer.ts

# With ts-node / tsx
npx tsx examples/find-developer.ts

# Against local server
SCHELLING_API=http://localhost:3000 bun run examples/find-developer.ts
```

All examples default to the live API at `https://schellingprotocol.com`.

### Python

```bash
pip install requests
python3 examples/find_developer.py
python3 examples/roommate_search.py
```
