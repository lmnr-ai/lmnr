import { type MetricAlert, type MetricRule, type MetricRuleInput } from "@/lib/actions/alerts/metric-rule";

import { COMPARE_TO_LABELS, METRIC_META, WINDOW_LABELS } from "./constants";

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
    case "spans":
    case "calls":
      return plain(value, 0);
  }
};

/** A change rule compares a percentage of a baseline; a value rule compares the metric. */
export const isRelative = (rule: Pick<MetricRuleInput, "condition">) => rule.condition.type === "change";

/** A number held against the thresholds: a threshold, or a checked value. */
export const formatRuleValue = (rule: Pick<MetricRuleInput, "metric" | "condition">, value: number): string =>
  isRelative(rule) ? `${plain(value, 0)}%` : formatMetricValue(rule.metric, value);

export const windowKey = (rule: Pick<MetricRule, "window">): string => String(rule.window.minutes);

/** "the last hour" */
const windowName = (rule: Pick<MetricRuleInput, "window">): string => {
  const label = WINDOW_LABELS[String(rule.window.minutes)] ?? `${rule.window.minutes} minutes`;
  return `the last ${label.replace(/^1 /, "")}`;
};

/** One line that says what the rule watches, e.g. "Total cost over 1 hour above $5.00". */
export const conditionSummary = (rule: MetricRule): string => {
  const label = METRIC_META[rule.metric].label;
  const first = rule.warning ?? rule.critical;
  const threshold = first == null ? "" : formatRuleValue(rule, first);
  const over = `over ${WINDOW_LABELS[windowKey(rule)] ?? "the window"}`;

  const against = rule.condition.type === "change" ? ` of ${COMPARE_TO_LABELS[rule.condition.compareTo]}` : "";
  const summary = `${label} ${over} ${rule.direction} ${threshold}${against}`;
  return rule.groupBy === "model" ? `${summary} · by model` : summary;
};

/** Lowercases the first letter, unless the text opens with an acronym such as "LLM". */
const lowerFirst = (text: string) => (/^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));

/**
 * The rule as one sentence, e.g. "Alerts when total cost over the last hour is
 * above $5.00 (warning) or $10.00 (critical)." `null` until a threshold is set.
 */
export const alertsWhen = (rule: MetricRuleInput): string | null => {
  const levels = [
    rule.warning == null ? null : `${formatRuleValue(rule, rule.warning)} (warning)`,
    rule.critical == null ? null : `${formatRuleValue(rule, rule.critical)} (critical)`,
  ].filter(Boolean);
  if (levels.length === 0) return null;
  const thresholds = levels.join(" or ");
  const direction = rule.direction ?? "above";

  const perModel = rule.groupBy === "model" ? " of a model" : "";
  const subject = `${lowerFirst(METRIC_META[rule.metric].label)}${perModel} over ${windowName(rule)}`;
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
