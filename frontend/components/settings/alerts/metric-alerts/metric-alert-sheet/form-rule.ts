import { type MetricAlert, type MetricRule, type MetricRuleInput } from "@/lib/actions/alerts/metric-rule";
import { ALERT_TARGET_TYPE } from "@/lib/actions/alerts/types";

import { DEFAULT_CHECKS_IN_A_ROW, DEFAULT_MIN_CALLS, METRIC_META } from "../constants";
import { formatRuleValue, windowKey } from "../utils";
import { type MetricAlertFormValues } from "./types";

export const DEFAULT_FORM_VALUES: MetricAlertFormValues = {
  name: "",
  metric: "total_cost",
  splitByModel: false,
  window: "60",
  conditionType: "value",
  compareTo: "15m",
  direction: "above",
  warning: "",
  critical: "",
  resolve: "",
  minChange: "",
  checksInARow: String(DEFAULT_CHECKS_IN_A_ROW),
  minCalls: String(DEFAULT_MIN_CALLS),
  onNoData: "default",
  slackChannels: [],
  emailEnabled: true,
};

const toNumber = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

const toText = (value: number | null | undefined) => (value == null ? "" : String(value));

/** The rule a form describes. Fields a condition or metric does not use are left out. */
export const toRule = (values: MetricAlertFormValues): MetricRuleInput => {
  const meta = METRIC_META[values.metric];
  const change = values.conditionType === "change";
  return {
    metric: values.metric,
    groupBy: values.splitByModel && meta.splittable ? "model" : null,
    window: { minutes: Number(values.window) },
    condition: change ? { type: "change", compareTo: values.compareTo } : { type: "value" },
    direction: values.direction,
    warning: toNumber(values.warning),
    critical: toNumber(values.critical),
    resolve: toNumber(values.resolve),
    minChange: change ? toNumber(values.minChange) : null,
    checksInARow: toNumber(values.checksInARow) ?? DEFAULT_CHECKS_IN_A_ROW,
    minCalls: meta.needsMinCalls ? (toNumber(values.minCalls) ?? DEFAULT_MIN_CALLS) : DEFAULT_MIN_CALLS,
    onNoData: values.onNoData === "default" ? null : values.onNoData,
  };
};

/** The numbers a form alerts at, e.g. "Warning above $4.00 · Critical above $8.00". */
export const thresholdsLine = (values: MetricAlertFormValues): string | null => {
  const rule = toRule(values);
  const levels = [
    rule.warning == null ? null : `Warning ${rule.direction} ${formatRuleValue(rule, rule.warning)}`,
    rule.critical == null ? null : `Critical ${rule.direction} ${formatRuleValue(rule, rule.critical)}`,
  ].filter(Boolean);
  return levels.length > 0 ? levels.join(" · ") : null;
};

export const fromRule = (rule: MetricRule): Omit<MetricAlertFormValues, "name" | "slackChannels" | "emailEnabled"> => ({
  metric: rule.metric,
  splitByModel: rule.groupBy === "model",
  window: windowKey(rule),
  conditionType: rule.condition.type,
  compareTo: rule.condition.type === "change" ? rule.condition.compareTo : DEFAULT_FORM_VALUES.compareTo,
  direction: rule.direction,
  warning: toText(rule.warning),
  critical: toText(rule.critical),
  resolve: toText(rule.resolve),
  minChange: toText(rule.minChange),
  checksInARow: String(rule.checksInARow),
  minCalls: String(rule.minCalls),
  onNoData: rule.onNoData ?? "default",
});

export const fromAlert = (alert: MetricAlert, userEmail: string): MetricAlertFormValues => ({
  ...fromRule(alert.rule),
  name: alert.name,
  slackChannels: alert.targets
    .filter((target) => target.type === ALERT_TARGET_TYPE.SLACK && target.channelId)
    .map((target) => ({ id: target.channelId!, name: target.channelName ?? target.channelId! })),
  emailEnabled: alert.targets.some((target) => target.type === ALERT_TARGET_TYPE.EMAIL && target.email === userEmail),
});
