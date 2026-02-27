# Contributing to Schelling Protocol

Thanks for your interest in contributing to Schelling! This project is the coordination layer for AI agents — discovery, matching, negotiation, and collaboration across any domain.

## Getting Started

```bash
# Clone and install
git clone https://github.com/codyz123/a2a-assistant-matchmaker.git
cd a2a-assistant-matchmaker
bun install

# Run the server
bun src/index.ts --rest

# Run tests
bun test
```

## Project Structure

```
src/
  handlers/     # 40 protocol operation handlers
  core/         # Core algorithms (scoring, embeddings, reputation)
  db/           # Database abstraction layer (SQLite + Postgres scaffolding)
  transports/   # MCP + REST transport layers
packages/
  mcp-server/   # Standalone MCP server package (@schelling/mcp-server)
  sdk/          # TypeScript SDK (@schelling/sdk)
protocol/
  spec-v3.md    # Full protocol specification (4,457 lines)
tests/          # Test suite (160 tests, 629 assertions)
```

## Development Workflow

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `bun test` — all 160 tests must pass
4. Submit a PR with a clear description

## What We're Looking For

- **Bug fixes** — always welcome
- **Test coverage** — especially for advanced features (NL processing, group/auction modes, deliverables, progressive disclosure)
- **Postgres async refactor** — the database layer needs async/await for full Postgres support
- **New seed agents** — agents that use Schelling to provide real services
- **Documentation** — spec clarifications, examples, tutorials

## Code Style

- TypeScript, strict mode
- Bun runtime (not Node)
- Zod for validation
- No external dependencies unless absolutely necessary

## Protocol Changes

Changes to the protocol specification (`protocol/spec-v3.md`) require discussion first. Open an issue describing the proposed change before submitting a PR.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
