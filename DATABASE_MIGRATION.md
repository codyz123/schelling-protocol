# Database Migration - Dual Backend Support

The Schelling Protocol server now supports both SQLite and PostgreSQL databases through a unified abstraction layer.

## Features

✅ **SQLite Support** (Production Ready)
- Default backend for local development and testing
- File-based or in-memory databases
- Synchronous operations
- WAL mode enabled for performance
- Full compatibility with existing codebase

⚠️ **PostgreSQL Support** (Experimental)
- Available for future migration
- Requires async/await refactoring for production use
- Postgres-compatible schema migrations included
- Connection pooling via postgres.js

## Environment Variables

Control which database backend to use:

```bash
# Use SQLite (default)
DB_TYPE=sqlite
DB_PATH=data/schelling.db  # Optional, defaults to data/schelling.db

# Use PostgreSQL (experimental)
DB_TYPE=postgres
DATABASE_URL=postgres://user:pass@host:port/dbname
# OR individual components:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=schelling
DB_USER=postgres
DB_PASSWORD=password
```

## Architecture

### Database Abstraction Layer

```
src/db/
├── interface.ts         # Common interface for all backends
├── factory.ts           # Database connection factory
├── sqlite-adapter.ts    # SQLite implementation
├── postgres-adapter.ts  # PostgreSQL implementation (experimental)
├── client.ts            # Legacy compatibility layer
└── schema.ts            # Schema initialization
```

### Migration System

```
migrations/
├── 001_initial_schema_sqlite.sql    # SQLite-compatible schema
└── 001_initial_schema_postgres.sql  # PostgreSQL-compatible schema
```

## Usage

### Default (SQLite)

No changes required - the system defaults to SQLite and maintains backward compatibility.

```typescript
import { getDatabase } from "./src/db/client.js";

const db = getDatabase(); // Returns SQLite connection
```

### PostgreSQL (Experimental)

Set the environment variable:

```bash
export DB_TYPE=postgres
export DATABASE_URL=postgres://user:pass@host:port/schelling
```

**Note:** PostgreSQL support is experimental because the current codebase uses synchronous database operations, but postgres.js requires async/await. For production PostgreSQL usage, the handlers would need to be refactored to support async operations.

## Migration Process

### SQLite to PostgreSQL Migration (Future)

1. **Setup PostgreSQL database:**
   ```sql
   CREATE DATABASE schelling;
   ```

2. **Run migration:**
   ```bash
   psql -d schelling -f migrations/001_initial_schema_postgres.sql
   ```

3. **Export SQLite data (if needed):**
   ```bash
   # This would require custom migration scripts
   # Not implemented in this version
   ```

4. **Switch environment:**
   ```bash
   export DB_TYPE=postgres
   export DATABASE_URL=postgres://user:pass@host:port/schelling
   ```

## Schema Differences

### SQLite vs PostgreSQL

| Feature | SQLite | PostgreSQL |
|---------|--------|------------|
| Timestamps | `TEXT DEFAULT (datetime('now'))` | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP` |
| UUID Extension | Not needed | `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` |
| Triggers | SQLite syntax | PostgreSQL function + trigger |
| Foreign Keys | `PRAGMA foreign_keys = ON` | Built-in support |

## Testing

All existing tests continue to pass with SQLite:

```bash
bun test  # Uses SQLite by default
```

For PostgreSQL testing (when async support is added):

```bash
DB_TYPE=postgres DATABASE_URL=postgres://... bun test
```

## Performance Considerations

### SQLite
- WAL mode for better concurrency
- File-based persistence
- Single-writer, multiple-reader
- Perfect for development and moderate production loads

### PostgreSQL
- Connection pooling (20 connections)
- Full ACID compliance
- Multi-user concurrency
- Better for high-scale production deployments

## Limitations

### Current PostgreSQL Limitations

⚠️ **The PostgreSQL adapter is experimental** because:

1. **Sync/Async Mismatch:** The codebase expects synchronous database operations (`.get()`, `.all()`, `.run()`), but postgres.js is async-only.

2. **Handler Refactoring Required:** To use PostgreSQL in production, all handlers would need to be refactored to use `async/await`.

3. **Transaction Support:** PostgreSQL transactions require async support for proper ACID compliance.

### Recommended Migration Path for PostgreSQL

1. **Phase 1** (Current): Use SQLite for all deployments
2. **Phase 2** (Future): Refactor handlers to async/await
3. **Phase 3** (Future): Enable full PostgreSQL support
4. **Phase 4** (Future): Migration tooling for data transfer

## Backward Compatibility

✅ **100% Backward Compatible**
- All existing code continues to work
- SQLite remains the default
- No breaking changes to the API
- Existing tests pass without modification

## Contributing

When adding new database operations:

1. Use the `DatabaseConnection` interface
2. Test with both SQLite (required) and PostgreSQL (when async support is added)
3. Update migration scripts in both `sqlite` and `postgres` versions
4. Follow the existing pattern for prepared statements

## Future Work

- [ ] Async/await refactoring for PostgreSQL support
- [ ] Migration tooling for SQLite → PostgreSQL data transfer
- [ ] Connection pooling optimization
- [ ] Database metrics and monitoring
- [ ] Read replica support for PostgreSQL