
interface TimeBounds {
  minTime: number;
  maxTime: number;
}

const NANOS_PER_MILLISECOND = 1e6;

export const dateToNanoseconds = (date: Date) => date.getTime() * NANOS_PER_MILLISECOND;

export const nanosecondsToDate = (nanoseconds: number) => new Date(nanoseconds / NANOS_PER_MILLISECOND);

const validateSqlString = (str: string) => /^[a-zA-Z0-9_\.]+$/.test(str);

type AbsoluteTimeRange = {
  start: Date;
  end: Date;
};

type RelativeTimeRange = {
  pastHours: number;
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

export const addTimeRangeToQuery = (query: string, timeRange: TimeRange, column: string) => {
  if (!validateSqlString(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
  if ('start' in timeRange && 'end' in timeRange) {
    return `${query} AND ${column} >= ${dateToNanoseconds(timeRange.start)} AND ${column} <= ${dateToNanoseconds(timeRange.end)}`;
  }
  if ('pastHours' in timeRange) {
    return `${query} AND ${column} >= now() - INTERVAL ${timeRange.pastHours} HOUR`;
  }
  throw new Error('Invalid time range');
};
