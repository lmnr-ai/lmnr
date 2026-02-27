import { executeQuery } from "@/lib/actions/sql";
import { type AggregationFunction } from "@/lib/clickhouse/types";
import { type EvaluationTimeProgression } from "@/lib/evaluation/types";

export const getEvaluationTimeProgression = async (
  projectId: string,
  groupId: string,
  aggregationFunction: AggregationFunction,
  ids: string[]
): Promise<EvaluationTimeProgression[]> => {
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
        AND evaluation_id IN {ids: Array(UUID)}
      ORDER BY created_at ASC
    `,
    parameters: {
      projectId,
      groupId,
      ids,
    },
  });

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

    for (const [name, value] of Object.entries(scores)) {
      if (value !== null && !isNaN(value)) {
        if (!evalData.scoresByName.has(name)) {
          evalData.scoresByName.set(name, []);
        }
        evalData.scoresByName.get(name)!.push(value);
      }
    }
  }

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

  return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};
