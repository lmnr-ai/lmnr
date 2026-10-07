import { executeQuery } from "@/lib/actions/sql";
import { type AggregationFunction } from "@/lib/clickhouse/types";

import { aggregateScore, type ScoreAggregation } from "../evaluation/aggregation";
import { type EvaluationTimeProgression } from "../evaluation/types";

// Map the uppercase wire enum onto the shared aggregation kinds. Keeps the group
// progression and the single-eval shields on identical formulas (incl. quantiles).
const AGGREGATION_KIND: Record<AggregationFunction, ScoreAggregation> = {
  AVG: "avg",
  SUM: "sum",
  MIN: "min",
  MAX: "max",
  MEDIAN: "median",
  p90: "p90",
  p95: "p95",
  p99: "p99",
} as Record<AggregationFunction, ScoreAggregation>;

export const getEvaluationTimeProgression = async (
  projectId: string,
  groupId: string,
  aggregationFunction: AggregationFunction,
  // Omit/empty ⇒ every run in the group (the chart shows the whole group's
  // trend, not just the table's loaded page). Scoped by id only when provided.
  ids?: string[]
): Promise<EvaluationTimeProgression[]> => {
  const scopeById = !!ids && ids.length > 0;
  // Query all datapoints with their scores for the given evaluations
  const datapoints = await executeQuery<{
    evaluation_id: string;
    created_at: string;
    scores: string;
  }>({
    projectId,
    query: `
      SELECT
        evaluation_id,
        created_at,
        scores
      FROM evaluation_datapoints FINAL
      WHERE group_id = {groupId: String}
        ${scopeById ? "AND evaluation_id IN {ids: Array(UUID)}" : ""}
      ORDER BY created_at ASC
    `,
    parameters: {
      projectId,
      groupId,
      ...(scopeById ? { ids } : {}),
    },
  });

  // Group by evaluation_id and aggregate scores in memory
  const evaluationMap = new Map<
    string,
    {
      timestamp: string;
      scoresByName: Map<string, number[]>;
    }
  >();

  for (const dp of datapoints) {
    const scores = (dp.scores ? JSON.parse(dp.scores) : {}) as Record<string, number | null>;

    if (!evaluationMap.has(dp.evaluation_id)) {
      evaluationMap.set(dp.evaluation_id, {
        timestamp: dp.created_at,
        scoresByName: new Map(),
      });
    }

    const evalData = evaluationMap.get(dp.evaluation_id)!;

    // Aggregate scores by name
    for (const [name, value] of Object.entries(scores)) {
      if (value !== null && !isNaN(value)) {
        if (!evalData.scoresByName.has(name)) {
          evalData.scoresByName.set(name, []);
        }
        evalData.scoresByName.get(name)!.push(value);
      }
    }
  }

  // Apply aggregation function and format results
  const results: EvaluationTimeProgression[] = [];

  for (const [evaluationId, evalData] of evaluationMap.entries()) {
    const names: string[] = [];
    const values: string[] = [];

    for (const [name, scoreValues] of evalData.scoresByName.entries()) {
      if (scoreValues.length === 0) continue;

      const kind = AGGREGATION_KIND[aggregationFunction] ?? "avg";
      const aggregatedValue = aggregateScore(scoreValues, kind) ?? 0;

      names.push(name);
      values.push(String(aggregatedValue));
    }

    results.push({
      evaluationId,
      timestamp: evalData.timestamp,
      names,
      values,
    });
  }

  // Sort by timestamp
  return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};
