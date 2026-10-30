export enum SpanSearchType {
  Input = "input",
  Output = "output",
}

export enum AggregationFunction {
  AVG = "AVG",
  SUM = "SUM",
  MIN = "MIN",
  MAX = "MAX",
  MEDIAN = "MEDIAN",
  p90 = "p90",
  p95 = "p95",
  p99 = "p99",
}

export const aggregationLabelMap: Record<AggregationFunction, string> = {
  [AggregationFunction.AVG]: "Average",
  [AggregationFunction.SUM]: "Sum",
  [AggregationFunction.MIN]: "Minimum",
  [AggregationFunction.MAX]: "Maximum",
  [AggregationFunction.MEDIAN]: "Median",
  [AggregationFunction.p90]: "p90",
  [AggregationFunction.p95]: "p95",
  [AggregationFunction.p99]: "p99",
};
