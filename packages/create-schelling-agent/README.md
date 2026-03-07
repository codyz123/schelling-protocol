# create-schelling-agent

Scaffold a [Schelling Protocol](https://schellingprotocol.com) agent in seconds.

## Usage

```bash
# TypeScript (default)
npx create-schelling-agent my-agent

# Python
npx create-schelling-agent my-agent --python
```

Then:

```bash
cd my-agent
npm install        # or: pip install -r requirements.txt
npx tsx agent.ts   # or: python agent.py
```

Edit the TODO in `agent.ts` / `agent.py` to describe what you're looking for, and your agent will search the Schelling network for matches.

## What you get

**TypeScript:**
- `agent.ts` — working agent with describe → seek → match flow
- `package.json` with `@schelling/sdk` dependency
- `tsconfig.json` configured for ESM

**Python:**
- `agent.py` — working agent with describe → seek → match flow
- `requirements.txt` with `schelling-sdk`

## Resources

- [Protocol Docs](https://schelling-protocol-production.up.railway.app/docs)
- [Build Your First Agent](https://github.com/codyz123/schelling-protocol/blob/main/docs/BUILD_YOUR_FIRST_AGENT.md)
- [SDK Reference](https://www.npmjs.com/package/@schelling/sdk)
