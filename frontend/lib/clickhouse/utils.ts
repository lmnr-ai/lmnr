import { ClickHouseClient } from "@clickhouse/client";

import { chStepMap, GroupByInterval, intervalMap, truncateTimeMap } from "./modifiers";

interface TimeBounds {
  minTime: number;
  maxTime: number;
}

const NANOS_PER_MILLISECOND = 1e6;

export const dateToNanoseconds = (date: Date): number => date.getTime() * NANOS_PER_MILLISECOND;

export const nanosecondsToDate = (nanoseconds: number): Date => new Date(nanoseconds / NANOS_PER_MILLISECOND);

const validateSqlString = (str: string): boolean => /^[a-zA-Z0-9_\.]+$/.test(str);

type AbsoluteTimeRange = {
  start: Date;
  end: Date;
};

type RelativeTimeRange = {
  pastHours: number | 'all';
};

export type AggregationFunction = 'AVG' | 'SUM' | 'MIN' | 'MAX' | 'MEDIAN' | 'p90' | 'p95' | 'p99';

export const aggregationFunctionToCh = (f: AggregationFunction) => {
  switch (f) {
  case 'AVG': return 'avg';
  case 'SUM': return 'sum';
  case 'MIN': return 'min';
  case 'MAX': return 'max';
  case 'MEDIAN': return 'median';
  case 'p90': return 'quantileExact(0.90)';
  case 'p95': return 'quantileExact(0.95)';
  case 'p99': return 'quantileExact(0.99)';
  default: throw new Error(`Invalid aggregation function: ${f}`);
  }
};

export type TimeRange = AbsoluteTimeRange | RelativeTimeRange;

export const getTimeRange = (
  pastHours: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
): TimeRange => {
  if (pastHours) {
    if (pastHours === 'all') {
      return { pastHours: 'all' };
    }
    return { pastHours: parseInt(pastHours) };
  }
  if (startDate && endDate) {
    return { start: new Date(startDate), end: new Date(endDate) };
  }
  throw new Error('Invalid time range');
};

export const addTimeRangeToQuery = (query: string, timeRange: TimeRange, column: string): string => {
  if (!validateSqlString(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
  if ('start' in timeRange && 'end' in timeRange) {
    return `${query}
      AND ${column} >= ${dateToNanoseconds(timeRange.start)}
      AND ${column} <= ${dateToNanoseconds(timeRange.end)}`;
  }
  if ('pastHours' in timeRange) {
    if (timeRange.pastHours === 'all') {
      return query;
    }
    return `${query} AND ${column} >= now() - INTERVAL ${timeRange.pastHours} HOUR`;
  }
  throw new Error('Invalid time range');
};

export const groupByTimeAbsoluteStatement = (
  start: Date,
  end: Date,
  groupByInterval: GroupByInterval,
  column: string,
): string => {
  const chRoundTime = truncateTimeMap[groupByInterval];
  const chInterval = intervalMap[groupByInterval];
  const chStep = chStepMap[groupByInterval];
  const chStartTime = Math.floor(start.getTime() / 1000);
  const chEndTime = Math.floor(end.getTime() / 1000);

  return `GROUP BY
    time, ${column}
ORDER BY
    time
WITH FILL
FROM ${chRoundTime}(fromUnixTimestamp(${chStartTime}))
TO ${chRoundTime}(fromUnixTimestamp(${chEndTime}) + INTERVAL ${chInterval})
STEP ${chStep}`;
};

export const groupByTimeRelativeStatement = (
  pastHours: number,
  groupByInterval: GroupByInterval,
  column: string,
): string => {
  if (!validateSqlString(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
  const chRoundTime = truncateTimeMap[groupByInterval];
  const chInterval = intervalMap[groupByInterval];
  const chStep = chStepMap[groupByInterval];

  return `GROUP BY
    time, ${column}
ORDER BY
    time
WITH FILL
FROM ${chRoundTime}(now() - INTERVAL ${pastHours} HOUR + INTERVAL ${chInterval})
TO ${chRoundTime}(now() + INTERVAL ${chInterval})
STEP ${chStep}`;
};

export const getTimeBounds = async (
  client: ClickHouseClient,
  projectId: string,
  table: string,
  column: string,
): Promise<[Date, Date]> => {
  if (!validateSqlString(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  if (!validateSqlString(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }

  const query = `SELECT
    MIN(${column}) AS minTime,
    MAX(${column}) AS maxTime
  FROM ${table}
  WHERE project_id = {projectId: UUID}`;
  const result = await client.query({
    query,
    format: 'JSONEachRow',
    query_params: { projectId },
  });

  const rows = (await result.json()) as { minTime: number; maxTime: number }[];

  return [
    new Date(rows[0].minTime),
    new Date(rows[0].maxTime),
  ];
};
