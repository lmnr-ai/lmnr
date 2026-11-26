import { type MetricRuleInput } from "./metric-rule";

// Client-safe: the alert form shows these, and the CLI write API starts a rule from one by id.

export interface MetricAlertTemplate {
  id: string;
  title: string;
  description: string;
  /** The name a rule made from the template starts with. */
  name: string;
  /** The rule keys the template sets. The budget amount is left to the user. */
  rule: Partial<Omit<MetricRuleInput, "condition">> & {
    condition: MetricRuleInput["condition"] | { type: "budget" };
  };
}

export const METRIC_ALERT_TEMPLATES: MetricAlertTemplate[] = [
  {
    id: "cost-spike",
    title: "Cost spike vs last week",
    description: "Hourly cost is well above the same hour a week ago.",
    name: "Cost spike",
    rule: {
      metric: "total_cost",
      window: { minutes: 60 },
      condition: { type: "change", compareTo: "1w" },
      direction: "above",
      warning: 130,
      critical: 150,
      resolve: 120,
      minChange: 1,
    },
  },
  {
    id: "monthly-budget",
    title: "Monthly budget",
    description: "Know when this month's spend is on pace to pass a budget, and when it has.",
    name: "Monthly budget",
    rule: {
      metric: "total_cost",
      window: { monthToDate: true },
      condition: { type: "budget" },
      direction: "above",
    },
  },
  {
    id: "runaway-trace",
    title: "Runaway trace",
    description: "One trace costs far more than this project's traces usually do.",
    name: "Runaway trace",
    rule: {
      metric: "trace_cost",
      window: { minutes: 15 },
      condition: { type: "trace_p99" },
      direction: "above",
      warning: 300,
      critical: 1000,
      resolve: 200,
    },
  },
  {
    id: "error-rate",
    title: "Error rate",
    description: "Too many traces are failing.",
    name: "Error rate",
    rule: {
      metric: "error_rate",
      window: { minutes: 15 },
      condition: { type: "value" },
      direction: "above",
      warning: 5,
      critical: 20,
      resolve: 3,
      minTraces: 50,
    },
  },
  {
    id: "traffic-stopped",
    title: "Traffic stopped",
    description: "No traces have arrived for a while.",
    name: "Traffic stopped",
    rule: {
      metric: "trace_count",
      window: { minutes: 15 },
      condition: { type: "value" },
      direction: "below",
      warning: 1,
      resolve: 1,
    },
  },
];
