import { cache } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { acquireBackfillLock } from "@/lib/clickhouse/scripts/backfill-lock";
// Copies events_to_clusters → signal_event_summaries, stamps
// traces_agg.signal_events / cluster_ids, then retires the legacy table
// (LAM-2207 package C).
// Fire-and-forget on frontend boot. Silent once the status record is `completed`.
//
// The cluster hierarchy needs no step here: it stays as `parent_id` on
// `signal_event_clusters`, already populated, with nothing derived from it
// materialized anywhere.
//
// Cloud: do NOT rely on this. After the new app-server is live, a human runs
// the same three INSERT bodies as fillSummaries / fillTraceEvents /
// fillTraceClusters below, without the project_id predicate (or per large
// project if the session times out), then drops the legacy table by hand.
// Source tables are < 2 GB.

const LOG = "[signal-clusters-backfill]";
const LOCK_KEY = "signal_clusters_backfill_lock";
const STATUS_KEY = "signal_clusters_backfill_status";

// Every step has to be replay-safe on its own, because the status record that
// skips finished ones is best-effort: `summaries` writes ReplacingMergeTree rows
// under stable keys, and `trace_events` / `trace_clusters` carry the
// `stampedTraces` anti-join.
const STEPS = ["summaries", "trace_events", "trace_clusters", "retire"] as const;
type Step = (typeof STEPS)[number];

const LEGACY_TABLE = "events_to_clusters";

type BackfillOutcome =
  | { state: "completed"; reason: string; stepsCompleted: Step[] }
  | { state: "partial"; reason: string; stepsCompleted: Step[] }
  | { state: "surrendered" };

type BackfillStatus = Exclude<BackfillOutcome, { state: "surrendered" }> & { at: string };

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

const projectIds = async (): Promise<string[]> => {
  const rs = await ch().query({
    query: `SELECT DISTINCT project_id AS id FROM signal_events`,
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

const fillSummaries = async (projectId: string): Promise<{ inserted: number; source: number }> => {
  const sourceRs = await ch().query({
    query: `
      SELECT count() AS c
      FROM events_to_clusters AS ec FINAL
      INNER JOIN signal_event_clusters AS c FINAL
        ON c.project_id = ec.project_id AND c.id = ec.cluster_id AND c.level <= 1
      WHERE ec.project_id = {projectId:UUID}
    `,
    query_params: { projectId },
    format: "JSONEachRow",
  });
  const sourceRows = await sourceRs.json<{ c: string | number }>();
  const inserted = await exec(
    `
    INSERT INTO signal_event_summaries
      (project_id, signal_id, cluster_id, event_id, summary, trace_id, trace_start_time, created_at)
    SELECT
      ec.project_id, c.signal_id, ec.cluster_id, ec.event_id, ec.content, e.trace_id,
      t.start_time, ec.created_at
    FROM events_to_clusters AS ec FINAL
    INNER JOIN signal_event_clusters AS c FINAL
      ON c.project_id = ec.project_id AND c.id = ec.cluster_id AND c.level <= 1
    INNER JOIN signal_events AS e
      ON e.project_id = ec.project_id AND e.id = ec.event_id
    INNER JOIN (
      SELECT project_id, id, min(start_time) AS start_time
      FROM traces_agg
      WHERE project_id = {projectId:UUID}
      GROUP BY project_id, id
    ) AS t ON t.project_id = e.project_id AND t.id = e.trace_id
    WHERE ec.project_id = {projectId:UUID}
  `,
    { projectId }
  );
  return { inserted, source: Number(sourceRows[0]?.c ?? 0) };
};

// Traces this project has already been stamped on. `traces_agg` folds both
// array columns with `groupArrayArray` — CONCATENATION, not replacement — and
// self-hosted MergeTree has no insert dedup, so a second pass over a trace
// appends another full copy of its events rather than rewriting them.
//
// A second pass is the NORMAL case, not an edge: the step status below lives in
// `cache`, which is per-process memory when REDIS_URL is unset, so every boot
// walks all four steps again, and a crash mid-step restarts that step's project
// loop from the top. So the two non-idempotent steps carry their own anti-join
// and the status stays an optimization — the same split as `antiJoin` vs the
// status record in backfill-traces-agg.ts. Keep the anti-join when running these
// bodies by hand on Cloud, where a timeout mid-statement is the same replay.
//
// `notEmpty` reads only the array's size stream, never the payloads (measured
// over 500k traces at 1 KB payloads: 11.4 MiB against 265 MiB for a read that
// touches `payload`), so it is cheap enough to pay on every boot.
const stampedTraces = (column: "signal_events" | "cluster_ids"): string => `
        SELECT id FROM traces_agg
        WHERE project_id = {projectId:UUID} AND notEmpty(${column})
      `;

const fillTraceEvents = async (projectId: string): Promise<number> =>
  exec(
    `
    INSERT INTO traces_agg (project_id, id, start_time, signal_events)
    SELECT
      e.project_id,
      e.trace_id,
      t.start_time,
      groupArray((e.id, e.signal_id, e.severity, e.payload))
    FROM signal_events AS e
    INNER JOIN (
      SELECT project_id, id, min(start_time) AS start_time
      FROM traces_agg
      WHERE project_id = {projectId:UUID}
      GROUP BY project_id, id
    ) AS t ON t.project_id = e.project_id AND t.id = e.trace_id
    WHERE e.project_id = {projectId:UUID}
      AND e.trace_id NOT IN (${stampedTraces("signal_events")})
    GROUP BY e.project_id, e.trace_id, t.start_time
  `,
    { projectId }
  );

const fillTraceClusters = async (projectId: string): Promise<number> =>
  exec(
    `
    INSERT INTO traces_agg (project_id, id, start_time, cluster_ids)
    SELECT
      s.project_id,
      s.trace_id,
      min(s.trace_start_time),
      groupUniqArray(s.cluster_id)
    FROM signal_event_summaries AS s
    INNER JOIN signal_event_clusters AS c FINAL
      ON c.project_id = s.project_id AND c.id = s.cluster_id AND c.level = 1
    WHERE s.project_id = {projectId:UUID}
      AND s.trace_id NOT IN (${stampedTraces("cluster_ids")})
    GROUP BY s.project_id, s.trace_id
  `,
    { projectId }
  );

const readStatus = async (): Promise<BackfillStatus | null> => {
  try {
    return await cache.get<BackfillStatus>(STATUS_KEY);
  } catch (error) {
    console.error(`${LOG} could not read the saved status`, error);
    return null;
  }
};

const writeStatus = async (status: BackfillStatus): Promise<void> => {
  try {
    await cache.set(STATUS_KEY, status);
  } catch (error) {
    console.error(`${LOG} could not save the status; the next boot will walk again`, error);
  }
};

const runBackfill = async (alreadyDone: Step[], lostLease: () => boolean): Promise<BackfillOutcome> => {
  if (!(await tableExists("signal_events")) || !(await tableExists(LEGACY_TABLE))) {
    return { state: "completed", reason: "source tables are absent", stepsCompleted: [...STEPS] };
  }

  const done = new Set<Step>(alreadyDone);
  const persist = async (step: Step): Promise<BackfillOutcome | null> => {
    done.add(step);
    if (lostLease()) return { state: "surrendered" };
    await writeStatus({
      state: "partial",
      reason: `finished ${step}`,
      stepsCompleted: [...done],
      at: new Date().toISOString(),
    });
    return null;
  };

  const projects = await projectIds();
  if (projects.length === 0) {
    return { state: "completed", reason: "no signal events", stepsCompleted: [...STEPS] };
  }

  if (!done.has("summaries")) {
    let inserted = 0;
    let source = 0;
    for (const projectId of projects) {
      if (lostLease()) return { state: "surrendered" };
      const r = await fillSummaries(projectId);
      inserted += r.inserted;
      source += r.source;
    }
    const dropped = source - inserted;
    if (dropped > 0) {
      console.warn(`${LOG} skipped ${dropped} leaf memberships whose trace is gone from traces_agg`);
    }
    console.log(`${LOG} copied ${inserted} leaf memberships into signal_event_summaries`);
    const stop = await persist("summaries");
    if (stop) return stop;
  }

  if (!done.has("trace_events")) {
    let n = 0;
    for (const projectId of projects) {
      if (lostLease()) return { state: "surrendered" };
      n += await fillTraceEvents(projectId);
    }
    console.log(`${LOG} stamped signal_events onto ${n} traces_agg partials`);
    const stop = await persist("trace_events");
    if (stop) return stop;
  }

  if (!done.has("trace_clusters")) {
    let n = 0;
    for (const projectId of projects) {
      if (lostLease()) return { state: "surrendered" };
      n += await fillTraceClusters(projectId);
    }
    console.log(`${LOG} stamped cluster_ids onto ${n} traces_agg partials`);
    const stop = await persist("trace_clusters");
    if (stop) return stop;
  }

  // Last, in this lease: migrations run before `backfill-traces-agg.ts` fills the
  // `traces_agg` every copy above joins, and there is no later boot to defer to.
  // The missing table is the durable done-marker — `cache` may lose the status,
  // but the `tableExists` guard at the top then short-circuits every later boot.
  if (!done.has("retire")) {
    await ch().command({ query: `DROP TABLE IF EXISTS ${LEGACY_TABLE}` });
    console.log(`${LOG} dropped the legacy ${LEGACY_TABLE} table`);
    const stop = await persist("retire");
    if (stop) return stop;
  }

  return { state: "completed", reason: "all steps finished", stepsCompleted: [...STEPS] };
};

/// `tracesAggComplete` MUST come from the `startTracesAggBackfill` call in this
/// process, not from its status record: that record is an optimization and is
/// absent on every boot when REDIS_URL is unset, which would defer this copy
/// forever.
export const startSignalClustersBackfill = async (tracesAggComplete: boolean): Promise<void> => {
  const status = await readStatus();
  if (status?.state === "completed") return;

  // fillSummaries / fillTraceEvents resolve each trace's start_time from
  // traces_agg with an INNER JOIN, so a trace not migrated there yet loses its
  // memberships silently. Defer rather than record a `completed` that never retries.
  if (!tracesAggComplete) {
    console.log(`${LOG} traces_agg backfill has not finished; retrying on the next boot`);
    return;
  }

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
    const outcome = await runBackfill(status?.stepsCompleted ?? [], lock.lost);
    if (outcome.state !== "surrendered" && !lock.lost()) {
      await writeStatus({ ...outcome, at: new Date().toISOString() });
    }
  } catch (error) {
    console.error(`${LOG} FAILED; next boot retries from the last saved step`, error);
  } finally {
    await lock.release();
  }
};
