import { ClickHouseClient } from "@clickhouse/client";

import { Feature, isFeatureEnabled } from "../features/features";
import { GroupByInterval, truncateTimeMap } from "./modifiers";
import {
  addTimeRangeToQuery,
  AggregationFunction,
  aggregationFunctionToCh,
  getTimeBounds,
  groupByTimeAbsoluteStatement,
  groupByTimeRelativeStatement,
  TimeRange
} from "./utils";

export enum SpanMetricGroupBy {
  Model = 'model',
  Provider = 'provider',
  Path = 'path',
  Name = 'name',
}
export enum SpanType {
  DEFAULT = 0,
  LLM = 1,
  PIPELINE = 2,
  EXECUTOR = 3,
  EVALUATOR = 4,
  EVALUATION = 5,
}


export enum SpanMetric {
  Count = 'count',
  InputCost = 'input_cost',
  OutputCost = 'output_cost',
  TotalCost = 'total_cost',
  Latency = 'latency',
  InputTokens = 'input_tokens',
  OutputTokens = 'output_tokens',
  TotalTokens = 'total_tokens',
}

export type MetricTimeValue<T> = {
  time: string;
  value: T;
};

export type SpanMetricType = {
  [key: string]: number;
  timestamp: number; // unix timestamp in seconds
}

const NULL_VALUE = '<null>';

const getMetricColumn = (metric: SpanMetric, aggregation: AggregationFunction) => {
  if (metric === SpanMetric.Count) {
    // other aggregations don't make sense for count
    return 'COUNT(span_id)';
  }
  if (metric === SpanMetric.Latency) {
    return `${aggregationFunctionToCh(aggregation)}((toUnixTimestamp64Nano(end_time) - toUnixTimestamp64Nano(start_time)) / 1e9)`;
  }

  return `${aggregationFunctionToCh(aggregation)}(${metric})`;
};

export const getSpanMetricsOverTime = async (
  clickhouseClient: ClickHouseClient,
  projectId: string,
  metric: SpanMetric,
  groupByInterval: GroupByInterval,
  timeRange: TimeRange,
  groupBy: SpanMetricGroupBy,
  aggregation: AggregationFunction,
): Promise<MetricTimeValue<SpanMetricType>[]> => {
  if (!isFeatureEnabled(Feature.FULL_BUILD)) {
    return [];
  }

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
  const query = addTimeRangeToQuery(baseQuery, timeRange, 'time');

  let groupByStatement: string;

  if ('pastHours' in timeRange) {
    if (timeRange.pastHours !== 'all') {
      groupByStatement = groupByTimeRelativeStatement(timeRange.pastHours, groupByInterval, groupBy);
    } else {
      const bounds = await getTimeBounds(clickhouseClient, projectId, 'spans', 'start_time');
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
    format: 'JSONEachRow',
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
  clickhouseClient: ClickHouseClient,
  projectId: string,
  metric: SpanMetric,
  timeRange: TimeRange,
  groupBy: SpanMetricGroupBy,
  aggregation: AggregationFunction,
): Promise<SpanMetricSummary[]> => {
  if (!isFeatureEnabled(Feature.FULL_BUILD)) {
    return [];
  }

  const baseQuery = `
  SELECT
      ${groupBy},
      ${getMetricColumn(metric, aggregation)} AS value
  FROM spans
  WHERE
    project_id = {projectId: UUID}
    AND ${groupBy} != {nullValue: String}
    AND span_type in {types: Array(UInt8)}`;
  const query = addTimeRangeToQuery(baseQuery, timeRange, 'start_time');

  const finalQuery = `${query} GROUP BY ${groupBy} ORDER BY value DESC`;

  const result = await clickhouseClient.query({
    query: finalQuery,
    format: 'JSONEachRow',
    query_params: {
      projectId,
      nullValue: NULL_VALUE,
      types: [SpanType.DEFAULT, SpanType.LLM]
    },
  });
  return await result.json();
};
