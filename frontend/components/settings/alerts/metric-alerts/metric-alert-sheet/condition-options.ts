import { type Metric } from "@/lib/actions/alerts/metric-rule";

import { METRIC_META, UNIT_SUFFIX } from "../constants";
import { type ConditionType } from "./types";

export const CONDITION_LABELS: Record<ConditionType, { title: string; description: string }> = {
  value: { title: "Value", description: "The metric crosses a fixed number." },
  change: { title: "Change", description: "The metric moves against the same window earlier." },
  spending_limit: { title: "Spending limit", description: "Spend nears a limit, then reaches it." },
  trace_p99: { title: "Unusual trace", description: "One trace costs far more than this project's p99." },
};

/** The conditions a metric can be judged by. */
export const conditionOptions = (metric: Metric): ConditionType[] => {
  if (metric === "trace_cost") return ["value", "trace_p99"];
  if (metric === "total_cost") return ["value", "change", "spending_limit"];
  return ["value", "change"];
};

/** A single trace's cost and a spending limit only make sense going up. */
export const canAlertBelow = (metric: Metric, condition: ConditionType) =>
  metric !== "trace_cost" && condition !== "spending_limit";

/** Change and p99 thresholds are a percent of a baseline; the others are in the metric's unit. */
export const thresholdUnit = (metric: Metric, condition: ConditionType) =>
  condition === "change" || condition === "trace_p99" ? "%" : UNIT_SUFFIX[METRIC_META[metric].unit];
