import { type SlackChannelSelection } from "@/components/settings/alerts/slack-channel-picker";
import { type CompareTo, type Metric, type MetricRuleCondition } from "@/lib/actions/alerts/metric-rule";

export type ConditionType = MetricRuleCondition["type"];

/** Number inputs are kept as text so an empty field stays empty. */
export interface MetricAlertFormValues {
  name: string;
  metric: Metric;
  splitByModel: boolean;
  /** Minutes as text. */
  window: string;
  conditionType: ConditionType;
  compareTo: CompareTo;
  direction: "above" | "below";
  warning: string;
  critical: string;
  /** Empty resolves at the first alerting threshold. */
  resolve: string;
  minChange: string;
  checksInARow: string;
  minCalls: string;
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
