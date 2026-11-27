import { type MetricRuleInput } from "./metric-rule";

// Client-safe: the alert form shows these, and the CLI write API starts a rule from one by id.

export const TEMPLATE_CATEGORIES = ["Spikes", "Missing data"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/**
 * Thresholds as multiples of the project's usual daily peak over the last 7 days.
 * A suggestion never goes below a threshold the template already sets.
 */
export interface TemplateSuggestion {
  warning?: number;
  critical?: number;
}

export interface MetricAlertTemplate {
  id: string;
  category: TemplateCategory;
  title: string;
  description: string;
  /** The name a rule made from the template starts with. */
  name: string;
  /** The rule keys the template sets. */
  rule: Partial<MetricRuleInput>;
  /** Set when the form can propose better numbers from the project's own data. */
  suggest?: TemplateSuggestion;
}

export const METRIC_ALERT_TEMPLATES: MetricAlertTemplate[] = [
  {
    id: "traffic-stopped",
    category: "Missing data",
    title: "Traffic stopped",
    description: "No spans have arrived for a while.",
    name: "Traffic stopped",
    rule: {
      metric: "span_count",
      window: { minutes: 15 },
      condition: { type: "value" },
      direction: "below",
      warning: 1,
    },
  },
  {
    id: "cost-spike",
    category: "Spikes",
    title: "Cost spike",
    description: "Hourly cost is well above the same hour a day earlier.",
    name: "Cost spike",
    rule: {
      metric: "total_cost",
      window: { minutes: 60 },
      condition: { type: "change", compareTo: "1d" },
      direction: "above",
      warning: 150,
      critical: 300,
      minChange: 1,
    },
  },
  {
    id: "llm-error-spike",
    category: "Spikes",
    title: "LLM error spike",
    description: "Far more LLM calls are failing than an hour earlier.",
    name: "LLM error spike",
    rule: {
      metric: "llm_errors",
      window: { minutes: 15 },
      condition: { type: "change", compareTo: "1h" },
      direction: "above",
      warning: 200,
      critical: 500,
      minChange: 5,
    },
  },
  {
    id: "llm-error-rate",
    category: "Spikes",
    title: "LLM error rate",
    description: "Too large a share of LLM calls is failing.",
    name: "LLM error rate",
    rule: {
      metric: "llm_error_rate",
      window: { minutes: 15 },
      condition: { type: "value" },
      direction: "above",
      warning: 5,
      critical: 20,
      minCalls: 50,
    },
  },
  {
    id: "cost-tracking-stopped",
    category: "Missing data",
    title: "LLM calls without cost",
    description: "Most LLM calls arrive without a cost, e.g. after a model or SDK change.",
    name: "LLM calls without cost",
    rule: {
      metric: "llm_no_cost_rate",
      window: { minutes: 60 },
      condition: { type: "value" },
      direction: "above",
      warning: 50,
      critical: 90,
      minCalls: 20,
    },
  },
  {
    id: "token-usage-missing",
    category: "Missing data",
    title: "LLM calls without tokens",
    description: "Most LLM calls arrive without token counts.",
    name: "LLM calls without tokens",
    rule: {
      metric: "llm_no_tokens_rate",
      window: { minutes: 60 },
      condition: { type: "value" },
      direction: "above",
      warning: 50,
      critical: 90,
      minCalls: 20,
    },
  },
  {
    id: "slow-llm-calls",
    category: "Spikes",
    title: "Slow LLM calls",
    description: "LLM calls take longer than usual.",
    name: "Slow LLM calls",
    rule: {
      metric: "llm_latency_p95",
      window: { minutes: 15 },
      condition: { type: "value" },
      direction: "above",
      warning: 10,
      critical: 30,
      minCalls: 20,
    },
    suggest: { warning: 1.5, critical: 3 },
  },
];
