#!/usr/bin/env bash
# Publish @schelling/sdk and @schelling/mcp-server to npm
# Prerequisites: npm login (run `npm login` first)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Building @schelling/sdk ==="
cd "$ROOT/packages/sdk"
bun run build

echo "=== Building @schelling/mcp-server ==="
cd "$ROOT/packages/mcp-server"
bun run build

echo "=== Publishing @schelling/sdk ==="
cd "$ROOT/packages/sdk"
npm publish --access public

echo "=== Publishing @schelling/mcp-server ==="
cd "$ROOT/packages/mcp-server"
npm publish --access public

echo "✅ Both packages published!"
echo "Users can now:"
echo "  npm install @schelling/sdk"
echo "  npx @schelling/mcp-server"
