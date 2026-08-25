import { cache } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { acquireBackfillLock } from "@/lib/clickhouse/scripts/backfill-lock";

// Backfills historical `traces_replacing` rows into `traces_agg` + `traces_static`
// for self-hosters upgrading past the LAM-2020 cutover (LAM-2018). Runs
// fire-and-forget on frontend boot; a crash resumes from the destination
// watermark on the next boot.

const BATCH_HOURS = 6;
// A trace's versions can span a window edge (the winning version's start_time can
// sit earlier than a losing one's), so the winner lookup reads `window ± pad` and
// filters on the RESOLVED start_time. We ASSUME no trace spans more than 24h; a
// trace whose versions sit further apart is never read whole, so two windows each
// resolve a local winner and both insert into a summing table. Widening is cheap
// (`traces_replacing` prunes at monthly-partition granularity, so 3h and 240h pads
// read the same parts), so the assumption is generous rather than tuned.
const READ_PAD_HOURS = 24;
// Live ingest and any still-rolling old pods can be writing the newest traces
// to BOTH tables, so start slightly ahead of the watermark.
const WATERMARK_BUFFER_HOURS = 1;

const MAX_DAYS = 90;
const MAX_TRACES = 50_000_000;
// Cheap approximate guard; only consulted every N windows.
const COUNT_CHECK_EVERY_WINDOWS = 8;
// Backstop so a clock/data anomaly can't spin forever. 90d at 6h = 360.
const MAX_WINDOWS = 400;

// Reserved keys the old ingest path folded into `traces_replacing.metadata`.
// `traces_static.metadata` has whole-object SET semantics, so copying these
// through would replace the customer's real metadata with a synthetic key.
const RESERVED_METADATA_KEYS = ["lmnr_user_task", "lmnr_trace_output"];

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const reservedKeysSql = `[${RESERVED_METADATA_KEYS.map((k) => `'${k}'`).join(", ")}]`;

const ch = () => clickhouseClient;

const formatDateTime64 = (date: Date): string => date.toISOString().replace("T", " ").replace("Z", "").slice(0, 23);

// The 'UTC' argument is REQUIRED, not decoration. `formatDateTime64` emits a UTC
// wall-clock string and every column here is `DateTime64(9, 'UTC')`, but a
// tz-less `toDateTime64('…', 9)` literal is parsed in the SERVER's timezone — so
// on a non-UTC ClickHouse every window bound silently shifts by the UTC offset
// (verified: a [12:00,18:00) window matched 16:00–21:00 traces under a
// America/New_York server, a 4h skew). Reads are unaffected because the column
// carries 'UTC', which makes the round trip asymmetric and the bug invisible on a
// UTC-configured staging box.
const ts = (date: Date): string => `toDateTime64('${formatDateTime64(date)}', 9, 'UTC')`;

const addHours = (date: Date, hours: number): Date => new Date(date.getTime() + hours * 60 * 60 * 1000);

const floorToBatch = (date: Date): Date => {
  const floored = new Date(date);
  floored.setUTCMinutes(0, 0, 0);
  floored.setUTCHours(Math.floor(floored.getUTCHours() / BATCH_HOURS) * BATCH_HOURS);
  return floored;
};

// `traces_replacing` is a ReplacingMergeTree(num_spans) whose winning version can
// carry an EARLIER start_time than a losing one (min(start_time) shrinks as spans
// arrive). `SELECT ... FINAL` under a narrow start_time filter can therefore clip
// the winner and silently resolve to a stale version — and padding the window then
// re-filtering in an outer WHERE does NOT help, because the predicate is pushed
// back into the FINAL scan. So resolve the winner explicitly with argMax over the
// version column and filter on the RESOLVED start_time.
const winnersSubquery = (readFrom: Date, readTo: Date): string => `
  SELECT
    project_id,
    id AS w_id,
    argMax(start_time, num_spans) AS w_start_time,
    argMax(end_time, num_spans) AS w_end_time,
    argMax(input_tokens, num_spans) AS w_input_tokens,
    argMax(output_tokens, num_spans) AS w_output_tokens,
    argMax(total_tokens, num_spans) AS w_total_tokens,
    argMax(input_cost, num_spans) AS w_input_cost,
    argMax(output_cost, num_spans) AS w_output_cost,
    argMax(total_cost, num_spans) AS w_total_cost,
    argMax(metadata, num_spans) AS w_metadata,
    argMax(tags, num_spans) AS w_tags,
    max(num_spans) AS w_num_spans,
    argMax(span_names, num_spans) AS w_span_names,
    argMax(cache_read_input_tokens, num_spans) AS w_cache_read_input_tokens,
    argMax(cache_creation_input_tokens, num_spans) AS w_cache_creation_input_tokens,
    argMax(reasoning_tokens, num_spans) AS w_reasoning_tokens,
    argMax(status, num_spans) AS w_status,
    argMax(trace_type, num_spans) AS w_trace_type,
    argMax(user_id, num_spans) AS w_user_id,
    argMax(session_id, num_spans) AS w_session_id,
    argMax(top_span_id, num_spans) AS w_top_span_id,
    argMax(top_span_name, num_spans) AS w_top_span_name,
    argMax(top_span_type, num_spans) AS w_top_span_type,
    argMax(has_browser_session, num_spans) AS w_has_browser_session
  FROM traces_replacing
  WHERE start_time >= ${ts(readFrom)} AND start_time < ${ts(readTo)}
  GROUP BY project_id, id
`;

interface Window {
  from: Date;
  to: Date;
  readFrom: Date;
  readTo: Date;
}

// `traces_agg` SUMS its columns, so inserting a trace twice permanently inflates
// its tokens/costs, and self-hosted MergeTree has no insert dedup
// (non_replicated_deduplication_window = 0) to catch it.
//
// Runs on EVERY window, not just the ones near the watermark. Window ownership
// by resolved start_time makes windows disjoint WITHIN one run, but that says
// nothing about a concurrent run: the Redis lock can't be acquired atomically
// (see startTracesAggBackfill), so two replicas booting together can both walk
// the same windows. This is the only guard that makes that race non-corrupting,
// and it's cheap — the subquery prunes on partition + MinMax and reads two
// narrow sort-key columns (measured: 1.88 KiB / 48 rows for a 12h probe).
const antiJoin = (table: "traces_agg" | "traces_static", w: Window): string => {
  const idColumn = table === "traces_agg" ? "id" : "trace_id";
  return `AND (project_id, w_id) NOT IN (
    SELECT project_id, ${idColumn} FROM ${table}
    WHERE start_time >= ${ts(w.readFrom)} AND start_time < ${ts(w.readTo)}
  )`;
};

const ownedByWindow = (w: Window): string => `WHERE w_start_time >= ${ts(w.from)} AND w_start_time < ${ts(w.to)}`;

const insertAgg = async (w: Window): Promise<number> => {
  const result = await ch().command({
    query: `
      INSERT INTO traces_agg (
        id, project_id, start_time, end_time,
        input_tokens, output_tokens, total_tokens, input_cost, output_cost, total_cost,
        metadata, tags, num_spans, span_names,
        cache_read_input_tokens, cache_creation_input_tokens, reasoning_tokens,
        statuses, trace_types
      )
      SELECT
        w_id, project_id, w_start_time, w_end_time,
        w_input_tokens, w_output_tokens, w_total_tokens, w_input_cost, w_output_cost, w_total_cost,
        CAST(
          arrayFilter(kv -> NOT has(${reservedKeysSql}, kv.1), JSONExtractKeysAndValuesRaw(w_metadata)),
          'Map(String, String)'
        ),
        w_tags, w_num_spans, w_span_names,
        w_cache_read_input_tokens, w_cache_creation_input_tokens, w_reasoning_tokens,
        if(w_status = 'error', [2], [1]),
        multiIf(w_trace_type = 3, [3], w_trace_type = 2, [2], w_trace_type = 1, [1], [0])
      FROM (${winnersSubquery(w.readFrom, w.readTo)})
      ${ownedByWindow(w)}
      ${antiJoin("traces_agg", w)}
    `,
    // Blocks must land before the next window's anti-join reads them.
    clickhouse_settings: { async_insert: 0 },
  });
  return Number(result.summary?.written_rows ?? 0);
};

// Every column is a NULL hole unless this batch actually learned a value:
// `traces_static` is a CoalescingMergeTree, so writing '' / 0 / nil-UUID would
// CLOBBER a value live ingest already set (verified end-to-end).
//
// `root_span_name_from_path` is deliberately never written. `traces_replacing`
// does not record whether its `top_span_name` came from the real root span or
// from the span path, so the provenance simply isn't recoverable here; readers
// resolve coalesce(root_span_name, root_span_name_from_path) and historical rows
// always populate the primary column.
//
// `input` / `output_hashes` are also never written: extracted agent input lived
// in a reserved metadata key rather than a column, and agent output hashes were
// never computed for historical traces.
const insertStatic = async (w: Window): Promise<number> => {
  const result = await ch().command({
    query: `
      INSERT INTO traces_static (
        project_id, trace_id, start_time, user_id, session_id, metadata,
        root_span_id, root_span_name, root_span_type, has_browser_session
      )
      SELECT
        project_id, w_id, w_start_time,
        nullIf(w_user_id, ''),
        nullIf(w_session_id, ''),
        if(
          empty(w_metadata_pairs),
          NULL,
          concat('{', arrayStringConcat(arrayMap(kv -> concat(toJSONString(kv.1), ':', kv.2), w_metadata_pairs), ','), '}')
        ),
        nullIf(w_top_span_id, toUUID('${NIL_UUID}')),
        nullIf(w_top_span_name, ''),
        -- Out-of-range Enum8 ints are accepted at INSERT but poison every later
        -- read of the part with UNKNOWN_ELEMENT_OF_ENUM.
        if(w_top_span_type <= 8, w_top_span_type, NULL),
        if(w_has_browser_session, 1, NULL)
      FROM (
        SELECT
          *,
          arrayFilter(kv -> NOT has(${reservedKeysSql}, kv.1), JSONExtractKeysAndValuesRaw(w_metadata)) AS w_metadata_pairs
        FROM (${winnersSubquery(w.readFrom, w.readTo)})
      )
      ${ownedByWindow(w)}
      ${antiJoin("traces_static", w)}
    `,
    clickhouse_settings: { async_insert: 0 },
  });
  return Number(result.summary?.written_rows ?? 0);
};

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

// Approximate and free — reads part metadata rather than scanning. Pre-merge, so
// it over-counts, which errs toward stopping early (the safe direction).
const approximateSourceRows = async (): Promise<number> => {
  const value = await scalar(
    `SELECT sum(rows) AS c FROM system.parts
     WHERE database = currentDatabase() AND table = 'traces_replacing' AND active`
  );
  return Number(value ?? 0);
};

const countSourceTracesSince = async (since: Date): Promise<number> => {
  const value = await scalar(`SELECT uniqExact(id) AS c FROM traces_replacing WHERE start_time >= ${ts(since)}`);
  return Number(value ?? 0);
};

// `min(start_time)` over an EMPTY table does NOT return NULL — ClickHouse yields
// the DateTime64 zero value, which arrives as the string "1970-01-01 00:00:00…".
// That is truthy and parses fine, so a plain `!value` check lets the epoch
// sentinel through as if it were a real timestamp. Treat it as absent: for the
// watermark it would otherwise defeat the `?? now` fresh-cutover fallback and
// make `watermark <= oldestSource` short-circuit the whole backfill, stranding
// every historical trace on a deployment that has history but no destination
// rows yet (verified).
const EPOCH_SENTINEL_MS = 0;

const parseChTimestamp = (value: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  if (isNaN(parsed.getTime()) || parsed.getTime() === EPOCH_SENTINEL_MS) return null;
  return parsed;
};

// Resume point. The destination is its own progress marker, so a restart
// re-derives where to continue without trusting the persisted status below.
const destinationWatermark = async (): Promise<Date | null> =>
  parseChTimestamp(await scalar(`SELECT min(start_time) AS m FROM traces_static`));

const oldestSourceTrace = async (): Promise<Date | null> =>
  parseChTimestamp(await scalar(`SELECT min(start_time) AS m FROM traces_replacing`));

const manualCommandHint = (w: Window): string =>
  `To finish manually, re-run the backfill for windows at or before ` +
  `${formatDateTime64(w.to)} (UTC). See lib/clickhouse/backfill/traces-agg.ts.`;

// Only a run still holding the lock persists an outcome (`surrendered` never
// does): the replica that took the lock over owns the record, and a write from
// the loser could clobber it with a staler one.
type BackfillOutcome =
  | { state: "completed"; reason: string }
  | { state: "partial"; reason: string; earliestMigrated: string }
  | { state: "surrendered" };

type BackfillStatus = Exclude<BackfillOutcome, { state: "surrendered" }> & { at: string };

// Bump this key if the backfill's semantics change and every deployment should
// walk its history again.
const STATUS_KEY = "traces_agg_backfill_status";

// The status is an OPTIMIZATION, not the resume marker — losing it only costs a
// re-derivation from the destination watermark, which converges to the same
// no-op. So an unreachable Redis must never block the migration.
const readStatus = async (): Promise<BackfillStatus | null> => {
  try {
    return await cache.get<BackfillStatus>(STATUS_KEY);
  } catch (error) {
    console.error("[traces-agg-backfill] could not read the saved status", error);
    return null;
  }
};

// No TTL: a finished migration stays finished.
const writeStatus = async (status: BackfillStatus): Promise<void> => {
  try {
    await cache.set(STATUS_KEY, status);
  } catch (error) {
    console.error("[traces-agg-backfill] could not save the status; the next boot will walk again", error);
  }
};

const runBackfill = async (now: Date, lostLease: () => boolean = () => false): Promise<BackfillOutcome> => {
  // The source has had no writer since the cutover, so "absent"/"empty" is a
  // permanent answer rather than a not-yet — safe to record as completed.
  if (!(await tableExists("traces_replacing"))) {
    console.log("[traces-agg-backfill] traces_replacing is absent; nothing to migrate");
    return { state: "completed", reason: "traces_replacing is absent" };
  }
  if ((await approximateSourceRows()) === 0) {
    console.log("[traces-agg-backfill] traces_replacing is empty; nothing to migrate");
    return { state: "completed", reason: "traces_replacing is empty" };
  }

  const oldestSource = await oldestSourceTrace();
  if (!oldestSource) {
    console.log("[traces-agg-backfill] traces_replacing has no readable rows; nothing to migrate");
    return { state: "completed", reason: "traces_replacing has no readable rows" };
  }

  // No destination rows yet (fresh cutover) means start from now.
  const watermark = (await destinationWatermark()) ?? now;
  const horizon = addHours(watermark, -MAX_DAYS * 24);

  if (watermark <= oldestSource) {
    console.log(
      `[traces-agg-backfill] destination already covers history back to ${formatDateTime64(watermark)}; nothing to do`
    );
    return { state: "completed", reason: `destination covers history back to ${formatDateTime64(watermark)}` };
  }

  // The first window is a PARTIAL one: it runs from the batch-aligned floor of
  // the watermark up to watermark+buffer, so the region between the floor and
  // the watermark is covered. Flooring straight to the upper bound would skip
  // it entirely (verified: an 8-trace hole).
  let cursor = addHours(watermark, WATERMARK_BUFFER_HOURS);
  let alignedFloor: Date | null = floorToBatch(watermark);
  let windowIndex = 0;
  let migratedAgg = 0;
  let migratedStatic = 0;
  let lastCompleted: Window | null = null;

  console.log(
    `[traces-agg-backfill] starting; walking back from ${formatDateTime64(cursor)} ` +
      `in ${BATCH_HOURS}h batches (limits: ${MAX_DAYS}d / ${MAX_TRACES} traces). ` +
      `Assuming no trace spans more than ${READ_PAD_HOURS}h — a longer one could be counted twice.`
  );

  while (windowIndex < MAX_WINDOWS) {
    // Someone else owns the lock now; stop rather than write alongside them.
    if (lostLease()) {
      console.warn(
        `[traces-agg-backfill] stopping at ${formatDateTime64(cursor)} after losing the lock lease; ` +
          `${migratedAgg} traces_agg / ${migratedStatic} traces_static rows written`
      );
      return { state: "surrendered" };
    }

    const to = cursor;
    // Subsequent windows are batch-aligned; only the first is partial.
    const from = alignedFloor ?? addHours(to, -BATCH_HOURS);
    alignedFloor = null;
    const w: Window = {
      from,
      to,
      readFrom: addHours(from, -READ_PAD_HOURS),
      readTo: addHours(to, READ_PAD_HOURS),
    };

    try {
      migratedAgg += await insertAgg(w);
      // Re-check between the two inserts: a single ClickHouse insert can outlive
      // the lease, and the pair is not atomic. Without this a takeover landing
      // mid-window still lets the traces_static write through unfenced.
      if (lostLease()) {
        console.warn(
          `[traces-agg-backfill] lost the lock lease mid-window at ${formatDateTime64(from)}; ` +
            `stopping before the traces_static write. traces_agg for this window is already committed, ` +
            `so the next run's anti-join will skip those ids and only backfill the missing traces_static rows.`
        );
        return { state: "surrendered" };
      }
      migratedStatic += await insertStatic(w);
    } catch (error) {
      const resumeFrom = lastCompleted ? formatDateTime64(lastCompleted.from) : formatDateTime64(to);
      console.error(
        `[traces-agg-backfill] FAILED on window [${formatDateTime64(from)} .. ${formatDateTime64(to)}). ` +
          `Last fully migrated window starts at ${resumeFrom}. ` +
          `Restarting the frontend resumes automatically from the destination watermark. ` +
          `${manualCommandHint(w)}`,
        error
      );
      throw error;
    }

    lastCompleted = w;
    cursor = from;
    windowIndex += 1;

    if (from <= oldestSource) {
      console.log(
        `[traces-agg-backfill] reached oldest source trace ${formatDateTime64(oldestSource)}; ` +
          `migrated ${migratedAgg} traces_agg / ${migratedStatic} traces_static rows`
      );
      return { state: "completed", reason: `reached oldest source trace ${formatDateTime64(oldestSource)}` };
    }

    if (from < horizon) {
      console.log(
        `[traces-agg-backfill] reached the ${MAX_DAYS}-day limit; earliest migrated timestamp ` +
          `${formatDateTime64(from)}; migrated ${migratedAgg} traces_agg / ${migratedStatic} traces_static rows`
      );
      return {
        state: "partial",
        reason: `reached the ${MAX_DAYS}-day limit`,
        earliestMigrated: formatDateTime64(from),
      };
    }

    if (windowIndex % COUNT_CHECK_EVERY_WINDOWS === 0) {
      const migratedSoFar = await countSourceTracesSince(from);
      if (migratedSoFar > MAX_TRACES) {
        console.log(
          `[traces-agg-backfill] reached the ${MAX_TRACES}-trace limit (~${migratedSoFar}); ` +
            `earliest migrated timestamp ${formatDateTime64(from)}. ${manualCommandHint(w)}`
        );
        return {
          state: "partial",
          reason: `reached the ${MAX_TRACES}-trace limit`,
          earliestMigrated: formatDateTime64(from),
        };
      }
      console.log(
        `[traces-agg-backfill] progress: back to ${formatDateTime64(from)}, ` +
          `${migratedAgg} traces_agg / ${migratedStatic} traces_static rows written`
      );
    }
  }

  console.warn(
    `[traces-agg-backfill] stopped after ${MAX_WINDOWS} windows at ${formatDateTime64(cursor)}; ` +
      `re-run to continue if older data still needs migrating`
  );
  return {
    state: "partial",
    reason: `stopped after ${MAX_WINDOWS} windows`,
    earliestMigrated: formatDateTime64(cursor),
  };
};

// Deliberately NO SIGTERM/SIGINT/exit handlers. Registering a signal listener
// SUPPRESSES Node's default terminate (verified with plain node: a process whose
// only SIGTERM listener doesn't call process.exit stays alive and ignores the
// signal). Next installs its own SIGTERM/SIGINT cleanup that exits 143/130, but
// only when NEXT_MANUAL_SIG_HANDLE is unset — so a listener here would strand
// the pod on shutdown in the manual-handle configuration. Releasing the lock a
// few minutes early isn't worth that risk; the lock TTL covers a pod that dies.
export const startTracesAggBackfill = async (): Promise<void> => {
  const status = await readStatus();
  // Silent on purpose: a migration that already finished should leave no trace
  // in the logs of every subsequent boot, which is the whole point of the record.
  if (status?.state === "completed") return;

  const lock = await acquireBackfillLock();
  if (!lock) {
    console.log("[traces-agg-backfill] another replica holds the lock; skipping");
    return;
  }

  if (status?.state === "partial") {
    console.log(
      `[traces-agg-backfill] previous run stopped at ${status.earliestMigrated} (${status.reason}); continuing`
    );
  }

  try {
    const outcome = await runBackfill(new Date(), lock.lost);
    // Re-check the lease rather than trusting `surrendered` alone: the lease can
    // lapse during the last window's insert, and the terminal returns after it
    // don't check again — so a run CAN come back `completed`/`partial` while a
    // successor already owns the work. Writing then could clobber the
    // successor's record with a staler one.
    if (outcome.state !== "surrendered" && !lock.lost()) {
      await writeStatus({ ...outcome, at: new Date().toISOString() });
    }
  } catch {
    // runBackfill already logged the resume point and the manual hint. The status
    // is deliberately left untouched so the next boot retries.
  } finally {
    await lock.release();
  }
};
