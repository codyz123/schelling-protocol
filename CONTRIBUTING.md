# Contributing to Schelling Protocol

Thanks for your interest in contributing! Schelling Protocol is the coordination layer for AI agents — discovery, matching, negotiation, and collaboration across any domain. This guide covers everything you need to get started.

## Dev Environment Setup

**Prerequisites:** [Bun](https://bun.sh) (v1.0+), Node.js 18+, Python 3.10+ (for Python SDK work)

```bash
# Clone and install
git clone https://github.com/codyz123/schelling-protocol.git
cd schelling-protocol
bun install

# Run the server locally
bun src/index.ts --rest

# Server starts at http://localhost:3000
# Verify: curl http://localhost:3000/schelling/describe
```

## Project Structure

```
src/                    # Main server (TypeScript, Bun runtime)
  ├── core/             #   Core logic (funnel, matching, scoring)
  ├── db/               #   Database layer (SQLite/Postgres)
  ├── handlers/         #   Operation handlers (one file per operation)
  ├── transports/       #   REST, MCP transports
  ├── index.ts          #   Entry point
  ├── seed.ts           #   Database seeding
  └── types.ts          #   Type definitions
packages/
  ├── sdk/              # TypeScript SDK (@schelling/sdk)
  ├── mcp-server/       # MCP server integration
  └── python-sdk/       # Python SDK (schelling-sdk)
tests/                  # Test suite (Bun test runner)
examples/               # Runnable examples (TypeScript, Python, shell)
protocol/               # Protocol schemas and prompts
scripts/                # Automation scripts
migrations/             # Database migration files
content/                # Marketing and documentation content
```

## Running Tests

```bash
# Run the full test suite
bun test

# Run a specific test file
bun test tests/funnel.test.ts

# Smoke test (hits live or local API)
bash scripts/smoke-test.sh

# Python SDK integration tests
cd packages/python-sdk && python3 test_client.py

# TypeScript SDK integration tests
cd packages/sdk && bun test test/integration.test.ts
```

## How to Add a New Operation

Schelling Protocol operations follow a consistent handler pattern:

1. **Create a handler** in `src/handlers/<operation>.ts`:
   ```typescript
   import type { HandlerContext } from "../types";

   export function handleMyOperation(params: Record<string, unknown>, ctx: HandlerContext) {
     // Validate params
     // Implement logic using ctx.db for database access
     // Return response object
   }
   ```

2. **Register the handler** in the operation router (see existing handlers for the pattern).

3. **Add tests** in `tests/` covering the new operation.

4. **Update SDK clients** in `packages/sdk/` and `packages/python-sdk/` to expose the new operation.

5. **Add to OpenAPI spec** in `openapi.yaml` if applicable.

## PR Process

1. **Fork** the repository
2. **Branch** from `main`: `git checkout -b feat/my-feature`
3. **Implement** your changes
4. **Test** thoroughly: `bun test` must pass
5. **Commit** with a descriptive message (e.g., `feat: add batch search operation`)
6. **Push** and open a Pull Request against `main`
7. **Describe** your changes in the PR — what, why, and how to test

## Code Style

- **Language:** TypeScript, targeting the Bun runtime
- **Formatting:** Follow existing conventions in the codebase
- **Types:** Use explicit types; avoid `any` where possible
- **Naming:** `snake_case` for API fields, `camelCase` for internal TypeScript
- **Validation:** Zod for input validation
- **Dependencies:** Minimal — no external dependencies unless absolutely necessary
- **Error handling:** Throw structured errors with `code` and `message` fields

## Commit Message Format

We use conventional-ish commit messages:

- `feat: ...` — New feature
- `fix: ...` — Bug fix
- `chore: ...` — Maintenance, deps, CI
- `docs: ...` — Documentation only
- `refactor: ...` — Code restructure without behavior change
- `test: ...` — Test additions or fixes

## Protocol Changes

Changes to the protocol specification (`protocol/spec-v3.md`) require discussion first. Open an issue describing the proposed change before submitting a PR.

## Questions?

Open a [GitHub issue](https://github.com/codyz123/schelling-protocol/issues) — we're happy to help.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
