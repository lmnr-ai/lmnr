import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import {
  deriveEvaluationStatus,
  evaluationStaleBefore,
  type EvaluationStatus,
  type EvaluationStatusCounts,
} from "@/lib/evaluation/status";
import { type EvaluationTotals } from "@/lib/evaluation/types";

const COMPLETE_PRED = `
  trace_status = 'error'
  OR (scores != '' AND scores != '{}')
`;

const EMPTY_COUNTS: EvaluationStatusCounts = { total: 0, errored: 0, complete: 0, stale: 0 };

const EMPTY_TOTALS: EvaluationTotals = {
  datapointCount: 0,
  inputCost: 0,
  outputCost: 0,
  totalCost: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  reasoningTokens: 0,
  totalDuration: 0,
};

export type EvaluationRunStats = EvaluationStatusCounts & {
  status: EvaluationStatus | null;
  totals: EvaluationTotals;
};

const num = (v: unknown): number => Number(v) || 0;

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
    inputCost: number;
    outputCost: number;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    reasoningTokens: number;
    totalDuration: number;
  }>({
    projectId,
    query: `
      SELECT
        evaluation_id AS evaluationId,
        count() AS total,
        countIf(trace_status = 'error') AS errored,
        countIf(${COMPLETE_PRED}) AS complete,
        countIf(
          NOT (${COMPLETE_PRED})
          AND updated_at < toDateTime64({staleBefore:String}, 9, 'UTC')
        ) AS stale,
        sum(input_cost) AS inputCost,
        sum(output_cost) AS outputCost,
        sum(total_cost) AS totalCost,
        sum(input_tokens) AS inputTokens,
        sum(output_tokens) AS outputTokens,
        sum(total_tokens) AS totalTokens,
        sum(cache_read_input_tokens) AS cacheReadInputTokens,
        sum(cache_creation_input_tokens) AS cacheCreationInputTokens,
        sum(reasoning_tokens) AS reasoningTokens,
        sum(toFloat64(duration)) AS totalDuration
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
      total: num(row.total),
      errored: num(row.errored),
      complete: num(row.complete),
      stale: num(row.stale),
    };
    stats.set(row.evaluationId, {
      ...counts,
      status: deriveEvaluationStatus(counts),
      totals: {
        datapointCount: counts.total,
        inputCost: num(row.inputCost),
        outputCost: num(row.outputCost),
        totalCost: num(row.totalCost),
        inputTokens: num(row.inputTokens),
        outputTokens: num(row.outputTokens),
        totalTokens: num(row.totalTokens),
        cacheReadInputTokens: num(row.cacheReadInputTokens),
        cacheCreationInputTokens: num(row.cacheCreationInputTokens),
        reasoningTokens: num(row.reasoningTokens),
        totalDuration: num(row.totalDuration),
      },
    });
  }

  for (const id of evaluationIds) {
    if (stats.has(id)) continue;
    stats.set(id, { ...EMPTY_COUNTS, status: null, totals: EMPTY_TOTALS });
  }

  return stats;
};
