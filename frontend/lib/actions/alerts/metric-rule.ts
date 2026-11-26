import { z } from "zod/v4";

import { type AlertTarget } from "./types";

// Client-safe: no server imports, so the alert form can read these values.

export const METRIC_ALERT_TYPE = "METRIC";

export const METRICS = [
  "total_cost",
  "cost_per_trace",
  "trace_cost",
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "tokens_per_trace",
  "trace_count",
  "error_rate",
  "latency_p50",
  "latency_p95",
] as const;
export type Metric = (typeof METRICS)[number];

export const WINDOW_MINUTES = [5, 15, 60, 1440] as const;
export const COMPARE_TO = ["5m", "15m", "1h", "1d", "1w", "30d"] as const;
export type CompareTo = (typeof COMPARE_TO)[number];

const WindowSchema = z.union([
  z.object({ minutes: z.number().int().positive() }).strict(),
  z.object({ monthToDate: z.literal(true) }).strict(),
]);

const ConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("value") }),
  z.object({ type: z.literal("change"), compareTo: z.enum(COMPARE_TO) }),
  z.object({ type: z.literal("budget"), amount: z.number().positive() }),
  z.object({ type: z.literal("trace_p99") }),
]);

const RuleFilterSchema = z.object({
  column: z.string().min(1),
  operator: z.string().min(1),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

/**
 * Shape of a metric rule in `alerts.metadata`. Mirrors `Rule` in
 * app-server/src/metric_alerts/rule.rs, which also owns the checks between
 * fields (see `parseMetricRule`).
 */
export const MetricRuleSchema = z.object({
  metric: z.enum(METRICS),
  filters: z.array(RuleFilterSchema).default([]),
  groupBy: z.enum(["model"]).nullish(),
  window: WindowSchema,
  condition: ConditionSchema,
  direction: z.enum(["above", "below"]).default("above"),
  warning: z.number().nullish(),
  critical: z.number().nullish(),
  resolve: z.number().nullish(),
  minChange: z.number().nullish(),
  checksInARow: z.number().int("Checks in a row must be a whole number").default(3),
  minTraces: z
    .number()
    .int("Minimum traces must be a whole number")
    .min(0, "Minimum traces cannot be negative")
    .default(50),
  onNoData: z.enum(["skip", "zero", "alert"]).nullish(),
  snoozedUntil: z.iso.datetime({ offset: true }).nullish(),
  disabled: z.boolean().optional(),
});

export type MetricRule = z.infer<typeof MetricRuleSchema>;

const COUNT_FIELDS: PropertyKey[] = ["checksInARow", "minTraces"];

/** The message for a count that is not a whole number, which the engine would refuse less plainly. */
export const wholeNumberError = (error: z.ZodError): string | undefined =>
  error.issues.find((issue) => COUNT_FIELDS.includes(issue.path[0]))?.message;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A stored rule with a partial one laid over it. Keys replace stored keys, and
 * `condition` is merged one level down, so `{ condition: { amount: 3000 } }`
 * changes a budget's amount and keeps its type.
 */
export const mergeRulePatch = (
  stored: Record<string, unknown>,
  patch: Record<string, unknown> | null | undefined
): Record<string, unknown> => {
  const merged = { ...stored, ...patch };
  if (isRecord(stored.condition) && isRecord(patch?.condition)) {
    merged.condition = { ...stored.condition, ...patch.condition };
  }
  return merged;
};
export type MetricRuleInput = z.input<typeof MetricRuleSchema>;
export type MetricRuleCondition = MetricRule["condition"];

export type MetricAlertLevel = "ok" | "warning" | "critical";

export interface MetricAlert {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  rule: MetricRule;
  targets: AlertTarget[];
  /** Worst level across the rule's groups. */
  level: MetricAlertLevel;
  /** Groups of a split rule that are firing now. */
  firingGroups: string[];
}

export interface MetricAlertIncident {
  id: string;
  group: string;
  level: MetricAlertLevel;
  peakLevel: MetricAlertLevel;
  peakValue: number;
  openedAt: string;
  escalatedAt: string | null;
  reopenedAt: string | null;
  resolvedAt: string | null;
}

export interface MetricAlertDetail extends MetricAlert {
  incidents: MetricAlertIncident[];
}

export interface RuleCadence {
  checkIntervalMinutes: number;
  firesAfterMinutes: number;
}

export interface PreviewPoint {
  at: string;
  value: number | null;
  projected: number | null;
}

export interface PreviewIncident {
  openedAt: string;
  resolvedAt: string | null;
  peakLevel: MetricAlertLevel;
  peakValue: number;
  transitions: { kind: string; level: MetricAlertLevel; at: string }[];
}

export interface PreviewGroup {
  group: string;
  points: PreviewPoint[];
  incidents: PreviewIncident[];
}

/** Mirrors `Preview` in app-server/src/metric_alerts/preview.rs. */
export interface MetricRulePreview extends RuleCadence {
  firedCount: number;
  groups: PreviewGroup[];
}
