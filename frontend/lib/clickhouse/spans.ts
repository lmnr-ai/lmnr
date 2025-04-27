import { clickhouseClient } from "@/lib/clickhouse/client";

import { GroupByInterval, truncateTimeMap } from "./modifiers";
import {
  MetricTimeValue,
  SpanMetric,
  SpanMetricGroupBy,
  SpanMetricType,
  SpanSearchType,
  SpanType,
} from "./types";
import {
  addTimeRangeToQuery,
  AggregationFunction,
  aggregationFunctionToCh,
  getTimeBounds,
  groupByTimeAbsoluteStatement,
  groupByTimeRelativeStatement,
  TimeRange,
} from "./utils";


const NULL_VALUE = "<null>";

const getMetricColumn = (metric: SpanMetric, aggregation: AggregationFunction) => {
  if (metric === SpanMetric.Count) {
    // other aggregations don't make sense for count
    return "COUNT(span_id)";
  }
  if (metric === SpanMetric.Latency) {
    return `${aggregationFunctionToCh(aggregation)}((toUnixTimestamp64Nano(end_time) - toUnixTimestamp64Nano(start_time)) / 1e9)`;
  }

  return `${aggregationFunctionToCh(aggregation)}(${metric})`;
};

export const getSpanMetricsOverTime = async (
  projectId: string,
  metric: SpanMetric,
  groupByInterval: GroupByInterval,
  timeRange: TimeRange,
  groupBy: SpanMetricGroupBy,
  aggregation: AggregationFunction
): Promise<MetricTimeValue<SpanMetricType>[]> => {
  const chRoundTime = truncateTimeMap[groupByInterval];

  const baseQuery = `WITH base AS (
  SELECT
    map(
      ${groupBy},
      ${getMetricColumn(metric, aggregation)}
    ) as value,
    ${chRoundTime}(start_time) as time
  FROM spans
  WHERE
    project_id = {projectId: UUID}
    AND ${groupBy} != {nullValue: String}
    AND span_type in {types: Array(UInt8)}`;
  const query = addTimeRangeToQuery(baseQuery, timeRange, "time");

  let groupByStatement: string;

  if ("pastHours" in timeRange) {
    if (timeRange.pastHours !== "all") {
      groupByStatement = groupByTimeRelativeStatement(timeRange.pastHours, groupByInterval, groupBy);
    } else {
      const bounds = await getTimeBounds(projectId, "spans", "start_time");
      groupByStatement = groupByTimeAbsoluteStatement(bounds[0], bounds[1], groupByInterval, groupBy);
    }
  } else {
    groupByStatement = groupByTimeAbsoluteStatement(timeRange.start, timeRange.end, groupByInterval, groupBy);
  }

  const finalQuery = `${query} ${groupByStatement})
  SELECT time, sumMap(value) AS value
  FROM base
  GROUP BY time
  ORDER BY time`;

  const result = await clickhouseClient.query({
    query: finalQuery,
    format: "JSONEachRow",
    query_params: {
      projectId,
      nullValue: NULL_VALUE,
      types: [SpanType.DEFAULT, SpanType.LLM],
    },
  });
  return await result.json();
};

export type SpanMetricSummary = {
  value: number;
} & Partial<Record<SpanMetric, string>>;

export const getSpanMetricsSummary = async (
  projectId: string,
  metric: SpanMetric,
  timeRange: TimeRange,
  groupBy: SpanMetricGroupBy,
  aggregation: AggregationFunction
): Promise<SpanMetricSummary[]> => {
  const baseQuery = `
  SELECT
      ${groupBy},
      ${getMetricColumn(metric, aggregation)} AS value
  FROM spans
  WHERE
    project_id = {projectId: UUID}
    AND ${groupBy} != {nullValue: String}
    AND span_type in {types: Array(UInt8)}`;
  const query = addTimeRangeToQuery(baseQuery, timeRange, "start_time");

  const finalQuery = `${query} GROUP BY ${groupBy} ORDER BY value DESC`;

  const result = await clickhouseClient.query({
    query: finalQuery,
    format: "JSONEachRow",
    query_params: {
      projectId,
      nullValue: NULL_VALUE,
      types: [SpanType.DEFAULT, SpanType.LLM],
    },
  });
  return await result.json();
};

export const getSpansCountInProject = async (projectId: string): Promise<{ count: number }[]> => {
  const query = `
    SELECT
      count(*) as count
    FROM spans
    WHERE project_id = {projectId: UUID}
  `;

  const result = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
    query_params: {
      projectId,
    },
  });

  return await result.json();
};

const DEFAULT_LIMIT: number = 200;

export const searchSpans = async ({
  projectId,
  searchQuery,
  timeRange,
  searchType,
  traceId,
}: {
  projectId?: string,
  searchQuery: string,
  timeRange: TimeRange,
  searchType?: SpanSearchType[],
  traceId?: string,
}): Promise<{
  spanIds: Set<string>;
  traceIds: Set<string>;
}> => {
  const baseQuery = `
    SELECT span_id spanId, trace_id traceId FROM spans
    WHERE
      1 = 1
      ${projectId ? `AND project_id = {projectId: UUID}` : ""}
      AND (
        ${searchTypeToQueryFilter(searchType, "query")}
      )
      ${traceId ? `AND trace_id = {traceId: String}` : ""}
  `;

  const query = addTimeRangeToQuery(baseQuery, timeRange, "start_time");

  const response = await clickhouseClient.query({
    query: `${query} LIMIT ${DEFAULT_LIMIT}`,
    format: "JSONEachRow",
    query_params: {
      projectId,
      query: `%${searchQuery.toLowerCase()}%`,
      traceId,
    },
  });

  const result = (await response.json()) as { spanId: string; traceId: string }[];
  const traceIds = new Set<string>();
  const spanIds = new Set<string>();
  result.forEach((r) => {
    traceIds.add(r.traceId);
    spanIds.add(r.spanId);
  });
  return { traceIds, spanIds };
};

export const getLabelMetricsOverTime = async (
  projectId: string,
  groupByInterval: GroupByInterval,
  timeRange: TimeRange
): Promise<MetricTimeValue<number>[]> => {
  const chRoundTime = truncateTimeMap[groupByInterval];

  const baseQuery = `WITH base AS (
    SELECT
      ${chRoundTime}(created_at) as time,
                       count(*) as value
                     FROM default.labels
                     WHERE project_id = {projectId: UUID}`;

  const query = addTimeRangeToQuery(baseQuery, timeRange, "created_at");

  let groupByStatement: string;

  if ("pastHours" in timeRange) {
    if (timeRange.pastHours !== "all") {
      groupByStatement = groupByTimeRelativeStatement(timeRange.pastHours, groupByInterval, "time");
    } else {
      const bounds = await getTimeBounds(projectId, "default.labels", "created_at");
      groupByStatement = groupByTimeAbsoluteStatement(bounds[0], bounds[1], groupByInterval, "time");
    }
  } else {
    groupByStatement = groupByTimeAbsoluteStatement(timeRange.start, timeRange.end, groupByInterval, "time");
  }

  const finalQuery = `${query} 
    GROUP BY time)
  SELECT 
    time,
    toUInt32(any(COALESCE(value, 0))) as value
  FROM base
  ${groupByStatement}`;

  const result = await clickhouseClient.query({
    query: finalQuery,
    format: "JSONEachRow",
    query_params: {
      projectId,
    },
  });

  return await result.json();
};

const searchTypeToQueryFilter = (searchType?: SpanSearchType[], queryParamName: string = "query"): string => {
  const uniqueSearchTypes = Array.from(new Set(searchType));
  const searchBoth = `input_lower LIKE {${queryParamName}: String} OR output_lower LIKE {${queryParamName}: String}`;
  if (uniqueSearchTypes.length === 0) {
    return searchBoth;
  }
  if (uniqueSearchTypes.length === 1) {
    const searchType = uniqueSearchTypes[0];
    switch (searchType) {
      case SpanSearchType.Input:
        return `input_lower LIKE {${queryParamName}: String}`;
      case SpanSearchType.Output:
        return `output_lower LIKE {${queryParamName}: String}`;
      default:
        return searchBoth;
    }
  }
  return searchBoth;
};
