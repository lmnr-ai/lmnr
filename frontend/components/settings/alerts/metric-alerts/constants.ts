import { type CompareTo, type Metric } from "@/lib/actions/alerts/metric-rule";

export type MetricUnit = "usd" | "tokens" | "spans" | "calls" | "percent" | "seconds";

interface MetricMeta {
  label: string;
  unit: MetricUnit;
  /** Whether the rule can keep one state per model. */
  splittable: boolean;
  /** Rates and percentiles, which mean little on a handful of LLM calls. */
  needsMinCalls: boolean;
}

export const METRIC_META: Record<Metric, MetricMeta> = {
  span_count: { label: "Span count", unit: "spans", splittable: false, needsMinCalls: false },
  total_cost: { label: "Total cost", unit: "usd", splittable: true, needsMinCalls: false },
  input_tokens: { label: "Input tokens", unit: "tokens", splittable: true, needsMinCalls: false },
  output_tokens: { label: "Output tokens", unit: "tokens", splittable: true, needsMinCalls: false },
  total_tokens: { label: "Total tokens", unit: "tokens", splittable: true, needsMinCalls: false },
  llm_calls: { label: "LLM calls", unit: "calls", splittable: true, needsMinCalls: false },
  llm_errors: { label: "Failed LLM calls", unit: "calls", splittable: true, needsMinCalls: false },
  llm_error_rate: { label: "LLM error rate", unit: "percent", splittable: true, needsMinCalls: true },
  llm_no_cost_rate: { label: "LLM calls with no cost", unit: "percent", splittable: true, needsMinCalls: true },
  llm_no_tokens_rate: { label: "LLM calls with no tokens", unit: "percent", splittable: true, needsMinCalls: true },
  llm_latency_p50: { label: "p50 LLM latency", unit: "seconds", splittable: true, needsMinCalls: true },
  llm_latency_p95: { label: "p95 LLM latency", unit: "seconds", splittable: true, needsMinCalls: true },
};

/** The metric picker's sections. */
export const METRIC_GROUPS: { label: string; metrics: Metric[] }[] = [
  { label: "Cost", metrics: ["total_cost", "llm_no_cost_rate"] },
  { label: "Tokens", metrics: ["input_tokens", "output_tokens", "total_tokens", "llm_no_tokens_rate"] },
  { label: "Traffic and errors", metrics: ["span_count", "llm_calls", "llm_errors", "llm_error_rate"] },
  { label: "Latency", metrics: ["llm_latency_p50", "llm_latency_p95"] },
];

export const UNIT_SUFFIX: Record<MetricUnit, string> = {
  usd: "USD",
  tokens: "tokens",
  spans: "spans",
  calls: "LLM calls",
  percent: "%",
  seconds: "s",
};

export const WINDOW_LABELS: Record<string, string> = {
  "5": "5 minutes",
  "15": "15 minutes",
  "30": "30 minutes",
  "60": "1 hour",
  "1440": "1 day",
};

export const COMPARE_TO_LABELS: Record<CompareTo, string> = {
  "5m": "5 minutes earlier",
  "15m": "15 minutes earlier",
  "30m": "30 minutes earlier",
  "1h": "1 hour earlier",
  "1d": "1 day earlier",
  "1w": "1 week earlier",
  "30d": "30 days earlier",
};

export const DEFAULT_CHECKS_IN_A_ROW = 3;
export const DEFAULT_MIN_CALLS = 50;
/** A rule that would have fired more often than this in a week is called noisy. */
export const NOISY_FIRES_PER_WEEK = 5;
export const PREVIEW_HOURS = 7 * 24;
export const CARD_CHART_HOURS = 6;
/** How often an open chart asks for new points. */
export const REFRESH_MS = 60 * 1000;

/** The alert page's chart ranges, in hours. */
export const CHART_RANGES = { "1h": 1, "6h": 6, "24h": 24, "7d": PREVIEW_HOURS } as const;
export type ChartRange = keyof typeof CHART_RANGES;
export const CHART_RANGE_KEYS = Object.keys(CHART_RANGES) as ChartRange[];
export const DEFAULT_CHART_RANGE: ChartRange = "6h";
