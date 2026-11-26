import { type Metric } from "@/lib/actions/alerts/metric-rule";

import { type ConditionType } from "./types";

export const CONDITION_LABELS: Record<ConditionType, { title: string; description: string }> = {
  value: { title: "Value", description: "The metric crosses a fixed number." },
  change: { title: "Change", description: "The metric moves against the same window earlier." },
  budget: { title: "Monthly budget", description: "This month's spend passes a budget, or is on pace to." },
  trace_p99: { title: "Unusual trace", description: "One trace costs far more than this project's p99." },
};

/** The conditions a metric can be judged by. */
export const conditionOptions = (metric: Metric): ConditionType[] => {
  if (metric === "trace_cost") return ["value", "trace_p99"];
  if (metric === "total_cost") return ["value", "change", "budget"];
  return ["value", "change"];
};

/** A single trace's cost and a budget only make sense going up. */
export const canAlertBelow = (metric: Metric, condition: ConditionType) =>
  metric !== "trace_cost" && condition !== "budget";
