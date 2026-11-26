import { type MetricAlert, type MetricRule, type MetricRuleInput } from "@/lib/actions/alerts/metric-rule";
import { ALERT_TARGET_TYPE } from "@/lib/actions/alerts/types";
import { type Filter } from "@/lib/actions/common/filters";

import { DEFAULT_CHECKS_IN_A_ROW, DEFAULT_MIN_TRACES, METRIC_META, MONTH_TO_DATE } from "../constants";
import { windowKey } from "../utils";
import { type ConditionType, type MetricAlertFormValues } from "./types";

export const DEFAULT_FORM_VALUES: MetricAlertFormValues = {
  name: "",
  metric: "total_cost",
  filters: [],
  splitByModel: false,
  window: "60",
  conditionType: "value",
  compareTo: "1w",
  budgetAmount: "",
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

const round = (value: number) => Number(value.toPrecision(3));

/**
 * The resolve threshold offered for a first alerting threshold: a step back
 * towards normal, so a value hovering at the threshold does not flap.
 * Percentages step by 10 points (130% gives 120%), other values by a tenth.
 */
export const suggestResolve = (
  conditionType: ConditionType,
  direction: "above" | "below",
  threshold: string
): string => {
  const value = toNumber(threshold);
  if (value == null) return "";
  const back = direction === "above" ? -1 : 1;
  const relative = conditionType === "change" || conditionType === "trace_p99";
  return String(relative ? Math.max(0, value + back * 10) : round(value * (1 + back * 0.1)));
};

const condition = (values: MetricAlertFormValues): MetricRuleInput["condition"] => {
  switch (values.conditionType) {
    case "change":
      return { type: "change", compareTo: values.compareTo };
    case "budget":
      return { type: "budget", amount: toNumber(values.budgetAmount) ?? 0 };
    default:
      return { type: values.conditionType };
  }
};

/** The rule a form describes. Fields a condition does not use are left out. */
export const toRule = (values: MetricAlertFormValues): MetricRuleInput => {
  const budget = values.conditionType === "budget";
  const meta = METRIC_META[values.metric];
  return {
    metric: values.metric,
    filters: values.filters.map(({ column, operator, value }) => ({ column, operator, value })),
    groupBy: values.splitByModel && meta.splittable && !budget ? "model" : null,
    window: budget || values.window === MONTH_TO_DATE ? { monthToDate: true } : { minutes: Number(values.window) },
    condition: condition(values),
    direction: values.direction,
    warning: budget ? null : toNumber(values.warning),
    critical: budget ? null : toNumber(values.critical),
    resolve: toNumber(values.resolve),
    minChange: values.conditionType === "change" ? toNumber(values.minChange) : null,
    checksInARow: toNumber(values.checksInARow) ?? DEFAULT_CHECKS_IN_A_ROW,
    minTraces: meta.needsMinTraces ? (toNumber(values.minTraces) ?? DEFAULT_MIN_TRACES) : DEFAULT_MIN_TRACES,
    onNoData: values.onNoData === "default" ? null : values.onNoData,
  };
};

export const fromRule = (rule: MetricRule): Omit<MetricAlertFormValues, "name" | "slackChannels" | "emailEnabled"> => ({
  metric: rule.metric,
  filters: rule.filters as Filter[],
  splitByModel: rule.groupBy === "model",
  window: windowKey(rule),
  conditionType: rule.condition.type,
  compareTo: rule.condition.type === "change" ? rule.condition.compareTo : DEFAULT_FORM_VALUES.compareTo,
  budgetAmount: rule.condition.type === "budget" ? toText(rule.condition.amount) : "",
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
