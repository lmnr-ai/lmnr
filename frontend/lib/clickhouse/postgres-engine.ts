import type { ClickHouseClient } from "@clickhouse/client";

import { db, getDatabaseConfig, getPostgresSchema } from "@/lib/db/drizzle";

/**
 * Boot wiring for the `pg` ClickHouse database and the Postgres role behind it.
 * Nothing here may throw — `instrumentation.ts` awaits all three exports
 * unguarded, and an unreachable Postgres must cost these three tables, not the
 * whole frontend. See `docs/internal/sql-query-engine.md`.
 */

/** Must match the `_v0` SELECT lists in CH migration 67. `project_id` is granted for those views to filter on, never selected. */
const PG_ENTITY_COLUMNS: Record<string, string[]> = {
  signals: [
    "id",
    "project_id",
    "name",
    "prompt",
    "structured_output_schema",
    "metadata",
    "llm_model",
    "created_at",
    "version",
  ],
  evaluations: ["id", "project_id", "name", "group_id", "created_at"],
  datasets: ["id", "project_id", "name", "created_at"],
};

const identRe = /^[A-Za-z_][A-Za-z0-9_]*$/;

function requireIdent(value: string, name: string): string {
  if (!identRe.test(value)) {
    throw new Error(`${name} must be a simple identifier, got: ${JSON.stringify(value)}`);
  }
  return value;
}

const envOr = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

function getConfig() {
  const connectionLimit = Number(envOr("CLICKHOUSE_POSTGRES_CONNECTION_LIMIT", "10"));
  if (!Number.isInteger(connectionLimit) || connectionLimit < 1) {
    throw new Error("CLICKHOUSE_POSTGRES_CONNECTION_LIMIT must be a positive integer");
  }
  const port = envOr("CLICKHOUSE_POSTGRES_PORT", "5432");
  if (!/^\d+$/.test(port)) {
    throw new Error(`CLICKHOUSE_POSTGRES_PORT must be a number, got: ${JSON.stringify(port)}`);
  }
  return {
    host: envOr("CLICKHOUSE_POSTGRES_HOST", "postgres"),
    port,
    // Not `POSTGRES_DB` — it is compose-only, and guessing `postgres` elsewhere
    // connects to the maintenance db and reports the tables as merely missing.
    database: envOr("CLICKHOUSE_POSTGRES_DATABASE", getDatabaseConfig().database || "postgres"),
    // Unchecked on purpose: quoted at every use, and a hyphenated schema is legal.
    user: envOr("CLICKHOUSE_POSTGRES_USER", "clickhouse_ro"),
    password: envOr("CLICKHOUSE_POSTGRES_PASSWORD", "clickhouse_ro_passwordabc"),
    schema: envOr("CLICKHOUSE_POSTGRES_SCHEMA", getPostgresSchema() || "public"),
    statementTimeout: envOr("CLICKHOUSE_POSTGRES_STATEMENT_TIMEOUT", "15s"),
    connectionLimit,
  };
}

const pgStr = (value: string) => `'${value.replace(/'/g, "''")}'`;
const pgIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;
const chStr = (value: string) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function warnFailure(context: string, error: unknown): void {
  console.warn(`${context}:`, error instanceof Error ? error.message : String(error));
}

/** Logs `what`, never the statement — two of these carry the role password. */
async function tryExec(what: string, query: string): Promise<void> {
  try {
    await db.execute(query);
  } catch (error) {
    warnFailure(`Skipped ${what}`, error);
  }
}

/** `statement_timeout` and `CONNECTION LIMIT` are the load guards — user SQL reaches the primary, not a replica. */
export async function ensurePostgresReadonlyRole(): Promise<void> {
  let cfg: ReturnType<typeof getConfig>;
  try {
    cfg = getConfig();
  } catch (error) {
    warnFailure("Skipped provisioning the ClickHouse Postgres role", error);
    return;
  }
  const role = pgIdent(cfg.user);
  const schema = pgIdent(cfg.schema);

  await tryExec(
    `creating role ${cfg.user}`,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${pgStr(cfg.user)}) THEN
          CREATE ROLE ${role} LOGIN PASSWORD ${pgStr(cfg.password)};
        END IF;
      END
      $$
    `
  );
  await tryExec("setting the role password", `ALTER ROLE ${role} LOGIN PASSWORD ${pgStr(cfg.password)}`);
  await tryExec(
    `setting statement_timeout = ${cfg.statementTimeout}`,
    `ALTER ROLE ${role} SET statement_timeout = ${pgStr(cfg.statementTimeout)}`
  );
  await tryExec(
    `setting the connection limit to ${cfg.connectionLimit}`,
    `ALTER ROLE ${role} CONNECTION LIMIT ${cfg.connectionLimit}`
  );
  await tryExec(`granting CONNECT on ${cfg.database}`, `GRANT CONNECT ON DATABASE ${pgIdent(cfg.database)} TO ${role}`);
  await tryExec(`granting USAGE on schema ${cfg.schema}`, `GRANT USAGE ON SCHEMA ${schema} TO ${role}`);

  for (const [table, columns] of Object.entries(PG_ENTITY_COLUMNS)) {
    const qualified = `${schema}.${pgIdent(table)}`;
    try {
      await db.execute(`GRANT SELECT (${columns.map(pgIdent).join(", ")}) ON ${qualified} TO ${role}`);
      // `evaluations` has RLS on, which denies every row to a non-owner until a
      // policy admits it. Inert on the tables without RLS.
      await db.execute(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT FROM pg_policies
            WHERE schemaname = ${pgStr(cfg.schema)}
              AND tablename = ${pgStr(table)}
              AND policyname = 'clickhouse_ro_select'
          ) THEN
            CREATE POLICY clickhouse_ro_select ON ${qualified} FOR SELECT TO ${role} USING (true);
          END IF;
        END
        $$
      `);
    } catch (error) {
      warnFailure(`${table} is not readable by ${cfg.user}, so SQL queries against it will return no rows`, error);
    }
  }
}

/**
 * Host/port are from the ClickHouse server's perspective (`postgres:5432` under
 * compose, not the host's localhost:5433). `IF NOT EXISTS`, so rotate
 * credentials by dropping the database rather than by restarting.
 *
 * Migration 67 survives a failure here — ClickHouse does not resolve a view's
 * source database at `CREATE VIEW` time. Never logs the statement: the engine
 * parameters carry the role password.
 */
export async function ensureClickhousePostgresDatabase(clickhouseClient: ClickHouseClient): Promise<void> {
  try {
    const cfg = getConfig();

    await clickhouseClient.command({
      query: `
        CREATE DATABASE IF NOT EXISTS pg
        ENGINE = PostgreSQL(
          ${chStr(`${cfg.host}:${cfg.port}`)},
          ${chStr(cfg.database)},
          ${chStr(cfg.user)},
          ${chStr(cfg.password)},
          ${chStr(cfg.schema)}
        )
      `,
    });
  } catch (error) {
    warnFailure(
      "Skipped creating the ClickHouse `pg` database; SQL queries against signals/evaluations/datasets will fail",
      error
    );
  }
}

/**
 * Second layer behind the query-engine validator, on the user the query API
 * connects as: no off-box table functions, and no read on `pg`, which mirrors the
 * whole Postgres schema. Migration 67's views are `SQL SECURITY DEFINER`, so
 * `SELECT ON default.*` is the only route to the entity data.
 */
export async function ensureClickhouseReadonlyGrants(clickhouseClient: ClickHouseClient): Promise<void> {
  const roUser = process.env.CLICKHOUSE_RO_USER?.trim();
  const adminUser = process.env.CLICKHOUSE_USER?.trim() || "ch_user";
  if (!roUser) {
    return;
  }
  if (roUser === adminUser) {
    console.warn(
      "CLICKHOUSE_RO_USER equals CLICKHOUSE_USER; skipping source-privilege revoke. Use a dedicated read-only ClickHouse user in production."
    );
    return;
  }
  // The one value interpolated into SQL unquoted, so it stays validated — and it
  // is the checked copy, never the raw env string, that reaches the SQL below.
  let user: string;
  try {
    user = requireIdent(roUser, "CLICKHOUSE_RO_USER");
  } catch (error) {
    warnFailure("Skipped ClickHouse read-only hardening", error);
    return;
  }

  for (const query of [
    `GRANT SELECT ON default.* TO ${user}`,
    `REVOKE SOURCES, POSTGRES, S3, URL, REMOTE, FILE ON *.* FROM ${user}`,
    `REVOKE ALL ON pg.* FROM ${user}`,
  ]) {
    try {
      await clickhouseClient.command({ query });
    } catch (error) {
      warnFailure(`ClickHouse grant/revoke failed \`${query}\``, error);
    }
  }
}
