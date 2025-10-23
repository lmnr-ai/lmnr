# ClickHouse Migrations

This directory contains ClickHouse database migrations managed by the [`clickhouse-migrations`](https://github.com/VVVi/clickhouse-migrations) package.

## Naming Convention

Migration files must follow this format: `N_description.sql` where:
- `N` is an incrementing version number (1, 2, 3, etc.)
- `_` is the separator
- `description` is a brief description of the migration
- `.sql` is the file extension

Examples:
- `1_initial_schema.sql`
- `2_add_user_fields.sql`
- `10_create_indexes.sql`

## Migration Content

- Use valid ClickHouse SQL queries
- Multiple queries can be in a single file, separated by semicolons (`;`)
- Use idempotent operations when possible:
  - `CREATE TABLE IF NOT EXISTS ...`
  - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
  - `DROP VIEW IF EXISTS ...`
- Comments can be added using `--`, `#`, or `#!`
- ClickHouse settings can be included: `SET allow_experimental_json_type = 1;`

## Important Rules

⚠️ **Once a migration has been applied to the database, it MUST NOT be modified or removed.**

If you need to make changes:
1. Create a new migration with the changes
2. Never edit existing migration files

## Running Migrations

### Via NPM Scripts

```bash
# Run pending migrations
pnpm ch:migrate

# Check migration status
pnpm ch:status
```

### Via CLI

```bash
# Run migrations
pnpm tsx lib/clickhouse/cli.ts migrate

# Check status
pnpm tsx lib/clickhouse/cli.ts status
```

### Environment Variables

Required environment variables:
- `CLICKHOUSE_URL` - ClickHouse server URL (e.g., `http://localhost:8123`)
- `CLICKHOUSE_USER` - Database user
- `CLICKHOUSE_PASSWORD` - Database password

Optional:
- `CLICKHOUSE_DB` - Database name (defaults to `default`)
- `CH_MIGRATIONS_TIMEOUT` - Request timeout in milliseconds (default: 30000)

## Migration History

Migrations are tracked in the `schema_migrations` table in ClickHouse, which stores:
- Migration version
- Migration name
- Applied timestamp
- Execution time

## Original Migrations

The `orig/` directory contains the original migration files before they were squashed. These are kept for historical reference only and are not executed.

## Example Migration

```sql
-- 1_initial_schema.sql

SET allow_experimental_json_type = 1;

CREATE TABLE IF NOT EXISTS events (
  timestamp DateTime('UTC'),
  session_id UInt64,
  event JSON
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (session_id, timestamp)
SETTINGS index_granularity = 8192;

-- Add index
ALTER TABLE events ADD INDEX IF NOT EXISTS session_idx session_id TYPE minmax GRANULARITY 4;
```
