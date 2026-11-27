import {
  DEFAULT_WARN_AT_PERCENT,
  type MetricAlert,
  type MetricRule,
  type MetricRuleInput,
} from "@/lib/actions/alerts/metric-rule";

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
export const isRelative = (rule: Pick<MetricRuleInput, "condition">) =>
  rule.condition.type === "change" || rule.condition.type === "trace_p99";

/** A number held against the thresholds: a threshold, or a checked value. */
export const formatRuleValue = (rule: Pick<MetricRuleInput, "metric" | "condition">, value: number): string =>
  isRelative(rule) ? `${plain(value, 0)}%` : formatMetricValue(rule.metric, value);

export const windowKey = (rule: Pick<MetricRule, "window">): string =>
  "minutes" in rule.window ? String(rule.window.minutes) : MONTH_TO_DATE;

export const isSpendingLimit = (rule: Pick<MetricRuleInput, "condition">) => rule.condition.type === "spending_limit";

/** "the last hour", or "this month" for a month-to-date window. */
const windowName = (rule: Pick<MetricRuleInput, "window">): string => {
  if (!("minutes" in rule.window)) return "this month";
  const label = WINDOW_LABELS[String(rule.window.minutes)] ?? `${rule.window.minutes} minutes`;
  return `the last ${label.replace(/^1 /, "")}`;
};

const windowPhrase = (rule: Pick<MetricRuleInput, "window">): string =>
  "minutes" in rule.window ? `over ${windowName(rule)}` : windowName(rule);

/** One line that says what the rule watches, e.g. "Total cost over 1 hour above $5.00". */
export const conditionSummary = (rule: MetricRule): string => {
  const label = METRIC_META[rule.metric].label;
  const first = rule.warning ?? rule.critical;
  const threshold = first == null ? "" : formatRuleValue(rule, first);
  const over = `over ${WINDOW_LABELS[windowKey(rule)] ?? "the window"}`;

  let summary: string;
  switch (rule.condition.type) {
    case "spending_limit":
      summary = `Spending limit of ${usd(rule.condition.limit)} ${windowPhrase(rule)}`;
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

/** Lowercases the first letter, unless the text opens with an acronym such as "LLM". */
const lowerFirst = (text: string) => (/^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));

/**
 * The rule as one sentence, e.g. "Alerts when total cost over the last hour is
 * above $5.00 (warning) or $10.00 (critical)." `null` until a threshold is set.
 */
export const alertsWhen = (rule: MetricRuleInput): string | null => {
  if (rule.condition.type === "spending_limit") {
    const { limit, warnAtPercent = DEFAULT_WARN_AT_PERCENT } = rule.condition;
    if (!(limit > 0)) return null;
    const warnAt = usd((limit * warnAtPercent) / 100);
    return `Alerts when spend ${windowPhrase(rule)} reaches ${warnAt} (warning, ${plain(warnAtPercent)}% of the limit) and ${usd(limit)} (critical).`;
  }

  const levels = [
    rule.warning == null ? null : `${formatRuleValue(rule, rule.warning)} (warning)`,
    rule.critical == null ? null : `${formatRuleValue(rule, rule.critical)} (critical)`,
  ].filter(Boolean);
  if (levels.length === 0) return null;
  const thresholds = levels.join(" or ");
  const direction = rule.direction ?? "above";

  if (rule.condition.type === "trace_p99") {
    return `Alerts when a single trace costs more than ${thresholds} of this project's usual p99 trace cost.`;
  }
  if (rule.metric === "trace_cost") {
    return `Alerts when a trace from ${windowName(rule)} costs more than ${thresholds}.`;
  }
  const subject = `${lowerFirst(METRIC_META[rule.metric].label)} ${windowPhrase(rule)}`;
  const against =
    rule.condition.type === "change" ? ` of the same window ${COMPARE_TO_LABELS[rule.condition.compareTo]}` : "";
  return `Alerts when ${subject} is ${direction} ${thresholds}${against}.`;
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
  if (alert.level === "warning") return { label: "Warning", tone: "warning" };
  return { label: "OK", tone: "ok" };
};

export const formatMinutes = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${plain(hours, 1)} h`;
};

export const cadenceLine = (cadence: { checkIntervalMinutes: number; firesAfterMinutes: number }) =>
  `Checked every ${formatMinutes(cadence.checkIntervalMinutes)}. Fires after about ${formatMinutes(cadence.firesAfterMinutes)}.`;
