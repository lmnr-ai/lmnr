import {
  DEFAULT_WARN_AT_PERCENT,
  type MetricAlert,
  type MetricRule,
  type MetricRuleInput,
} from "@/lib/actions/alerts/metric-rule";
import { ALERT_TARGET_TYPE } from "@/lib/actions/alerts/types";
import { type Filter } from "@/lib/actions/common/filters";

import { DEFAULT_CHECKS_IN_A_ROW, DEFAULT_MIN_TRACES, METRIC_META, MONTH_TO_DATE } from "../constants";
import { formatMetricValue, formatRuleValue, windowKey } from "../utils";
import { type MetricAlertFormValues } from "./types";

export const DAY_WINDOW = "1440";

export const DEFAULT_FORM_VALUES: MetricAlertFormValues = {
  name: "",
  metric: "total_cost",
  filters: [],
  splitByModel: false,
  window: "60",
  conditionType: "value",
  compareTo: "15m",
  spendingLimit: "",
  warnAtPercent: String(DEFAULT_WARN_AT_PERCENT),
  direction: "above",
  warning: "",
  critical: "",
  resolve: "",
  minChange: "",
  checksInARow: String(DEFAULT_CHECKS_IN_A_ROW),
  minTraces: String(DEFAULT_MIN_TRACES),
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

const condition = (values: MetricAlertFormValues): MetricRuleInput["condition"] => {
  switch (values.conditionType) {
    case "change":
      return { type: "change", compareTo: values.compareTo };
    case "spending_limit":
      return {
        type: "spending_limit",
        limit: toNumber(values.spendingLimit) ?? 0,
        warnAtPercent: toNumber(values.warnAtPercent) ?? DEFAULT_WARN_AT_PERCENT,
      };
    default:
      return { type: values.conditionType };
  }
};

/** The rule a form describes. Fields a condition does not use are left out. */
export const toRule = (values: MetricAlertFormValues): MetricRuleInput => {
  // A spending limit takes its thresholds from the limit and covers a day or the month so far.
  const limit = values.conditionType === "spending_limit";
  const meta = METRIC_META[values.metric];
  const monthToDate = limit && values.window === MONTH_TO_DATE;
  return {
    metric: values.metric,
    filters: values.filters.map(({ column, operator, value }) => ({ column, operator, value })),
    groupBy: values.splitByModel && meta.splittable && !limit ? "model" : null,
    window: monthToDate ? { monthToDate: true } : { minutes: Number(limit ? DAY_WINDOW : values.window) },
    condition: condition(values),
    direction: values.direction,
    warning: limit ? null : toNumber(values.warning),
    critical: limit ? null : toNumber(values.critical),
    resolve: limit ? null : toNumber(values.resolve),
    minChange: values.conditionType === "change" ? toNumber(values.minChange) : null,
    checksInARow: toNumber(values.checksInARow) ?? DEFAULT_CHECKS_IN_A_ROW,
    minTraces: meta.needsMinTraces ? (toNumber(values.minTraces) ?? DEFAULT_MIN_TRACES) : DEFAULT_MIN_TRACES,
    onNoData: values.onNoData === "default" ? null : values.onNoData,
  };
};

/** The numbers a form alerts at, e.g. "Warning above $4.00 · Critical above $8.00". */
export const thresholdsLine = (values: MetricAlertFormValues): string | null => {
  const rule = toRule(values);
  if (rule.condition.type === "spending_limit") {
    const { limit, warnAtPercent } = rule.condition;
    return limit > 0 ? `Limit ${formatMetricValue(rule.metric, limit)} · Warn at ${warnAtPercent}%` : null;
  }
  const levels = [
    rule.warning == null ? null : `Warning ${rule.direction} ${formatRuleValue(rule, rule.warning)}`,
    rule.critical == null ? null : `Critical ${rule.direction} ${formatRuleValue(rule, rule.critical)}`,
  ].filter(Boolean);
  return levels.length > 0 ? levels.join(" · ") : null;
};

export const fromRule = (rule: MetricRule): Omit<MetricAlertFormValues, "name" | "slackChannels" | "emailEnabled"> => ({
  metric: rule.metric,
  filters: rule.filters as Filter[],
  splitByModel: rule.groupBy === "model",
  window: windowKey(rule),
  conditionType: rule.condition.type,
  compareTo: rule.condition.type === "change" ? rule.condition.compareTo : DEFAULT_FORM_VALUES.compareTo,
  spendingLimit: rule.condition.type === "spending_limit" ? toText(rule.condition.limit) : "",
  warnAtPercent:
    rule.condition.type === "spending_limit"
      ? String(rule.condition.warnAtPercent ?? DEFAULT_WARN_AT_PERCENT)
      : DEFAULT_FORM_VALUES.warnAtPercent,
  direction: rule.direction,
  warning: toText(rule.warning),
  critical: toText(rule.critical),
  resolve: toText(rule.resolve),
  minChange: toText(rule.minChange),
  checksInARow: String(rule.checksInARow),
  minTraces: String(rule.minTraces),
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
