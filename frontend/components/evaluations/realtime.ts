import { deriveEvaluationStatus, type EvaluationStatusCounts } from "@/lib/evaluation/status";
import { type Evaluation } from "@/lib/evaluation/types";

export const EMPTY_STATUS_COUNTS: EvaluationStatusCounts = { total: 0, complete: 0, errored: 0, stale: 0 };

export type EvaluationListDatapoint = {
  id: string;
  index?: number;
  scores?: string;
};

const datapointHasScores = (scores: unknown): boolean => {
  if (typeof scores !== "string") return false;
  const trimmed = scores.trim();
  if (!trimmed || trimmed === "{}" || trimmed === "[]" || trimmed === "null") return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    return Object.values(parsed as Record<string, unknown>).some(
      (value) => typeof value === "number" && Number.isFinite(value)
    );
  } catch {
    return false;
  }
};

const withCounts = (row: Evaluation, counts: EvaluationStatusCounts): Evaluation => ({
  ...row,
  dataPointsCount: counts.total,
  statusCounts: counts,
  status: deriveEvaluationStatus(counts),
});

/** Insert a newly created run at the top. No-op for a different group or a duplicate id. */
export const applyEvaluationCreated = (
  rows: Evaluation[],
  incoming: Evaluation,
  groupId: string | null
): Evaluation[] => {
  if (groupId != null && incoming.groupId !== groupId) return rows;
  if (rows.some((r) => r.id === incoming.id)) return rows;
  return [withCounts(incoming, incoming.statusCounts ?? EMPTY_STATUS_COUNTS), ...rows];
};

/**
 * Fold one datapoint upsert into a run's counters.
 *
 * `index` is present on inserts and omitted on score/output updates. A delayed
 * SSE for a datapoint already in the fetched `total` has `index < total` and
 * must not increment — the next stats reconcile is the source of truth for
 * complete/errored/stale.
 */
export const applyDatapointUpsertToEvaluation = (row: Evaluation, datapoint: EvaluationListDatapoint): Evaluation => {
  const counts = row.statusCounts ?? EMPTY_STATUS_COUNTS;
  const total = Math.max(0, counts.total);
  const hasIndex = typeof datapoint.index === "number" && Number.isFinite(datapoint.index);
  const isNew = hasIndex && (datapoint.index as number) >= total;
  if (!isNew) return row;

  const nextTotal = Math.max(total + 1, (datapoint.index as number) + 1);
  const nextComplete = datapointHasScores(datapoint.scores) ? counts.complete + 1 : counts.complete;
  return withCounts(row, { ...counts, total: nextTotal, complete: nextComplete });
};

export const applyDatapointUpsertsToRows = (
  rows: Evaluation[],
  evaluationId: string,
  groupId: string | undefined,
  currentGroupId: string | null,
  datapoints: EvaluationListDatapoint[]
): Evaluation[] => {
  if (groupId != null && currentGroupId != null && groupId !== currentGroupId) return rows;
  const idx = rows.findIndex((r) => r.id === evaluationId);
  if (idx === -1) return rows;

  let next = rows[idx];
  for (const datapoint of datapoints) {
    next = applyDatapointUpsertToEvaluation(next, datapoint);
  }
  if (next === rows[idx]) return rows;
  const out = [...rows];
  out[idx] = next;
  return out;
};

export const applyRunStats = (row: Evaluation, stats: EvaluationStatusCounts): Evaluation =>
  withCounts(row, {
    total: stats.total,
    complete: stats.complete,
    errored: stats.errored,
    stale: stats.stale,
  });

export const applyRunStatsToRows = (
  rows: Evaluation[],
  statsById: Record<string, EvaluationStatusCounts>
): Evaluation[] => {
  let changed = false;
  const next = rows.map((row) => {
    const stats = statsById[row.id];
    if (!stats) return row;
    changed = true;
    return applyRunStats(row, stats);
  });
  return changed ? next : rows;
};
