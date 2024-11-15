import { ClickHouseClient } from "@clickhouse/client";
import { AggregationFunction, TimeRange, addTimeRangeToQuery, aggregationFunctionToCh } from "./utils";
import { EvaluationTimeProgression } from "../evaluation/types";
import { BucketRow } from "../types";
import { Feature } from "../features/features";
import { isFeatureEnabled } from "../features/features";

const DEFAULT_BUCKET_COUNT = 10;
const DEFAULT_LOWER_BOUND = 0;

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
