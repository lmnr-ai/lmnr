import { type AggregationFunction } from "@/lib/clickhouse/types";

const NANOS_PER_MILLISECOND = 1e6;

export const dateToNanoseconds = (date: Date): number => date.getTime() * NANOS_PER_MILLISECOND;

const validateSqlString = (str: string): boolean => /^[a-zA-Z0-9_.]+$/.test(str);

type AbsoluteTimeRange = {
  start: Date;
  end: Date;
};

type RelativeTimeRange = {
  pastHours: number;
};

export const aggregationFunctionToCh = (f: AggregationFunction) => {
  switch (f) {
    case "AVG":
      return "avg";
    case "SUM":
      return "sum";
    case "MIN":
      return "min";
    case "MAX":
      return "max";
    case "MEDIAN":
      return "median";
    case "p90":
      return "quantileExact(0.90)";
    case "p95":
      return "quantileExact(0.95)";
    case "p99":
      return "quantileExact(0.99)";
    default:
      throw new Error(`Invalid aggregation function: ${f}`);
  }
};

export type TimeRange = AbsoluteTimeRange | RelativeTimeRange;

export const getTimeRange = (
  pastHours: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined
): TimeRange => {
  if (pastHours) {
    return { pastHours: parseInt(pastHours) };
  }
  if (startDate && endDate) {
    return { start: new Date(startDate), end: new Date(endDate) };
  }
  throw new Error("Invalid time range");
};

export const getOptionalTimeRange = (
  pastHours: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined
): TimeRange | undefined => {
  if (pastHours) {
    return { pastHours: parseInt(pastHours) };
  }
  if (startDate && endDate) {
    return { start: new Date(startDate), end: new Date(endDate) };
  }
  return undefined;
};

export const addTimeRangeToQuery = (query: string, timeRange: TimeRange, column: string): string => {
  if (!validateSqlString(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
  if ("start" in timeRange && "end" in timeRange) {
    const startSeconds = Math.floor(timeRange.start.getTime() / 1000);
    const endSeconds = Math.floor(timeRange.end.getTime() / 1000);
    return `${query}
      AND ${column} >= fromUnixTimestamp(${startSeconds})
      AND ${column} <= fromUnixTimestamp(${endSeconds})`;
  }
  if ("pastHours" in timeRange) {
    return `${query} AND ${column} >= now() - INTERVAL ${timeRange.pastHours} HOUR`;
  }
  throw new Error("Invalid time range");
};
