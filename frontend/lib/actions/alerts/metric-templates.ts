import { type MetricRuleInput } from "./metric-rule";

// Client-safe: the alert form shows these, and the CLI write API starts a rule from one by id.

export const TEMPLATE_CATEGORIES = ["Spikes", "Outages", "Spending", "Anomalies"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/**
 * Thresholds as multiples of the project's usual daily peak over the last 7 days.
 * A suggestion never goes below a threshold the template already sets.
 */
export interface TemplateSuggestion {
  warning?: number;
  critical?: number;
  limit?: number;
}

export interface MetricAlertTemplate {
  id: string;
  category: TemplateCategory;
  title: string;
  description: string;
  /** The name a rule made from the template starts with. */
  name: string;
  /** The rule keys the template sets. A number that depends on the project is left to the user. */
  rule: Partial<Omit<MetricRuleInput, "condition">> & {
    condition: MetricRuleInput["condition"] | { type: "spending_limit" };
  };
  /** Set when the form can propose the missing numbers from the project's own data. */
  suggest?: TemplateSuggestion;
}

export const METRIC_ALERT_TEMPLATES: MetricAlertTemplate[] = [
  {
    id: "error-spike",
    category: "Spikes",
    title: "Error spike",
    description: "More traces are failing than usual. Works on low traffic too.",
    name: "Error spike",
    rule: {
      metric: "error_traces",
      window: { minutes: 15 },
      condition: { type: "value" },
      direction: "above",
      warning: 5,
      critical: 25,
    },
    suggest: { warning: 1.5, critical: 3 },
  },
  {
    id: "cost-spike",
    category: "Spikes",
    title: "Cost spike",
    description: "Hourly cost is above its usual peak.",
    name: "Cost spike",
    rule: {
      metric: "total_cost",
      window: { minutes: 60 },
      condition: { type: "value" },
      direction: "above",
    },
    suggest: { warning: 1.5, critical: 3 },
  },
  {
    id: "error-rate",
    category: "Spikes",
    title: "Error rate",
    description: "Too large a share of traces is failing.",
    name: "Error rate",
    rule: {
      metric: "error_rate",
      window: { minutes: 15 },
      condition: { type: "value" },
      direction: "above",
      warning: 5,
      critical: 20,
      minTraces: 50,
    },
  },
  {
    id: "traffic-stopped",
    category: "Outages",
    title: "Traffic stopped",
    description: "No traces have arrived for a while.",
    name: "Traffic stopped",
    rule: {
      metric: "trace_count",
      window: { minutes: 15 },
      condition: { type: "value" },
      direction: "below",
      warning: 1,
    },
  },
  {
    id: "cost-tracking-stopped",
    category: "Outages",
    title: "Cost tracking stopped",
    description: "Most traces arrive without a cost, e.g. after a model or SDK change.",
    name: "Cost tracking stopped",
    rule: {
      metric: "no_cost_rate",
      window: { minutes: 60 },
      condition: { type: "value" },
      direction: "above",
      warning: 50,
      critical: 90,
      minTraces: 20,
    },
  },
  {
    id: "token-usage-missing",
    category: "Outages",
    title: "Token usage missing",
    description: "Most traces arrive without token counts.",
    name: "Token usage missing",
    rule: {
      metric: "no_tokens_rate",
      window: { minutes: 60 },
      condition: { type: "value" },
      direction: "above",
      warning: 50,
      critical: 90,
      minTraces: 20,
    },
  },
  {
    id: "daily-spending-limit",
    category: "Spending",
    title: "Daily spending limit",
    description: "Spend over the last 24 hours nears a limit, and reaches it.",
    name: "Daily spending limit",
    rule: {
      metric: "total_cost",
      window: { minutes: 1440 },
      condition: { type: "spending_limit" },
      direction: "above",
    },
    suggest: { limit: 1.5 },
  },
  {
    id: "expensive-trace",
    category: "Spending",
    title: "Expensive trace",
    description: "One trace costs more than a fixed amount.",
    name: "Expensive trace",
    rule: {
      metric: "trace_cost",
      window: { minutes: 15 },
      condition: { type: "value" },
      direction: "above",
    },
    suggest: { warning: 1.5, critical: 3 },
  },
  {
    id: "unusually-expensive-trace",
    category: "Anomalies",
    title: "Unusually expensive trace",
    description: "One trace costs far more than this project's traces usually do.",
    name: "Unusually expensive trace",
    rule: {
      metric: "trace_cost",
      window: { minutes: 15 },
      condition: { type: "trace_p99" },
      direction: "above",
      warning: 300,
      critical: 1000,
    },
  },
  {
    id: "cost-vs-last-week",
    category: "Anomalies",
    title: "Cost vs last week",
    description: "Hourly cost is well above the same hour a week ago.",
    name: "Cost vs last week",
    rule: {
      metric: "total_cost",
      window: { minutes: 60 },
      condition: { type: "change", compareTo: "1w" },
      direction: "above",
      warning: 130,
      critical: 150,
      minChange: 1,
    },
  },
];
