#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

const args = process.argv.slice(2);
const projectName = args[0] || 'my-schelling-agent';
const template = args.includes('--python') ? 'python' : 'typescript';

const projectDir = join(process.cwd(), projectName);

if (existsSync(projectDir)) {
  console.error(`\x1b[31m✗\x1b[0m Directory "${projectName}" already exists`);
  process.exit(1);
}

console.log(`\n  \x1b[35m◉\x1b[0m  Schelling Protocol — Agent Scaffolder\n`);
console.log(`  Creating ${template} agent in \x1b[36m${projectName}/\x1b[0m\n`);

mkdirSync(projectDir, { recursive: true });

if (template === 'typescript') {
  writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
    name: projectName,
    version: '0.1.0',
    type: 'module',
    scripts: {
      start: 'node --loader ts-node/esm agent.ts',
      dev: 'npx tsx watch agent.ts'
    },
    dependencies: {
      '@schelling/sdk': '^3.0.0'
    },
    devDependencies: {
      'tsx': '^4.0.0',
      'typescript': '^5.0.0'
    }
  }, null, 2) + '\n');

  writeFileSync(join(projectDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      outDir: 'dist'
    },
    include: ['*.ts']
  }, null, 2) + '\n');

  writeFileSync(join(projectDir, 'agent.ts'), `import { Schelling } from '@schelling/sdk';

const SERVER = process.env.SCHELLING_SERVER || 'https://www.schellingprotocol.com';
const client = new Schelling(SERVER);

async function main() {
  // Step 1: Describe the network
  const info = await client.describe();
  console.log('Connected to', info.protocol.name, 'v' + info.protocol.version);
  console.log('Active clusters:', info.clusters.total_active);

  // Step 2: Register what you're looking for
  const seek = await client.seek('TODO: describe what you need');
  console.log('\\nFound', seek.candidates.length, 'candidates:');
  for (const c of seek.candidates) {
    console.log(\`  - \${c.display_name} (score: \${c.match_score})\`);
  }

  // Step 3: Express interest in top match
  if (seek.candidates.length > 0) {
    const top = seek.candidates[0];
    console.log(\`\\nTop match: \${top.display_name}\`);
    // Uncomment to express interest:
    // const interest = await client.propose(seek.user_token, top.candidate_id);
    // console.log('Interest expressed:', interest);
  }
}

main().catch(console.error);
`);

  writeFileSync(join(projectDir, '.env.example'), `# Schelling Protocol configuration
SCHELLING_SERVER=https://www.schellingprotocol.com
`);

  writeFileSync(join(projectDir, '.gitignore'), `node_modules/
dist/
.env
`);

  writeFileSync(join(projectDir, 'README.md'), `# ${projectName}

A [Schelling Protocol](https://schellingprotocol.com) agent.

## Quick Start

\`\`\`bash
npm install
npx tsx agent.ts
\`\`\`

## What this does

1. Connects to the Schelling network
2. Searches for candidates matching your intent
3. Displays ranked matches with scores

Edit \`agent.ts\` to customize your agent's behavior.

## Resources

- [Protocol Docs](https://www.schellingprotocol.com/docs)
- [SDK Reference](https://www.npmjs.com/package/@schelling/sdk)
- [Build Your First Agent](https://github.com/codyz123/schelling-protocol/blob/main/docs/BUILD_YOUR_FIRST_AGENT.md)
- [Integration Scenarios](https://github.com/codyz123/schelling-protocol/blob/main/docs/INTEGRATION_SCENARIOS.md)
`);

} else {
  // Python template
  writeFileSync(join(projectDir, 'requirements.txt'), `schelling-sdk>=3.0.0
`);

  writeFileSync(join(projectDir, 'agent.py'), `"""Schelling Protocol agent template."""
import os
from schelling_sdk import SchellingClient

SERVER = os.getenv("SCHELLING_SERVER", "https://www.schellingprotocol.com")
client = SchellingClient(SERVER)

def main():
    # Step 1: Describe the network
    info = client.describe()
    print(f"Connected to {info['protocol']['name']} v{info['protocol']['version']}")

    # Step 2: Search for what you need
    result = client.quick_seek("TODO: describe what you need")
    print(f"\\nFound {len(result.get('candidates', []))} candidates:")
    for c in result.get("candidates", []):
        print(f"  - {c['display_name']} (score: {c['match_score']})")

    # Step 3: Express interest in top match
    candidates = result.get("candidates", [])
    if candidates:
        top = candidates[0]
        print(f"\\nTop match: {top['display_name']}")
        # Uncomment to express interest:
        # interest = client.propose(result["user_token"], top["candidate_id"])

if __name__ == "__main__":
    main()
`);

  writeFileSync(join(projectDir, '.env.example'), `# Schelling Protocol configuration
SCHELLING_SERVER=https://www.schellingprotocol.com
`);

  writeFileSync(join(projectDir, '.gitignore'), `__pycache__/
*.pyc
.env
venv/
`);

  writeFileSync(join(projectDir, 'README.md'), `# ${projectName}

A [Schelling Protocol](https://schellingprotocol.com) agent.

## Quick Start

\`\`\`bash
pip install -r requirements.txt
python agent.py
\`\`\`

## Resources

- [Protocol Docs](https://www.schellingprotocol.com/docs)
- [Build Your First Agent](https://github.com/codyz123/schelling-protocol/blob/main/docs/BUILD_YOUR_FIRST_AGENT.md)
`);
}

console.log(`  \x1b[32m✓\x1b[0m Created ${template} agent scaffold\n`);
console.log(`  Next steps:\n`);
if (template === 'typescript') {
  console.log(`    cd ${projectName}`);
  console.log(`    npm install`);
  console.log(`    # Edit agent.ts — change the TODO to your intent`);
  console.log(`    npx tsx agent.ts\n`);
} else {
  console.log(`    cd ${projectName}`);
  console.log(`    pip install -r requirements.txt`);
  console.log(`    # Edit agent.py — change the TODO to your intent`);
  console.log(`    python agent.py\n`);
}
console.log(`  Docs: https://github.com/codyz123/schelling-protocol`);
console.log(`  API:  https://www.schellingprotocol.com/docs\n`);
