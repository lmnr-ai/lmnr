import { cache } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { acquireBackfillLock } from "@/lib/clickhouse/scripts/backfill-lock";
// Moves signal_event_clusters onto the table from migration 69
// (ReplacingMergeTree(updated_at, is_deleted), monthly partitions, no vector
// index) and swaps it in (LAM-2329). Fire-and-forget on frontend boot. Silent
// once the status record is `completed`, or the live table has `is_deleted` and
// signal_event_clusters_v2 is gone (renamed after delta2 to
// old_unpartitioned_signal_event_clusters, or dropped).
//
// The app-server refuses to start clustering workers until the swap has
// happened (it would write tombstones the old table reads as live rows), so on
// self-hosted the app-server needs one restart after this logs `swapped`.
// Events queued meanwhile stay in the queue.
//
// Cloud: do NOT rely on this. Write consistency needs a quiet table:
//   1. Scale the clustering consumers to 0.
//   2. Run copy + delta by hand (bodies below; one INSERT per large project if
//      the session times out).
//   3. EXCHANGE TABLES signal_event_clusters AND signal_event_clusters_v2;
//   4. Deploy the new app-server, then scale the consumers back up. The next
//      frontend boot runs delta2 (nothing to copy on a quiet table) and renames
//      the old table to old_unpartitioned_signal_event_clusters.
//   5. Once verified, DROP TABLE old_unpartitioned_signal_event_clusters (or
//      signal_event_clusters_v2 if the frontend has not booted since the swap)
//      by hand. Nothing here drops it.
//
//   -- copy (and delta, with `AND updated_at >= <copy start - 10 min>`)
//   INSERT INTO signal_event_clusters_v2 (id, project_id, signal_id, name, level,
//     centroid, parent_id, num_signal_events, num_children_clusters, created_at,
//     updated_at, centroid_at_naming, num_signal_events_at_naming)
//   SELECT <same 13 columns> FROM signal_event_clusters FINAL
//   PREWHERE project_id = {projectId:UUID};
//
//   -- delta, second half: clusters the old app-server DELETEd during the copy
//   INSERT INTO signal_event_clusters_v2 (<13 columns>, is_deleted)
//   SELECT <12 columns>, now64(9) AS updated_at, ..., 1
//   FROM signal_event_clusters_v2 FINAL
//   PREWHERE project_id = {projectId:UUID}
//   WHERE id NOT IN (SELECT id FROM signal_event_clusters FINAL PREWHERE project_id = {projectId:UUID});
//
// With the consumers at 0 the delta and the post-swap delta2 find nothing; they
// exist for the self-hosted path, where the old app-server may still be writing.
// The project purge also deletes from signal_event_clusters_v2 and
// old_unpartitioned_signal_event_clusters. Deleting a signal clears only the
// live table, so a signal deleted mid-rebuild comes back with the swap or
// delta2 and must be deleted again.

const LOG = "[signal-clusters-rebuild]";
const LOCK_KEY = "signal_clusters_rebuild_lock";
const STATUS_KEY = "signal_clusters_rebuild_status";

const LIVE = "signal_event_clusters";
const NEXT = "signal_event_clusters_v2";
// Where the old table goes once delta2 is done; never dropped here.
const OLD = "old_unpartitioned_signal_event_clusters";

// Rows are stamped with the app-server's clock before the insert lands, so a
// delta reads from well before the previous step started.
const DELTA_MARGIN_MS = 10 * 60 * 1000;

// Every step is replay-safe: the copies insert full rows under unchanged keys
// and versions, so ReplacingMergeTree keeps the newest version whichever copy
// lands last, and every tombstone carries `now64(9)`, newer than any copied
// row; delta2 copies only versions newer than the live table's. The swap and
// the rename are not replayable, so `runRebuild` reads progress from the tables
// themselves when `cache` loses the status: `is_deleted` on the live table means
// swapped, and v2 without it means delta2 is still owed.
const STEPS = ["copy", "delta", "swap", "delta2"] as const;
type Step = (typeof STEPS)[number];

type RebuildOutcome =
  | { state: "completed"; reason: string; stepsCompleted: Step[] }
  | { state: "partial"; reason: string; stepsCompleted: Step[]; copyStartedAt?: string; deltaStartedAt?: string }
  | { state: "surrendered" };

type RebuildStatus = Exclude<RebuildOutcome, { state: "surrendered" }> & { at: string };

// `is_deleted` is left out: it defaults to 0, a live row.
const COLUMNS = `id, project_id, signal_id, name, level, centroid, parent_id, num_signal_events,
  num_children_clusters, created_at, updated_at, centroid_at_naming, num_signal_events_at_naming`;

const ch = () => clickhouseClient;

const scalar = async (query: string): Promise<string | null> => {
  const rs = await ch().query({ query, format: "JSONEachRow" });
  const rows = await rs.json<Record<string, string | null>>();
  if (rows.length === 0) return null;
  const value = Object.values(rows[0])[0];
  return value === undefined ? null : value;
};

const tableExists = async (table: string): Promise<boolean> => {
  const value = await scalar(
    `SELECT count() AS c FROM system.tables WHERE database = currentDatabase() AND name = '${table}'`
  );
  return Number(value ?? 0) > 0;
};

const hasIsDeleted = async (table: string): Promise<boolean> => {
  const value = await scalar(
    `SELECT count() AS c FROM system.columns
     WHERE database = currentDatabase() AND table = '${table}' AND name = 'is_deleted'`
  );
  return Number(value ?? 0) > 0;
};

// DateTime64(9) as ClickHouse prints it, e.g. `2026-10-02 12:00:00.123456789`.
const chNow = async (): Promise<string> => (await scalar(`SELECT toString(now64(9)) AS now`)) ?? "";

// A missing watermark means "everything": re-copying is harmless, skipping is not.
const sinceParam = (startedAt: string | undefined): string => startedAt ?? "1970-01-01 00:00:00.000000000";

const projectIds = async (table: string): Promise<string[]> => {
  const rs = await ch().query({
    query: `SELECT DISTINCT project_id AS id FROM ${table}`,
    format: "JSONEachRow",
  });
  const rows = await rs.json<{ id: string }>();
  return rows.map((r) => r.id);
};

const signalIds = async (table: string, projectId: string): Promise<string[]> => {
  const rs = await ch().query({
    query: `SELECT DISTINCT signal_id AS id FROM ${table} PREWHERE project_id = {projectId:UUID}`,
    query_params: { projectId },
    format: "JSONEachRow",
  });
  const rows = await rs.json<{ id: string }>();
  return rows.map((r) => r.id);
};

const exec = async (query: string, query_params?: Record<string, unknown>): Promise<number> => {
  const result = await ch().command({
    query,
    query_params,
    clickhouse_settings: { async_insert: 0 },
  });
  return Number(result.summary?.written_rows ?? 0);
};

// One signal per statement keeps each INSERT bounded on large projects.
const copySignal = async (from: string, to: string, projectId: string, signalId: string): Promise<number> =>
  exec(
    `
    INSERT INTO ${to} (${COLUMNS})
    SELECT ${COLUMNS}
    FROM ${from} FINAL
    PREWHERE project_id = {projectId:UUID} AND signal_id = {signalId:UUID}
  `,
    { projectId, signalId }
  );

const copyChanged = async (from: string, to: string, projectId: string, since: string): Promise<number> =>
  exec(
    `
    INSERT INTO ${to} (${COLUMNS})
    SELECT ${COLUMNS}
    FROM ${from} FINAL
    PREWHERE project_id = {projectId:UUID}
    WHERE updated_at >= {since:DateTime64(9)} - toIntervalMillisecond(${DELTA_MARGIN_MS})
  `,
    { projectId, since }
  );

// Pre-swap only: the old app-server deletes with a lightweight DELETE, which no
// `updated_at` delta can see. After the swap the new app-server creates rows
// the old table never had, so the same anti-join would tombstone live clusters.
const tombstoneDeleted = async (projectId: string): Promise<number> =>
  exec(
    `
    INSERT INTO ${NEXT} (${COLUMNS}, is_deleted)
    SELECT id, project_id, signal_id, name, level, centroid, parent_id, num_signal_events,
      num_children_clusters, created_at, now64(9), centroid_at_naming, num_signal_events_at_naming, 1
    FROM ${NEXT} FINAL
    PREWHERE project_id = {projectId:UUID}
    WHERE id NOT IN (SELECT id FROM ${LIVE} FINAL PREWHERE project_id = {projectId:UUID})
  `,
    { projectId }
  );

// Null when the lease was lost mid-walk.
const tombstoneAllDeleted = async (lostLease: () => boolean): Promise<number | null> => {
  let n = 0;
  for (const projectId of await projectIds(NEXT)) {
    if (lostLease()) return null;
    n += await tombstoneDeleted(projectId);
  }
  return n;
};

const readStatus = async (): Promise<RebuildStatus | null> => {
  try {
    return await cache.get<RebuildStatus>(STATUS_KEY);
  } catch (error) {
    console.error(`${LOG} could not read the saved status`, error);
    return null;
  }
};

const writeStatus = async (status: RebuildStatus): Promise<void> => {
  try {
    await cache.set(STATUS_KEY, status);
  } catch (error) {
    console.error(`${LOG} could not save the status; the next boot will walk again`, error);
  }
};

// Post-swap: `from` is the old table, `to` the live one. Copies only versions
// newer than anything `to` holds for the id, tombstones included (no FINAL on
// that side), so a replay without the watermark rewrites nothing and can never
// resurrect a cluster the new app-server has tombstoned.
const copyNewer = async (from: string, to: string, projectId: string, since: string): Promise<number> =>
  exec(
    `
    INSERT INTO ${to} (${COLUMNS})
    SELECT ${COLUMNS}
    FROM (
      SELECT ${COLUMNS}
      FROM ${from} FINAL
      PREWHERE project_id = {projectId:UUID}
      WHERE updated_at >= {since:DateTime64(9)} - toIntervalMillisecond(${DELTA_MARGIN_MS})
    ) AS o
    LEFT ANY JOIN (
      SELECT id AS live_id, max(updated_at) AS live_version
      FROM ${to}
      PREWHERE project_id = {projectId:UUID}
      GROUP BY id
    ) AS l ON o.id = l.live_id
    WHERE l.live_id = toUUID('00000000-0000-0000-0000-000000000000') OR o.updated_at > l.live_version
  `,
    { projectId, since }
  );

// Writes the old app-server landed between the delta and the swap, then the
// rename that marks delta2 done durably (`cache` may be in-memory).
const finishAfterSwap = async (
  deltaStartedAt: string | undefined,
  lostLease: () => boolean
): Promise<RebuildOutcome> => {
  let n = 0;
  for (const projectId of await projectIds(NEXT)) {
    if (lostLease()) return { state: "surrendered" };
    n += await copyNewer(NEXT, LIVE, projectId, sinceParam(deltaStartedAt));
  }
  if (lostLease()) return { state: "surrendered" };
  await ch().command({ query: `RENAME TABLE ${NEXT} TO ${OLD}` });
  console.log(`${LOG} delta2: re-copied ${n} clusters written during the swap; the old table is now ${OLD}`);
  return { state: "completed", reason: "all steps finished", stepsCompleted: [...STEPS] };
};

const runRebuild = async (status: RebuildStatus | null, lostLease: () => boolean): Promise<RebuildOutcome> => {
  if (!(await tableExists(LIVE))) {
    return { state: "completed", reason: "tables are absent", stepsCompleted: [...STEPS] };
  }
  if (await hasIsDeleted(LIVE)) {
    // NEXT without `is_deleted` is the old table, still waiting for delta2.
    if (!(await tableExists(NEXT)) || (await hasIsDeleted(NEXT))) {
      return { state: "completed", reason: "already swapped", stepsCompleted: [...STEPS] };
    }
    console.log(`${LOG} swapped earlier but delta2 never finished; running it now`);
    return finishAfterSwap(status?.state === "partial" ? status.deltaStartedAt : undefined, lostLease);
  }
  if (!(await tableExists(NEXT))) {
    return { state: "completed", reason: "tables are absent", stepsCompleted: [...STEPS] };
  }

  const done = new Set<Step>(status?.stepsCompleted ?? []);
  let copyStartedAt = status?.state === "partial" ? status.copyStartedAt : undefined;
  let deltaStartedAt = status?.state === "partial" ? status.deltaStartedAt : undefined;
  // A step recorded without its watermark replays from the start.
  if (!copyStartedAt) done.delete("copy");
  if (!deltaStartedAt) done.delete("delta");

  const persist = async (step: Step): Promise<RebuildOutcome | null> => {
    done.add(step);
    if (lostLease()) return { state: "surrendered" };
    await writeStatus({
      state: "partial",
      reason: `finished ${step}`,
      stepsCompleted: [...done],
      copyStartedAt,
      deltaStartedAt,
      at: new Date().toISOString(),
    });
    return null;
  };

  if (!done.has("copy")) {
    copyStartedAt = await chNow();
    let n = 0;
    for (const projectId of await projectIds(LIVE)) {
      for (const signalId of await signalIds(LIVE, projectId)) {
        if (lostLease()) return { state: "surrendered" };
        n += await copySignal(LIVE, NEXT, projectId, signalId);
      }
    }
    console.log(`${LOG} copied ${n} clusters into ${NEXT}`);
    const stop = await persist("copy");
    if (stop) return stop;
  }

  if (!done.has("delta")) {
    deltaStartedAt = await chNow();
    let changed = 0;
    for (const projectId of await projectIds(LIVE)) {
      if (lostLease()) return { state: "surrendered" };
      changed += await copyChanged(LIVE, NEXT, projectId, sinceParam(copyStartedAt));
    }
    const tombstoned = await tombstoneAllDeleted(lostLease);
    if (tombstoned === null) return { state: "surrendered" };
    console.log(`${LOG} delta: re-copied ${changed} changed clusters, tombstoned ${tombstoned} deleted ones`);
    const stop = await persist("delta");
    if (stop) return stop;
  }

  // Again right before the swap: a DELETE that landed after the delta pass is
  // still live on NEXT. After the swap, writers resolve the live name and hit
  // the new table, so this pass leaves only its own duration uncovered.
  const lateTombstoned = await tombstoneAllDeleted(lostLease);
  if (lateTombstoned === null) return { state: "surrendered" };
  if (lateTombstoned > 0) console.log(`${LOG} tombstoned ${lateTombstoned} clusters deleted since the delta`);
  if (lostLease()) return { state: "surrendered" };
  await ch().command({ query: `EXCHANGE TABLES ${LIVE} AND ${NEXT}` });
  console.log(`${LOG} swapped; restart the app-server to start clustering on the new table`);
  const swapStop = await persist("swap");
  if (swapStop) return swapStop;

  return finishAfterSwap(deltaStartedAt, lostLease);
};

export const startSignalClustersRebuild = async (): Promise<void> => {
  const status = await readStatus();
  if (status?.state === "completed") return;

  const lock = await acquireBackfillLock(LOCK_KEY);
  if (!lock) {
    console.log(`${LOG} another replica holds the lock; skipping`);
    return;
  }

  if (status?.state === "partial") {
    console.log(
      `${LOG} previous run stopped after [${status.stepsCompleted.join(", ")}] (${status.reason}); continuing`
    );
  }

  try {
    const outcome = await runRebuild(status, lock.lost);
    if (outcome.state !== "surrendered" && !lock.lost()) {
      await writeStatus({ ...outcome, at: new Date().toISOString() });
    }
  } catch (error) {
    console.error(`${LOG} FAILED; next boot retries from the last saved step`, error);
  } finally {
    await lock.release();
  }
};
