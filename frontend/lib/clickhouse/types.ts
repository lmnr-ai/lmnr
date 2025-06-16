export enum SpanMetricGroupBy {
  Model = "model",
  Provider = "provider",
  Path = "path",
  Name = "name",
}

// Don't change, must remain consistent with BE
export enum SpanType {
  DEFAULT = 0,
  LLM = 1,
  PIPELINE = 2,
  EXECUTOR = 3,
  EVALUATOR = 4,
  EVALUATION = 5,
  TOOL = 6,
  HUMAN_EVALUATOR = 7,
}

export enum SpanMetric {
  Count = "count",
  InputCost = "input_cost",
  OutputCost = "output_cost",
  TotalCost = "total_cost",
  Latency = "latency",
  InputTokens = "input_tokens",
  OutputTokens = "output_tokens",
  TotalTokens = "total_tokens",
}

export type MetricTimeValue<T> = {
  time: string;
  value: T;
};

export type SpanMetricType = {
  [key: string]: number;
  timestamp: number; // unix timestamp in seconds
};

export enum SpanSearchType {
  Input = "input",
  Output = "output",
}
