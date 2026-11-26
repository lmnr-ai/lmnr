import { type SlackChannelSelection } from "@/components/settings/alerts/slack-channel-picker";
import { type CompareTo, type Metric, type MetricRuleCondition } from "@/lib/actions/alerts/metric-rule";
import { type Filter } from "@/lib/actions/common/filters";

export type ConditionType = MetricRuleCondition["type"];

/** Number inputs are kept as text so an empty field stays empty. */
export interface MetricAlertFormValues {
  name: string;
  metric: Metric;
  filters: Filter[];
  splitByModel: boolean;
  /** Minutes as text, or `MONTH_TO_DATE`. */
  window: string;
  conditionType: ConditionType;
  compareTo: CompareTo;
  budgetAmount: string;
  direction: "above" | "below";
  warning: string;
  critical: string;
  resolve: string;
  minChange: string;
  checksInARow: string;
  minTraces: string;
  /** `default` leaves the choice to the metric. */
  onNoData: "default" | "skip" | "zero" | "alert";
  slackChannels: SlackChannelSelection[];
  emailEnabled: boolean;
}

export const STEPS = ["template", "watch", "condition", "preview", "notify"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_TITLES: Record<Step, string> = {
  template: "Template",
  watch: "What to watch",
  condition: "When to alert",
  preview: "Preview",
  notify: "Notify",
};

/** What an entry point outside the settings page prefills, e.g. a dashboard chart. */
export interface MetricAlertPreset {
  name: string;
  metric: Metric;
  splitByModel?: boolean;
}
