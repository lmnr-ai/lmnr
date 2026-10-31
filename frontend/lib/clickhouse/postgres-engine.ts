import type { ClickHouseClient } from "@clickhouse/client";
import { sql } from "drizzle-orm";

import { db, getDatabaseConfig, getPostgresSchema } from "@/lib/db/drizzle";

/**
 * Boot wiring for the `pg` ClickHouse database, the dictionaries over it, and the
 * Postgres role behind it. Nothing here may throw — `instrumentation.ts` awaits every export
 * unguarded, and an unreachable Postgres must cost these three tables, not the
 * whole frontend. See `docs/internal/sql-query-engine.md`.
 */

/** Must match the `signals_v0` / `evaluations_v0` / `datasets_v0` views (CH migration 73), `dashboards_v0` / `dashboard_charts_v0` (78), `alerts_v0` / `alert_targets_v0` / `alert_filters_v0` (81), and the dict sources below. `project_id` is granted to filter and key on, never exposed. */
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
  evaluations: ["id", "project_id", "name", "group_id", "metadata", "created_at"],
  datasets: ["id", "project_id", "name", "indexed_on", "created_at"],
  dashboards: ["id", "project_id", "name", "created_at"],
  dashboard_charts: ["id", "project_id", "dashboard_id", "name", "query", "settings", "created_at"],
  alerts: ["id", "project_id", "name", "type", "source_id", "metadata", "created_at"],
  alert_targets: ["id", "project_id", "alert_id", "type", "channel_id", "channel_name", "email", "created_at"],
  alert_filters: ["id", "project_id", "alert_id", "value", "created_at"],
};

/** Attributes resolved by `dictGetOrDefault` in the `_v0` views of CH migration 73, keyed by `(project_id, id)`. */
const PG_ENTITY_DICTS: Record<string, string[]> = {
  signals: ["name"],
  evaluations: ["name", "group_id"],
  datasets: ["name"],
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
  // No defaults: a well-known login on a published Postgres port would be one
  // nobody chose. Unset leaves SQL access to Postgres entities off.
  const user = process.env.CLICKHOUSE_POSTGRES_USER?.trim();
  const password = process.env.CLICKHOUSE_POSTGRES_PASSWORD?.trim();
  if (!user || !password) {
    throw new Error(
      "CLICKHOUSE_POSTGRES_USER and CLICKHOUSE_POSTGRES_PASSWORD are not set (see README, SQL access to Postgres entities)"
    );
  }
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
    user,
    password,
    schema: envOr("CLICKHOUSE_POSTGRES_SCHEMA", getPostgresSchema() || "public"),
    statementTimeout: envOr("CLICKHOUSE_POSTGRES_STATEMENT_TIMEOUT", "15s"),
    connectionLimit,
  };
}

const pgStr = (value: string) => `'${value.replace(/'/g, "''")}'`;
const pgIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;
const chStr = (value: string) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function tryGetConfig(context: string): ReturnType<typeof getConfig> | null {
  try {
    return getConfig();
  } catch (error) {
    warnFailure(context, error);
    return null;
  }
}

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

const privilegedRoleMessage = (user: string) =>
  `CLICKHOUSE_POSTGRES_USER=${user} is the app's own or a privileged role; use a dedicated one`;

/**
 * Role setup configures new roles (password, connection limit, timeout) and the
 * `pg` engine reads as it, so it must never be the app's own or a privileged role.
 * Throws only when the check itself fails.
 */
async function getPostgresRoleState(user: string): Promise<{ dedicated: boolean; exists: boolean }> {
  const [existing] = await db.execute<{ privileged: boolean }>(
    sql`SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolname = current_user AS privileged
        FROM pg_roles WHERE rolname = ${user}`
  );
  return {
    dedicated: !existing?.privileged && user !== getDatabaseConfig().username,
    exists: existing !== undefined,
  };
}

/** `statement_timeout` and `CONNECTION LIMIT` are the load guards — user SQL reaches the primary, not a replica. */
export async function ensurePostgresReadonlyRole(): Promise<void> {
  const cfg = tryGetConfig("Skipped provisioning the ClickHouse Postgres role");
  if (!cfg) {
    return;
  }
  const role = pgIdent(cfg.user);
  const schema = pgIdent(cfg.schema);

  let roleExists: boolean;
  try {
    const state = await getPostgresRoleState(cfg.user);
    roleExists = state.exists;
    if (!state.dedicated) {
      warnFailure("Skipped provisioning the ClickHouse Postgres role", privilegedRoleMessage(cfg.user));
      return;
    }
  } catch (error) {
    warnFailure("Skipped provisioning the ClickHouse Postgres role", error);
    return;
  }

  // Existing logins may be managed by infrastructure, including password rotation.
  if (!roleExists) {
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
    await tryExec(
      `granting CONNECT on ${cfg.database}`,
      `GRANT CONNECT ON DATABASE ${pgIdent(cfg.database)} TO ${role}`
    );
  }
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

async function dropPgDatabase(clickhouseClient: ClickHouseClient): Promise<void> {
  try {
    await clickhouseClient.command({ query: "DROP DATABASE IF EXISTS pg SYNC" });
  } catch (error) {
    warnFailure("Could not drop the ClickHouse `pg` database", error);
  }
}

/**
 * Host/port are from the ClickHouse server's perspective (`postgres:5432` under
 * compose, not the host's localhost:5433). Recreated on every boot so it always
 * carries the configured password, including externally managed rotations; it stores nothing.
 *
 * Migration 73 survives a failure here — ClickHouse does not resolve a view's
 * source database at `CREATE VIEW` time. Never logs the statement: the engine
 * parameters carry the role password.
 */
export async function ensureClickhousePostgresDatabase(clickhouseClient: ClickHouseClient): Promise<void> {
  // Unset credentials turn `pg` off.
  const cfg = tryGetConfig("Turning off the ClickHouse `pg` database");
  if (!cfg) {
    await dropPgDatabase(clickhouseClient);
    return;
  }

  // So does a refused role. A check that merely failed keeps the existing `pg`.
  try {
    if (!(await getPostgresRoleState(cfg.user)).dedicated) {
      warnFailure("Turning off the ClickHouse `pg` database", privilegedRoleMessage(cfg.user));
      await dropPgDatabase(clickhouseClient);
      return;
    }
  } catch (error) {
    warnFailure("Kept the existing ClickHouse `pg` database; could not check CLICKHOUSE_POSTGRES_USER", error);
    return;
  }

  try {
    await clickhouseClient.command({ query: "DROP DATABASE IF EXISTS pg SYNC" });
    await clickhouseClient.command({
      query: `
        CREATE DATABASE pg
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
      "Skipped creating the ClickHouse `pg` database; SQL queries reading signals or entity names will fail",
      error
    );
  }
}

/**
 * Cache-layout dicts: a dictGet fetches only the keys it misses from Postgres
 * (`WHERE (project_id, id) IN (...)`, pushed through `pg`), and each key stays
 * valid for LIFETIME. Postgres is never read unless a query selects a name
 * column, so a missing `pg` fails only those queries. Cloud creates these by
 * hand (LOCAL_DB is off).
 */
export async function ensurePgEntityDicts(clickhouseClient: ClickHouseClient): Promise<void> {
  const user = process.env.CLICKHOUSE_USER || "ch_user";
  const password = process.env.CLICKHOUSE_PASSWORD || "ch_passwd";

  for (const [table, attributes] of Object.entries(PG_ENTITY_DICTS)) {
    try {
      await clickhouseClient.command({
        query: `
          CREATE OR REPLACE DICTIONARY ${table}_dict
          (
            project_id UUID,
            id UUID,
            ${attributes.map((attribute) => `${attribute} String`).join(",\n            ")}
          )
          PRIMARY KEY project_id, id
          SOURCE(CLICKHOUSE(
            USER ${chStr(user)}
            PASSWORD ${chStr(password)}
            DB 'pg'
            TABLE ${chStr(table)}
          ))
          LAYOUT(COMPLEX_KEY_CACHE(SIZE_IN_CELLS 100000))
          LIFETIME(MIN 30 MAX 60)
        `,
      });
    } catch (error) {
      warnFailure(`Skipped creating ${table}_dict; SQL queries reading ${table} names will fail`, error);
    }
  }
}

/**
 * Second layer behind the query-engine validator, on the user the query API
 * connects as: no off-box table functions, and no read on `pg`, which mirrors the
 * whole Postgres schema. `signals_v0` is `SQL SECURITY DEFINER` and the entity
 * dicts load as the admin user, so the views in `default` are the only route to
 * the entity data.
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
    `GRANT dictGet ON default.* TO ${user}`,
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
