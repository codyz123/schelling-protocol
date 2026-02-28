#!/bin/bash
# Wrapper to launch the Schelling MCP server with correct cwd
cd /Users/codyz/Documents/a2a-assistant-matchmaker
exec bun run src/index.ts
