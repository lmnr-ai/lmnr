import { and, desc, eq, inArray } from "drizzle-orm";

import { executeQuery } from "@/lib/actions/sql";
import { type AggregationFunction } from "@/lib/clickhouse/types";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";

import { type EvaluationTimeProgression } from "../evaluation/types";

// The resolved ids travel to ClickHouse as a bound query parameter, which the
// client sends in the URI — past ~1450 ids the query fails with "uri too long".
// Cap well below that and keep the most recent runs (this is a time progression).
const MAX_PROGRESSION_RUNS = 1000;

export const getEvaluationTimeProgression = async (
  projectId: string,
  groupId: string,
  aggregationFunction: AggregationFunction,
  // Omit/empty ⇒ every run in the group (the chart shows the whole group's
  // trend, not just the table's loaded page). Scoped by id only when provided.
  ids?: string[]
): Promise<EvaluationTimeProgression[]> => {
  // Group membership lives in Postgres `evaluations.group_id`; datapoints only
  // carry `evaluation_id` (a sort-key prefix, unlike the old `group_id` scan).
  const groupRuns = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(
      and(
        eq(evaluations.projectId, projectId),
        eq(evaluations.groupId, groupId),
        ...(ids && ids.length > 0 ? [inArray(evaluations.id, ids)] : [])
      )
    )
    .orderBy(desc(evaluations.createdAt))
    .limit(MAX_PROGRESSION_RUNS);

  const evaluationIds = groupRuns.map((run) => run.id);
  if (evaluationIds.length === 0) return [];
  if (evaluationIds.length === MAX_PROGRESSION_RUNS) {
    console.warn(
      `Evaluation progression for group "${groupId}" capped at the ${MAX_PROGRESSION_RUNS} most recent runs.`
    );
  }

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
      WHERE evaluation_id IN {evaluationIds: Array(UUID)}
      ORDER BY created_at ASC
    `,
    parameters: {
      projectId,
      evaluationIds,
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

      let aggregatedValue: number;
      switch (aggregationFunction) {
        case "AVG":
          aggregatedValue = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
          break;
        case "SUM":
          aggregatedValue = scoreValues.reduce((a, b) => a + b, 0);
          break;
        case "MIN":
          aggregatedValue = Math.min(...scoreValues);
          break;
        case "MAX":
          aggregatedValue = Math.max(...scoreValues);
          break;
        case "MEDIAN":
          {
            const sorted = [...scoreValues].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            aggregatedValue = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
          }
          break;
        case "p90":
          {
            const sorted = [...scoreValues].sort((a, b) => a - b);
            const idx = Math.ceil(sorted.length * 0.9) - 1;
            aggregatedValue = sorted[Math.max(0, idx)];
          }
          break;
        case "p95":
          {
            const sorted = [...scoreValues].sort((a, b) => a - b);
            const idx = Math.ceil(sorted.length * 0.95) - 1;
            aggregatedValue = sorted[Math.max(0, idx)];
          }
          break;
        case "p99":
          {
            const sorted = [...scoreValues].sort((a, b) => a - b);
            const idx = Math.ceil(sorted.length * 0.99) - 1;
            aggregatedValue = sorted[Math.max(0, idx)];
          }
          break;
        default:
          aggregatedValue = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
      }

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
