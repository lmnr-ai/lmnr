import { cache } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";

// Backfills historical `traces_replacing` rows into `traces_agg` + `traces_static`
// for self-hosters upgrading past the LAM-2020 cutover (LAM-2018). Runs
// fire-and-forget on frontend boot; a crash resumes from the destination
// watermark on the next boot.

const LOCK_KEY = "traces_agg_backfill_lock";
const LOCK_TTL_SECONDS = 15 * 60;
// Renew well inside the TTL so a slow batch can't let the lock lapse under us.
const LOCK_RENEW_INTERVAL_MS = 5 * 60 * 1000;

const BATCH_HOURS = 6;
// A trace's versions can span a window edge (the winning version's start_time
// can sit earlier than a losing one's), so the winner lookup reads wider than
// the window it writes. The pad must exceed the longest trace or the true
// highest-version row is excluded before argMax resolves it — so the actual max
// trace duration is measured at startup and the pad is widened to cover it.
const DEFAULT_READ_PAD_HOURS = 3;
// Ceiling on the measured widening. A pathological trace (a stuck ingest, a
// clock-skewed end_time) must not turn every window into a full-table scan;
// past this we log and accept the risk rather than melt the cluster.
const MAX_READ_PAD_HOURS = 24;
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

// Resume point. There is deliberately NO persisted state: the destination is its
// own progress marker, so a restart re-derives where to continue and an
// already-migrated deployment converges to a cheap no-op.
const destinationWatermark = async (): Promise<Date | null> =>
  parseChTimestamp(await scalar(`SELECT min(start_time) AS m FROM traces_static`));

const oldestSourceTrace = async (): Promise<Date | null> =>
  parseChTimestamp(await scalar(`SELECT min(start_time) AS m FROM traces_replacing`));

// The read pad must exceed the longest trace, otherwise a window filter can
// exclude the true highest-version row before argMax picks a winner and we
// migrate a stale version. Measure rather than assume: read the widest
// start_time→end_time span in the source (a cheap two-column aggregate over a
// frozen table) and widen the pad to cover it, capped so one pathological row
// can't turn every window into a full scan.
const resolveReadPadHours = async (): Promise<number> => {
  const value = await scalar(
    `SELECT max((toUnixTimestamp64Nano(end_time) - toUnixTimestamp64Nano(start_time)) / 3.6e12) AS h
     FROM traces_replacing WHERE end_time >= start_time`
  );
  const longestTraceHours = Number(value ?? 0);
  if (!isFinite(longestTraceHours) || longestTraceHours <= 0) return DEFAULT_READ_PAD_HOURS;

  // +1h of slack so a trace exactly at the measured max still sits inside the pad.
  const needed = Math.ceil(longestTraceHours) + 1;
  if (needed > MAX_READ_PAD_HOURS) {
    console.warn(
      `[traces-agg-backfill] longest source trace is ${longestTraceHours.toFixed(1)}h, which exceeds the ` +
        `${MAX_READ_PAD_HOURS}h read-pad cap; capping. Traces longer than the cap may migrate a stale version.`
    );
    return MAX_READ_PAD_HOURS;
  }
  return Math.max(DEFAULT_READ_PAD_HOURS, needed);
};

const manualCommandHint = (w: Window): string =>
  `To finish manually, re-run the backfill for windows at or before ` +
  `${formatDateTime64(w.to)} (UTC). See lib/clickhouse/backfill/traces-agg.ts.`;

const runBackfill = async (now: Date, lostLease: () => boolean = () => false): Promise<void> => {
  if (!(await tableExists("traces_replacing"))) {
    console.log("[traces-agg-backfill] traces_replacing is absent; nothing to migrate");
    return;
  }
  if ((await approximateSourceRows()) === 0) {
    console.log("[traces-agg-backfill] traces_replacing is empty; nothing to migrate");
    return;
  }

  const oldestSource = await oldestSourceTrace();
  if (!oldestSource) {
    console.log("[traces-agg-backfill] traces_replacing has no readable rows; nothing to migrate");
    return;
  }

  // No destination rows yet (fresh cutover) means start from now.
  const watermark = (await destinationWatermark()) ?? now;
  const horizon = addHours(watermark, -MAX_DAYS * 24);

  if (watermark <= oldestSource) {
    console.log(
      `[traces-agg-backfill] destination already covers history back to ${formatDateTime64(watermark)}; nothing to do`
    );
    return;
  }

  const readPadHours = await resolveReadPadHours();

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
      `in ${BATCH_HOURS}h batches, ${readPadHours}h read pad ` +
      `(limits: ${MAX_DAYS}d / ${MAX_TRACES} traces)`
  );

  while (windowIndex < MAX_WINDOWS) {
    // Someone else owns the lock now; stop rather than write alongside them.
    if (lostLease()) {
      console.warn(
        `[traces-agg-backfill] stopping at ${formatDateTime64(cursor)} after losing the lock lease; ` +
          `${migratedAgg} traces_agg / ${migratedStatic} traces_static rows written`
      );
      return;
    }

    const to = cursor;
    // Subsequent windows are batch-aligned; only the first is partial.
    const from = alignedFloor ?? addHours(to, -BATCH_HOURS);
    alignedFloor = null;
    const w: Window = {
      from,
      to,
      readFrom: addHours(from, -readPadHours),
      readTo: addHours(to, readPadHours),
    };

    try {
      migratedAgg += await insertAgg(w);
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
      return;
    }

    if (from < horizon) {
      console.log(
        `[traces-agg-backfill] reached the ${MAX_DAYS}-day limit; earliest migrated timestamp ` +
          `${formatDateTime64(from)}; migrated ${migratedAgg} traces_agg / ${migratedStatic} traces_static rows`
      );
      return;
    }

    if (windowIndex % COUNT_CHECK_EVERY_WINDOWS === 0) {
      const migratedSoFar = await countSourceTracesSince(from);
      if (migratedSoFar > MAX_TRACES) {
        console.log(
          `[traces-agg-backfill] reached the ${MAX_TRACES}-trace limit (~${migratedSoFar}); ` +
            `earliest migrated timestamp ${formatDateTime64(from)}. ${manualCommandHint(w)}`
        );
        return;
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
};

// The lock MUST be acquired atomically. `traces_agg` sums, so two replicas
// walking the same windows concurrently permanently inflate every trace's
// tokens/costs — and the destination anti-join canNOT save us there: both
// replicas read the destination for the same window before either's insert
// lands, so both see it absent and both write (verified end-to-end: 128 of 140
// traces doubled to 200 tokens). exists()-then-set() has exactly that race,
// hence `tryAcquireLock` (SET NX EX). The anti-join still runs on every window,
// but its job is sequential overlap — live ingest, un-drained old pods, a
// previous partial run — not concurrency.
//
// Deliberately NO SIGTERM/SIGINT/exit handlers. Registering a signal listener
// SUPPRESSES Node's default terminate (verified with plain node: a process whose
// only SIGTERM listener doesn't call process.exit stays alive and ignores the
// signal). Next installs its own SIGTERM/SIGINT cleanup that exits 143/130, but
// only when NEXT_MANUAL_SIG_HANDLE is unset — so a listener here would strand
// the pod on shutdown in the manual-handle configuration. Releasing the lock a
// few minutes early isn't worth that risk; the TTL covers a pod that dies.
export const startTracesAggBackfill = async (): Promise<void> => {
  const lockToken = await cache.tryAcquireLock(LOCK_KEY, LOCK_TTL_SECONDS);
  if (!lockToken) {
    console.log("[traces-agg-backfill] another replica holds the lock; skipping");
    return;
  }

  // A lease can lapse while its holder is still working (a stalled ClickHouse
  // insert outlasting the TTL). Renew and release are therefore token-guarded:
  // an un-guarded `expire`/`remove` would let the lapsed holder EXTEND and then
  // DELETE the successor's lock — the deletion being the dangerous half, since it
  // re-opens the gate for a third replica while two runs are already in flight
  // (both verified). `lostLease` also makes the stalled run STOP at its next
  // window instead of writing under someone else's lease.
  let lostLease = false;
  const renew = setInterval(() => {
    void cache
      .renewLockIfHeld(LOCK_KEY, lockToken, LOCK_TTL_SECONDS)
      .then((held) => {
        if (!held && !lostLease) {
          lostLease = true;
          console.warn(
            "[traces-agg-backfill] lock lease expired and was taken over; stopping. " +
              "Remaining history is migrated by whichever replica now holds the lock, or on the next boot."
          );
        }
      })
      .catch(() => {});
  }, LOCK_RENEW_INTERVAL_MS);
  // Don't hold the event loop open on account of the renew timer.
  renew.unref?.();

  try {
    await runBackfill(new Date(), () => lostLease);
  } catch {
    // runBackfill already logged the resume point and the manual hint.
  } finally {
    clearInterval(renew);
    await cache.releaseLockIfHeld(LOCK_KEY, lockToken).catch(() => {});
  }
};
