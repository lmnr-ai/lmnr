import { type MetricAlert, type MetricRule } from "@/lib/actions/alerts/metric-rule";

import { COMPARE_TO_LABELS, METRIC_META, MONTH_TO_DATE, WINDOW_LABELS } from "./constants";

const usd = (value: number) => {
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits,
  }).format(value);
};

const plain = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);

/** A value of the metric itself, in its own unit. */
export const formatMetricValue = (metric: MetricRule["metric"], value: number): string => {
  switch (METRIC_META[metric].unit) {
    case "usd":
      return usd(value);
    case "percent":
      return `${plain(value)}%`;
    case "seconds":
      return value < 1 ? `${plain(value * 1000, 0)} ms` : `${plain(value)} s`;
    case "tokens":
    case "count":
      return plain(value, 0);
  }
};

/** Change and p99 rules compare a percentage of a baseline; the others compare the metric. */
export const isRelative = (rule: Pick<MetricRule, "condition">) =>
  rule.condition.type === "change" || rule.condition.type === "trace_p99";

/** A number held against the thresholds: a threshold, or a checked value. */
export const formatRuleValue = (rule: Pick<MetricRule, "metric" | "condition">, value: number): string =>
  isRelative(rule) ? `${plain(value, 0)}%` : formatMetricValue(rule.metric, value);

export const windowKey = (rule: Pick<MetricRule, "window">): string =>
  "minutes" in rule.window ? String(rule.window.minutes) : MONTH_TO_DATE;

export const isBudget = (rule: Pick<MetricRule, "condition">) => rule.condition.type === "budget";

/** One line that says what the rule watches, e.g. "Total cost over 1 hour above $5.00". */
export const conditionSummary = (rule: MetricRule): string => {
  const label = METRIC_META[rule.metric].label;
  const first = rule.warning ?? rule.critical;
  const threshold = first == null ? "" : formatRuleValue(rule, first);
  const over = `over ${WINDOW_LABELS[windowKey(rule)] ?? "the window"}`;

  let summary: string;
  switch (rule.condition.type) {
    case "budget":
      summary = `Monthly budget of ${usd(rule.condition.amount)}`;
      break;
    case "trace_p99":
      summary = `A single trace costs more than ${threshold} of the usual p99`;
      break;
    case "change":
      summary = `${label} ${over} ${rule.direction} ${threshold} of ${COMPARE_TO_LABELS[rule.condition.compareTo]}`;
      break;
    case "value":
      summary = `${label} ${over} ${rule.direction} ${threshold}`;
  }

  const extras = [
    rule.groupBy === "model" ? "by model" : null,
    rule.filters.length > 0 ? `${rule.filters.length} ${rule.filters.length === 1 ? "filter" : "filters"}` : null,
  ].filter(Boolean);
  return [summary, ...extras].join(" · ");
};

export type AlertStatusTone = "ok" | "warning" | "critical" | "muted";

export interface AlertStatus {
  label: string;
  tone: AlertStatusTone;
}

export const isSnoozed = (rule: Pick<MetricRule, "snoozedUntil">, now = Date.now()) =>
  !!rule.snoozedUntil && new Date(rule.snoozedUntil).getTime() > now;

export const alertStatus = (alert: Pick<MetricAlert, "rule" | "level">): AlertStatus => {
  if (alert.rule.disabled) return { label: "Muted", tone: "muted" };
  if (alert.level === "critical") return { label: "Critical", tone: "critical" };
  if (alert.level === "warning") {
    // A budget at warning has not been exceeded yet: its projection has.
    return { label: isBudget(alert.rule) ? "On pace to exceed" : "Warning", tone: "warning" };
  }
  return { label: "OK", tone: "ok" };
};

export const formatMinutes = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${plain(hours, 1)} h`;
};

export const cadenceLine = (cadence: { checkIntervalMinutes: number; firesAfterMinutes: number }) =>
  `Checked every ${formatMinutes(cadence.checkIntervalMinutes)}. Fires after about ${formatMinutes(cadence.firesAfterMinutes)}.`;
