import { clickhouseClient } from "@/lib/clickhouse/client";
import { type AggregationFunction } from "@/lib/clickhouse/types";

import { type EvaluationTimeProgression } from "../evaluation/types";
import { aggregationFunctionToCh } from "./utils";

export const getEvaluationTimeProgression = async (
  projectId: string,
  groupId: string,
  aggregationFunction: AggregationFunction,
  ids: string[]
): Promise<EvaluationTimeProgression[]> => {
  const query = `WITH base AS (
  SELECT
    evaluation_id,
    min(timestamp) as timestamp,
    name,
    ${aggregationFunctionToCh(aggregationFunction)}(value) AS value
  FROM evaluation_scores
  WHERE project_id = {projectId: UUID} AND group_id = {groupId: String} and evaluation_id in {ids: Array(UUID)} AND evaluation_scores.value IS NOT NULL`;

  const finalQuery = `${query} GROUP BY evaluation_id, name ORDER BY name
  ) SELECT groupArray(name) names, groupArray(value) values, MIN(timestamp) timestamp, evaluation_id as evaluationId
   FROM base
   GROUP BY evaluation_id
   ORDER BY timestamp`;

  const result = await clickhouseClient.query({
    query: finalQuery,
    format: "JSONEachRow",
    query_params: {
      projectId,
      groupId,
      ids,
    },
  });
  return await result.json();
};
