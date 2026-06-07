import { sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";

// Anonymous deployment identity for self-hosted usage telemetry. Lives in its
// own `telemetry` schema (not public) so it stays clearly separated from
// application data and never collides with drizzle-managed tables. Created via
// boot-time DDL rather than a drizzle migration so it can't break installs that
// don't grant the app role CREATE on public, and so the OSS migration set stays
// free of telemetry concerns.
const SCHEMA = "telemetry";

export const ensureTelemetrySchema = async (): Promise<void> => {
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`));
  await db.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.instance (
        id boolean PRIMARY KEY DEFAULT true,
        instance_id uuid NOT NULL DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        last_reported_at timestamptz,
        CONSTRAINT instance_singleton CHECK (id)
      )
    `)
  );
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

// Atomically claims the reporting window: only the first replica to find that
// `last_reported_at` is older than `intervalMs` (or null) wins the UPDATE and
// gets a row back. Everyone else gets zero rows and skips this cycle. This is
// the cross-replica dedup — without it every frontend pod would emit its own
// heartbeat.
export const claimReportingWindow = async (intervalMs: number): Promise<boolean> => {
  const intervalSeconds = Math.floor(intervalMs / 1000);
  const rows = await db.execute(
    sql.raw(`
      UPDATE ${SCHEMA}.instance
      SET last_reported_at = now()
      WHERE id = true
        AND (last_reported_at IS NULL
             OR last_reported_at < now() - interval '${intervalSeconds} seconds')
      RETURNING instance_id
    `)
  );
  return rows.length > 0;
};
