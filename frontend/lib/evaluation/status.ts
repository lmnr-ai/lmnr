/**
 * Eval-level run status, derived from aggregates over the eval's ClickHouse
 * datapoints (LAM-2062).
 *
 * A datapoint is COMPLETE when it has both halves (root span + scores) OR its
 * trace errored. Error is terminal — evaluators often never run, so waiting on
 * scores would leave a failed run stuck in `incomplete`. Scores can still land
 * on an errored datapoint (child-span exception, executor kept going); that
 * stays `finishedWithErrors`.
 *
 * There is NO expected-datapoint count. `evaluations` (Postgres) stores only
 * id/name/group/metadata, and the SDK never declares how many datapoints a run
 * will produce. A crashed mid-run eval is indistinguishable from a live one
 * except by staleness — hence `incomplete`, split off `running` by how long
 * since anything last changed.
 */
export type EvaluationStatus =
  /** No datapoints at all. The run was registered but never saved anything. */
  | "empty"
  /** Datapoints still missing a root span and/or scores, changed recently. */
  | "running"
  /** Same gaps, but nothing has changed in a while — the run likely died. */
  | "incomplete"
  /** Every datapoint is rooted + scored, and no trace errored. */
  | "finished"
  /** Every datapoint settled (rooted+scored, or errored). At least one error. */
  | "finishedWithErrors";

/** Per-eval datapoint counters, as aggregated in ClickHouse. */
export type EvaluationStatusCounts = {
  /** Total datapoints. */
  total: number;
  /** Datapoints whose trace root span has arrived. */
  rooted: number;
  /** Datapoints carrying a non-empty scores object. */
  scored: number;
  /** Datapoints whose trace resolved to an error status. */
  errored: number;
  /**
   * Datapoints that are done: (rooted AND scored) OR errored.
   * Per-row in ClickHouse — `scored + errored` double-counts overlap.
   */
  complete: number;
  /** Most recent datapoint write, ISO string. Absent when there are none. */
  lastUpdatedAt?: string | null;
};

/**
 * How long an eval with missing root spans / scores must sit unchanged before
 * it reads as `incomplete` rather than `running`.
 *
 * Deliberately generous: `updated_at` is bumped by datapoint writes (the SDK
 * saving a datapoint or patching in its scores) but NOT by trace ingestion, so
 * a run that has already saved every datapoint and is only waiting on spans
 * shows no activity at all while it waits. Too short a window would flag
 * healthy runs as dead; too long would leave a crashed run spinning forever.
 */
export const EVALUATION_STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * Collapse the counters into one status. `now` is injectable so the staleness
 * boundary is testable.
 */
export const deriveEvaluationStatus = (counts: EvaluationStatusCounts, now: number = Date.now()): EvaluationStatus => {
  const { total, complete, errored, lastUpdatedAt } = counts;

  if (total <= 0) return "empty";

  if (Math.min(total, Math.max(complete, 0)) >= total) {
    return errored > 0 ? "finishedWithErrors" : "finished";
  }

  const lastUpdate = lastUpdatedAt ? Date.parse(lastUpdatedAt) : NaN;
  // Unparseable / absent timestamp: prefer `running`, the non-alarming read.
  if (!Number.isFinite(lastUpdate)) return "running";

  return now - lastUpdate > EVALUATION_STALE_AFTER_MS ? "incomplete" : "running";
};

export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  empty: "No datapoints",
  running: "In progress",
  incomplete: "Incomplete",
  finished: "Finished",
  finishedWithErrors: "Finished with errors",
};

/** Every status value, in lifecycle order — drives the filter's value list. */
export const EVALUATION_STATUSES: EvaluationStatus[] = [
  "empty",
  "running",
  "incomplete",
  "finished",
  "finishedWithErrors",
];
