/**
 * Eval-level run status, derived from aggregates over the eval's ClickHouse
 * datapoints (LAM-2062).
 *
 * A datapoint is COMPLETE when both halves have landed: its trace's root span
 * (`top_span_id` is non-nil) and its scores (`scores` is a non-empty JSON
 * object). The two arrive on independent paths — scores via the SDK's
 * `POST /v1/evals/{id}/datapoints` update, the root span via trace ingestion —
 * so "some rooted, some scored" is a normal intermediate state, not a bug.
 *
 * The hard constraint shaping these states: there is NO expected-datapoint
 * count anywhere. `evaluations` (Postgres) stores only id/name/group/metadata,
 * and the SDK never declares how many datapoints a run will produce. So "all
 * datapoints arrived" is unknowable — we can only see the rows that exist. That
 * is why a pure finished/in-progress split is not enough: an eval whose process
 * crashed mid-run is indistinguishable from one still working, EXCEPT by
 * staleness. Hence the `incomplete` state, split off `running` purely by how
 * long it has been since anything last changed.
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
  /** Every datapoint is rooted + scored, but at least one trace errored. */
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
  const { total, rooted, scored, errored, lastUpdatedAt } = counts;

  if (total <= 0) return "empty";

  // An errored trace never produces a root span, so it can't reach `rooted`.
  // Counting it as settled is what lets an all-failed run terminate instead of
  // spinning as `running` forever.
  const settled = Math.min(total, Math.max(rooted, 0) + Math.max(errored, 0));
  const complete = settled >= total && Math.max(scored, 0) >= total;

  if (complete) return errored > 0 ? "finishedWithErrors" : "finished";

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
