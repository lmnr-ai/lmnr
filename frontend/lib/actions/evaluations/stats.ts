import { executeQuery } from "@/lib/actions/sql";
import { deriveEvaluationStatus, type EvaluationStatus, type EvaluationStatusCounts } from "@/lib/evaluation/status";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export type EvaluationRunStats = EvaluationStatusCounts & { status: EvaluationStatus };

/**
 * Per-eval datapoint counters for a set of evaluation ids: the datapoint count
 * plus the three completion axes the run status is derived from (root span
 * arrived, scores arrived, trace errored) and the last write time.
 *
 * One grouped ClickHouse query, always scoped to an explicit id list — this
 * runs per table page, so it must never be unbounded. The counters ride the
 * same aggregate as the count so adding status costs no extra round-trip and no
 * extra rows read (measured identical).
 */
export const getEvaluationRunStats = async (
  projectId: string,
  evaluationIds: string[]
): Promise<Map<string, EvaluationRunStats>> => {
  const stats = new Map<string, EvaluationRunStats>();
  if (evaluationIds.length === 0) return stats;

  const rows = await executeQuery<{
    evaluationId: string;
    total: number;
    rooted: number;
    scored: number;
    errored: number;
    lastUpdatedAt: string;
  }>({
    projectId,
    query: `
      SELECT
        evaluation_id AS evaluationId,
        toFloat64(count()) AS total,
        toFloat64(countIf(top_span_id != {nilUuid:UUID})) AS rooted,
        toFloat64(countIf(scores != '' AND scores != '{}')) AS scored,
        toFloat64(countIf(trace_status = 'error')) AS errored,
        formatDateTime(max(updated_at), '%Y-%m-%dT%H:%i:%S.%fZ') AS lastUpdatedAt
      FROM evaluation_datapoints
      WHERE evaluation_id IN {evaluationIds:Array(UUID)}
      GROUP BY evaluation_id
    `,
    parameters: { projectId, evaluationIds, nilUuid: NIL_UUID },
  });

  for (const row of rows) {
    const counts: EvaluationStatusCounts = {
      total: Number(row.total) || 0,
      rooted: Number(row.rooted) || 0,
      scored: Number(row.scored) || 0,
      errored: Number(row.errored) || 0,
      lastUpdatedAt: row.lastUpdatedAt,
    };
    stats.set(row.evaluationId, { ...counts, status: deriveEvaluationStatus(counts) });
  }

  // Evals with no datapoints produce no group — surface them as `empty` rather
  // than leaving the caller to guess from a missing key.
  for (const id of evaluationIds) {
    if (stats.has(id)) continue;
    const counts: EvaluationStatusCounts = { total: 0, rooted: 0, scored: 0, errored: 0, lastUpdatedAt: null };
    stats.set(id, { ...counts, status: deriveEvaluationStatus(counts) });
  }

  return stats;
};
