import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import {
  deriveEvaluationStatus,
  evaluationStaleBefore,
  type EvaluationStatus,
  type EvaluationStatusCounts,
} from "@/lib/evaluation/status";

const COMPLETE_PRED = `
  trace_status = 'error'
  OR (scores != '' AND scores != '{}')
`;

const EMPTY_COUNTS: EvaluationStatusCounts = { total: 0, errored: 0, complete: 0, stale: 0 };

export type EvaluationRunStats = EvaluationStatusCounts & { status: EvaluationStatus | null };

export const GetEvaluationRunStatsSchema = z.object({
  projectId: z.guid(),
  evaluationIds: z.array(z.guid()).min(1).max(100),
});

export const getEvaluationRunStats = async (
  projectId: string,
  evaluationIds: string[]
): Promise<Map<string, EvaluationRunStats>> => {
  const stats = new Map<string, EvaluationRunStats>();
  if (evaluationIds.length === 0) return stats;

  const rows = await executeQuery<{
    evaluationId: string;
    total: number;
    errored: number;
    complete: number;
    stale: number;
  }>({
    projectId,
    query: `
      SELECT
        evaluation_id AS evaluationId,
        toFloat64(count()) AS total,
        toFloat64(countIf(trace_status = 'error')) AS errored,
        toFloat64(countIf(${COMPLETE_PRED})) AS complete,
        toFloat64(countIf(
          NOT (${COMPLETE_PRED})
          AND updated_at < toDateTime64({staleBefore:String}, 9, 'UTC')
        )) AS stale
      FROM evaluation_datapoints
      WHERE evaluation_id IN {evaluationIds:Array(UUID)}
      GROUP BY evaluation_id
    `,
    parameters: {
      projectId,
      evaluationIds,
      staleBefore: evaluationStaleBefore(),
    },
  });

  for (const row of rows) {
    const counts: EvaluationStatusCounts = {
      total: Number(row.total) || 0,
      errored: Number(row.errored) || 0,
      complete: Number(row.complete) || 0,
      stale: Number(row.stale) || 0,
    };
    stats.set(row.evaluationId, { ...counts, status: deriveEvaluationStatus(counts) });
  }

  for (const id of evaluationIds) {
    if (stats.has(id)) continue;
    stats.set(id, { ...EMPTY_COUNTS, status: null });
  }

  return stats;
};
