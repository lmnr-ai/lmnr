#!/usr/bin/env tsx
/**
 * ClickHouse Migrations CLI
 * 
 * Usage:
 *   pnpm ch:migrate  # Run pending migrations
 *   pnpm ch:status   # Show migration status
 */

import { config } from 'dotenv';
import { resolve, join } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const { migration } = await import('clickhouse-migrations');

  const command = process.argv[2];
  const migrationsHome = join(process.cwd(), 'lib/clickhouse/migrations');

  try {
    switch (command) {
      case 'migrate':
      case 'up':
        console.log('Running ClickHouse migrations...');
        await migration(
          migrationsHome,
          process.env.CLICKHOUSE_URL || 'http://localhost:8123',
          process.env.CLICKHOUSE_USER || 'default',
          process.env.CLICKHOUSE_PASSWORD || '',
          process.env.CLICKHOUSE_DB || 'default',
          process.env.CH_MIGRATIONS_DB_ENGINE || 'ENGINE=Atomic',
          String(Number(process.env.CH_MIGRATIONS_TIMEOUT) || 30000),
        );
        console.log('✓ Migrations completed successfully');
        break;

      case 'status':
        console.log('Migration status tracking is handled automatically by clickhouse-migrations.');
        console.log('Run "pnpm ch:migrate" to apply pending migrations.');
        break;

      default:
        console.log(`
ClickHouse Migrations CLI

Usage:
  pnpm ch:migrate     Run pending migrations
  pnpm ch:status      Show help

Or directly:
  pnpm tsx lib/clickhouse/cli.ts migrate

Environment Variables Required:
  CLICKHOUSE_URL          ClickHouse server URL (default: http://localhost:8123)
  CLICKHOUSE_USER         Database user (default: default)
  CLICKHOUSE_PASSWORD     Database password (default: '')
  CLICKHOUSE_DB           Database name (default: default)
  CH_MIGRATIONS_TIMEOUT   Request timeout in ms (default: 30000)

Migration files should be named: N_description.sql
Example: 1_initial_schema.sql, 2_add_indexes.sql

See lib/clickhouse/migrations/README.md for more details.
        `.trim());
        process.exit(command ? 1 : 0);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

