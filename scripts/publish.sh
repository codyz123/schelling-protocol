#!/bin/bash
# Publish Schelling packages to npm + submit to MCP Registry
# Prerequisites: npm adduser (one-time auth)
set -e

echo "=== Building packages ==="
cd "$(dirname "$0")/.."

echo "Building SDK..."
cd packages/sdk && bun run build && cd ../..

echo "Building MCP Server..."
cd packages/mcp-server && bun run build && cd ../..

echo ""
echo "=== Publishing to npm ==="
echo "Publishing @schelling/sdk..."
cd packages/sdk && npm publish --access public && cd ../..

echo "Publishing @schelling/mcp-server..."
cd packages/mcp-server && npm publish --access public && cd ../..

echo ""
echo "=== npm packages published! ==="
echo ""
echo "Next step: Submit to MCP Registry"
echo "Run: npx @anthropic-ai/mcp-publisher publish server.json"
echo ""
echo "Or manually submit via https://registry.modelcontextprotocol.io"
