export type EvaluationStatus = "running" | "incomplete" | "complete" | "completeWithErrors";
export type EvalDatapointStatus = "error" | "running" | "stale" | "complete";

export type EvaluationStatusCounts = {
  total: number;
  errored: number;
  /** Has scores OR errored. Per-row — summing the two would double-count. */
  complete: number;
  stale: number;
};

/** 1 hour. `updated_at` is not bumped by span ingest. */
export const EVALUATION_STALE_AFTER_MS = 60 * 60 * 1000;

export const evaluationStaleBefore = (now: number = Date.now()): string =>
  new Date(now - EVALUATION_STALE_AFTER_MS).toISOString().replace("T", " ").replace("Z", "");

const datapointHasError = (row: Record<string, unknown>): boolean => row["traceStatus"] === "error";

/** Ignore `score:*` when the scores blob is present — extract returns 0 for missing keys. */
const datapointHasScores = (row: Record<string, unknown>): boolean => {
  const scores = row["scores"];
  if (typeof scores === "string") {
    const trimmed = scores.trim();
    return trimmed.length > 0 && trimmed !== "{}";
  }
  if (scores != null && typeof scores === "object" && !Array.isArray(scores)) {
    return Object.keys(scores).length > 0;
  }
  if (scores == null) {
    return Object.keys(row).some(
      (k) => k.startsWith("score:") && typeof row[k] === "number" && Number.isFinite(row[k])
    );
  }
  return false;
};

export const deriveDatapointStatus = (row: Record<string, unknown>, now: number = Date.now()): EvalDatapointStatus => {
  if (datapointHasError(row)) return "error";
  if (datapointHasScores(row)) return "complete";

  const raw = row["updatedAt"] ?? row["createdAt"];
  const lastUpdate = typeof raw === "string" ? Date.parse(raw) : NaN;
  if (!Number.isFinite(lastUpdate)) return "running";
  return now - lastUpdate > EVALUATION_STALE_AFTER_MS ? "stale" : "running";
};

export const deriveEvaluationStatus = (counts: EvaluationStatusCounts): EvaluationStatus | null => {
  const total = Math.max(0, counts.total);
  const complete = Math.min(total, Math.max(0, counts.complete));
  const stale = Math.min(total - complete, Math.max(0, counts.stale ?? 0));
  const pending = total - complete - stale;
  const errored = Math.max(0, counts.errored);

  if (total <= 0) return null;
  if (complete >= total) return errored > 0 ? "completeWithErrors" : "complete";
  if (pending > 0) return "running";
  return "incomplete";
};

export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  running: "In progress",
  incomplete: "Incomplete",
  complete: "Complete",
  completeWithErrors: "Complete with errors",
};

export const DATAPOINT_STATUS_LABELS: Record<EvalDatapointStatus, string> = {
  complete: "Complete",
  running: "In progress",
  stale: "Stale",
  error: "Error",
};

export const EVALUATION_STATUSES: EvaluationStatus[] = ["running", "incomplete", "complete", "completeWithErrors"];

export type EvaluationDatapointBuckets = {
  total: number;
  complete: number;
  inProgress: number;
  stale: number;
  errored: number;
};

export const datapointBuckets = (
  counts: Pick<EvaluationStatusCounts, "total" | "complete" | "errored"> & { stale?: number }
): EvaluationDatapointBuckets => {
  const total = Math.max(0, counts.total);
  const settled = Math.min(total, Math.max(0, counts.complete));
  const errored = Math.min(settled, Math.max(0, counts.errored));
  const stale = Math.min(total - settled, Math.max(0, counts.stale ?? 0));
  return {
    total,
    complete: settled - errored,
    inProgress: total - settled - stale,
    stale,
    errored,
  };
};
