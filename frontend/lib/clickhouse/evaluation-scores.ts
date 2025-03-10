import { clickhouseClient } from "@/lib/clickhouse/client";

import { EvaluationTimeProgression } from "../evaluation/types";
import { addTimeRangeToQuery, AggregationFunction, aggregationFunctionToCh, TimeRange } from "./utils";

export const getEvaluationTimeProgression = async (
  projectId: string,
  groupId: string,
  timeRange: TimeRange,
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
  WHERE project_id = {projectId: UUID} AND group_id = {groupId: String} and evaluation_id in {ids: Array(UUID)}`;
  const queryWithTimeRange = addTimeRangeToQuery(query, timeRange, "timestamp");

  const finalQuery = `${queryWithTimeRange} GROUP BY evaluation_id, name ORDER BY name
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
