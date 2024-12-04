import { ClickHouseClient } from "@clickhouse/client";

import { EvaluationTimeProgression } from "../evaluation/types";
import { Feature, isFeatureEnabled } from "../features/features";
import { addTimeRangeToQuery, AggregationFunction, aggregationFunctionToCh, TimeRange } from "./utils";

export const getEvaluationTimeProgression = async (
  clickhouseClient: ClickHouseClient,
  projectId: string,
  groupId: string,
  timeRange: TimeRange,
  aggregationFunction: AggregationFunction,
): Promise<EvaluationTimeProgression[]> => {
  if (!isFeatureEnabled(Feature.FULL_BUILD)) {
    return [];
  }
  const query = `WITH base AS (
  SELECT
    evaluation_id,
    timestamp,
    name,
    ${aggregationFunctionToCh(aggregationFunction)}(value) AS value
  FROM evaluation_scores
  WHERE project_id = {projectId: UUID} AND group_id = {groupId: String}`;
  const queryWithTimeRange = addTimeRangeToQuery(query, timeRange, 'timestamp');
  const finalQuery = `${queryWithTimeRange} GROUP BY evaluation_id, name, timestamp ORDER BY timestamp, name
  ) SELECT groupArray(name) names, groupArray(value) values, MIN(timestamp) timestamp, evaluation_id as evaluationId
   FROM base
   GROUP BY evaluation_id
   ORDER BY timestamp`;
  const result = await clickhouseClient.query({
    query: finalQuery,
    format: 'JSONEachRow',
    query_params: {
      projectId,
      groupId,
    },
  });
  return await result.json();
};
