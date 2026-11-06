import { and, eq } from "drizzle-orm";

import { cache } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { acquireBackfillLock } from "@/lib/clickhouse/scripts/backfill-lock";
import { db } from "@/lib/db/drizzle";
import { signals } from "@/lib/db/migrations/schema";
// Copies the history of signal_events from the plain MergeTree table that
// migration 83 renamed to old_signal_events into the new ReplacingMergeTree
// signal_events (LAM-2490), then renames the source to old_signal_events_copied.
// Fire-and-forget on frontend boot. Silent once old_signal_events is gone; the
// table itself is the progress record, because `cache` is per-process memory
// when REDIS_URL is unset.
//
// Until it finishes, reads see new events but only part of the history. Writers
// already target the new table, so nothing has to be caught up afterwards.
//
// Cloud: do NOT rely on this (migrations and boot scripts are off there). By hand:
//   1. Apply migration 83 (rename, create, views). Old app-servers keep working
//      on the new table: their inserts name columns, and DELETE works on RMT.
//   2. Deploy the app-server that reads with FINAL.
//   3. Copy per project (or per signal on large projects), skipping signals
//      deleted from Postgres since the rename:
//      INSERT INTO signal_events (<COLUMNS>, updated_at)
//      SELECT <COLUMNS>, timestamp FROM old_signal_events
//      PREWHERE project_id = {projectId:UUID} AND signal_id IN {signalIds:Array(UUID)};
//   4. RENAME TABLE old_signal_events TO old_signal_events_copied; once
//      verified, DROP TABLE old_signal_events_copied. Nothing here drops it.

const LOG = "[signal-events-copy]";
const LOCK_KEY = "signal_events_copy_lock";
const STATUS_KEY = "signal_events_copy_status";

const SOURCE = "old_signal_events";
const TARGET = "signal_events";
// Where the source goes once copied; never dropped here.
const COPIED = "old_signal_events_copied";

// `updated_at` is set to the event's `timestamp`, so a replayed copy writes the
// same key and version and ReplacingMergeTree collapses it. `is_deleted`
// defaults to 0.
const COLUMNS = `id, project_id, signal_id, trace_id, run_id, name, payload, timestamp,
  summary, severity, signal_version, summaries`;

interface CopyStatus {
  // Best-effort resume point; replaying a project is harmless.
  copiedProjects: string[];
  at: string;
}

const ch = () => clickhouseClient;

const tableExists = async (table: string): Promise<boolean> => {
  const rs = await ch().query({
    query: `SELECT count() AS c FROM system.tables WHERE database = currentDatabase() AND name = {table:String}`,
    query_params: { table },
    format: "JSONEachRow",
  });
  const rows = await rs.json<{ c: string | number }>();
  return Number(rows[0]?.c ?? 0) > 0;
};

const sourceProjectIds = async (): Promise<string[]> => {
  const rs = await ch().query({
    query: `SELECT DISTINCT project_id AS id FROM ${SOURCE}`,
    format: "JSONEachRow",
  });
  const rows = await rs.json<{ id: string }>();
  return rows.map((r) => r.id);
};

const sourceSignalIds = async (projectId: string): Promise<string[]> => {
  const rs = await ch().query({
    query: `SELECT DISTINCT signal_id AS id FROM ${SOURCE} PREWHERE project_id = {projectId:UUID}`,
    query_params: { projectId },
    format: "JSONEachRow",
  });
  const rows = await rs.json<{ id: string }>();
  return rows.map((r) => r.id);
};

// A signal deleted after the rename only had its events purged from the new
// table, so its old rows must not be copied back.
const signalExists = async (projectId: string, signalId: string): Promise<boolean> => {
  const rows = await db
    .select({ id: signals.id })
    .from(signals)
    .where(and(eq(signals.projectId, projectId), eq(signals.id, signalId)))
    .limit(1);
  return rows.length > 0;
};

// One signal per statement keeps each INSERT bounded on large projects.
const copySignal = async (projectId: string, signalId: string): Promise<number> => {
  const result = await ch().command({
    query: `
      INSERT INTO ${TARGET} (${COLUMNS}, updated_at)
      SELECT ${COLUMNS}, timestamp
      FROM ${SOURCE}
      PREWHERE project_id = {projectId:UUID} AND signal_id = {signalId:UUID}
    `,
    query_params: { projectId, signalId },
    clickhouse_settings: { async_insert: 0 },
  });
  return Number(result.summary?.written_rows ?? 0);
};

const purgeSignal = async (projectId: string, signalId: string): Promise<void> => {
  await ch().command({
    query: `DELETE FROM ${TARGET} WHERE project_id = {projectId:UUID} AND signal_id = {signalId:UUID}`,
    query_params: { projectId, signalId },
  });
};

// Signal deletion commits the Postgres delete BEFORE its ClickHouse purge, so
// re-checking Postgres after the (synchronous) INSERT covers a deletion racing
// the copy: either the check sees it and purges here, or the deletion's own
// purge runs after this INSERT landed and removes the copied rows.
const copyLiveSignal = async (projectId: string, signalId: string): Promise<number> => {
  if (!(await signalExists(projectId, signalId))) return 0;
  const n = await copySignal(projectId, signalId);
  if (await signalExists(projectId, signalId)) return n;
  await purgeSignal(projectId, signalId);
  return 0;
};

const readStatus = async (): Promise<CopyStatus | null> => {
  try {
    return await cache.get<CopyStatus>(STATUS_KEY);
  } catch (error) {
    console.error(`${LOG} could not read the saved status`, error);
    return null;
  }
};

const writeStatus = async (status: CopyStatus): Promise<void> => {
  try {
    await cache.set(STATUS_KEY, status);
  } catch (error) {
    console.error(`${LOG} could not save the status; the next boot copies those projects again`, error);
  }
};

// False when the lease was lost mid-walk.
const runCopy = async (status: CopyStatus | null, lostLease: () => boolean): Promise<boolean> => {
  const copied = new Set(status?.copiedProjects ?? []);
  let n = 0;
  for (const projectId of await sourceProjectIds()) {
    if (copied.has(projectId)) continue;
    for (const signalId of await sourceSignalIds(projectId)) {
      if (lostLease()) return false;
      n += await copyLiveSignal(projectId, signalId);
    }
    copied.add(projectId);
    if (lostLease()) return false;
    await writeStatus({ copiedProjects: [...copied], at: new Date().toISOString() });
  }
  if (lostLease()) return false;
  await ch().command({ query: `RENAME TABLE ${SOURCE} TO ${COPIED}` });
  console.log(`${LOG} copied ${n} events into ${TARGET}; the old table is now ${COPIED}`);
  return true;
};

// True once the whole history is in signal_events.
export const startSignalEventsCopy = async (): Promise<boolean> => {
  if (!(await tableExists(SOURCE))) return true;

  const lock = await acquireBackfillLock(LOCK_KEY);
  if (!lock) {
    console.log(`${LOG} another replica holds the lock; skipping`);
    return false;
  }

  try {
    // Re-checked under the lock: another replica may have just finished.
    if (!(await tableExists(SOURCE))) return true;
    const status = await readStatus();
    if (status) console.log(`${LOG} ${status.copiedProjects.length} projects copied by an earlier run; continuing`);
    return await runCopy(status, lock.lost);
  } catch (error) {
    console.error(`${LOG} FAILED; next boot retries from the last copied project`, error);
    return false;
  } finally {
    await lock.release();
  }
};
