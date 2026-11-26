import { type CompareTo, type Metric } from "@/lib/actions/alerts/metric-rule";

export type MetricUnit = "usd" | "tokens" | "count" | "percent" | "seconds";

interface MetricMeta {
  label: string;
  unit: MetricUnit;
  /** Whether the rule can keep one state per model. */
  splittable: boolean;
  /** Ratios and percentiles, which mean little on a handful of traces. */
  needsMinTraces: boolean;
}

export const METRIC_META: Record<Metric, MetricMeta> = {
  total_cost: { label: "Total cost", unit: "usd", splittable: true, needsMinTraces: false },
  cost_per_trace: { label: "Cost per trace", unit: "usd", splittable: true, needsMinTraces: true },
  trace_cost: { label: "Cost of a single trace", unit: "usd", splittable: false, needsMinTraces: false },
  input_tokens: { label: "Input tokens", unit: "tokens", splittable: true, needsMinTraces: false },
  output_tokens: { label: "Output tokens", unit: "tokens", splittable: true, needsMinTraces: false },
  total_tokens: { label: "Total tokens", unit: "tokens", splittable: true, needsMinTraces: false },
  tokens_per_trace: { label: "Tokens per trace", unit: "tokens", splittable: true, needsMinTraces: true },
  trace_count: { label: "Trace count", unit: "count", splittable: false, needsMinTraces: false },
  error_rate: { label: "Error rate", unit: "percent", splittable: false, needsMinTraces: true },
  latency_p50: { label: "p50 latency", unit: "seconds", splittable: false, needsMinTraces: true },
  latency_p95: { label: "p95 latency", unit: "seconds", splittable: false, needsMinTraces: true },
};

export const UNIT_SUFFIX: Record<MetricUnit, string> = {
  usd: "USD",
  tokens: "tokens",
  count: "traces",
  percent: "%",
  seconds: "s",
};

export const MONTH_TO_DATE = "mtd";

export const WINDOW_LABELS: Record<string, string> = {
  "5": "5 minutes",
  "15": "15 minutes",
  "60": "1 hour",
  "1440": "1 day",
  [MONTH_TO_DATE]: "month to date",
};

export const COMPARE_TO_LABELS: Record<CompareTo, string> = {
  "5m": "5 minutes earlier",
  "15m": "15 minutes earlier",
  "1h": "1 hour earlier",
  "1d": "1 day earlier",
  "1w": "1 week earlier",
  "30d": "30 days earlier",
};

export const DEFAULT_CHECKS_IN_A_ROW = 3;
export const DEFAULT_MIN_TRACES = 50;
/** A rule that would have fired more often than this in a week is called noisy. */
export const NOISY_FIRES_PER_WEEK = 5;
export const PREVIEW_HOURS = 7 * 24;
export const ROW_CHART_HOURS = 24;
