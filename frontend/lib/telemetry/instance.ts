import { sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";

// Fallback deployment identity for self-hosted usage telemetry (used as the
// PostHog distinctId only when no company email domain exists). Lives in its
// own `telemetry` schema (not public) so it stays clearly separated from
// application data and never collides with drizzle-managed tables. Created via
// boot-time DDL rather than a drizzle migration so it can't break installs that
// don't grant the app role CREATE on public, and so the OSS migration set stays
// free of telemetry concerns.
const SCHEMA = "telemetry";

// Postgres' `CREATE ... IF NOT EXISTS` emits a 42P06/42P07 NOTICE on every call
// once the object exists, which spams the logs on every boot (the steady state).
// Probe the catalog first and only issue the DDL when the object is actually
// absent — i.e. real first boot. `IF NOT EXISTS` stays as a backstop for the
// rare concurrent-first-boot race between replicas; it just won't fire (and so
// won't log) on the common path.
export const ensureTelemetrySchema = async (): Promise<void> => {
  const schemaRows = await db.execute<{ exists: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = ${SCHEMA}) AS exists`
  );
  if (!schemaRows[0]?.exists) {
    await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`));
  }

  const tableRows = await db.execute<{ exists: boolean }>(
    sql`SELECT to_regclass(${`${SCHEMA}.instance`}) IS NOT NULL AS exists`
  );
  if (!tableRows[0]?.exists) {
    await db.execute(
      sql.raw(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.instance (
          -- Singleton-row enforcement: a boolean PK that can only ever be true
          -- (CHECK (id)) means at most one row can exist. This is the deployment
          -- identity, so there must be exactly one; getInstanceId's
          -- ON CONFLICT (id) always targets that single row across racing pods.
          id boolean PRIMARY KEY DEFAULT true,
          instance_id uuid NOT NULL DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          last_reported_at timestamptz,
          CONSTRAINT instance_singleton CHECK (id)
        )
      `)
    );
  }
};

// Returns the stable anonymous id for this deployment, creating it on first
// call. Concurrent replicas race the insert; ON CONFLICT makes that safe and
// every caller converges on the same row.
export const getInstanceId = async (): Promise<string> => {
  const rows = await db.execute<{ instance_id: string }>(
    sql.raw(`
      INSERT INTO ${SCHEMA}.instance (id) VALUES (true)
      ON CONFLICT (id) DO UPDATE SET id = ${SCHEMA}.instance.id
      RETURNING instance_id
    `)
  );
  return rows[0].instance_id;
};

export interface ReportingWindowClaim {
  claimed: boolean;
  // The `last_reported_at` value before this claim overwrote it, so a failed
  // report can restore it and let the next tick retry instead of burning the
  // whole window. Null when the row had never reported.
  previousReportedAt: string | null;
}

// Atomically claims the reporting window: only the first replica to find that
// `last_reported_at` is older than `intervalMs` (or null) wins the UPDATE and
// gets a row back. Everyone else gets zero rows and skips this cycle. This is
// the cross-replica dedup — without it every frontend pod would emit its own
// heartbeat.
export const claimReportingWindow = async (intervalMs: number): Promise<ReportingWindowClaim> => {
  const intervalSeconds = Math.floor(intervalMs / 1000);
  const rows = await db.execute<{ previous_reported_at: string | null }>(
    sql`
      UPDATE ${sql.raw(SCHEMA)}.instance AS i
      SET last_reported_at = now()
      FROM (SELECT last_reported_at FROM ${sql.raw(SCHEMA)}.instance WHERE id = true) AS prev
      WHERE i.id = true
        AND (i.last_reported_at IS NULL
             OR i.last_reported_at < now() - make_interval(secs => ${intervalSeconds}))
      RETURNING prev.last_reported_at AS previous_reported_at
    `
  );
  if (rows.length === 0) {
    return { claimed: false, previousReportedAt: null };
  }
  return { claimed: true, previousReportedAt: rows[0].previous_reported_at };
};

// Restores `last_reported_at` to the value captured at claim time. Called when
// a claimed report fails, so the window is freed and the next tick retries.
export const releaseReportingWindow = async (previousReportedAt: string | null): Promise<void> => {
  if (previousReportedAt === null) {
    await db.execute(sql.raw(`UPDATE ${SCHEMA}.instance SET last_reported_at = NULL WHERE id = true`));
    return;
  }
  await db.execute(
    sql`UPDATE ${sql.raw(SCHEMA)}.instance SET last_reported_at = ${previousReportedAt} WHERE id = true`
  );
};
