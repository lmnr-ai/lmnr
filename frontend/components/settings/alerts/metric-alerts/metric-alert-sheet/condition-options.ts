import { type Metric } from "@/lib/actions/alerts/metric-rule";

import { METRIC_META, UNIT_SUFFIX } from "../constants";
import { type ConditionType } from "./types";

export const CONDITION_LABELS: Record<ConditionType, { title: string; description: string }> = {
  value: { title: "Value", description: "The metric crosses a fixed number." },
  change: { title: "Change", description: "The metric moves against the same window earlier." },
};

export const CONDITION_TYPES = Object.keys(CONDITION_LABELS) as ConditionType[];

/** Change thresholds are a percent of a baseline; value thresholds are in the metric's unit. */
export const thresholdUnit = (metric: Metric, condition: ConditionType) =>
  condition === "change" ? "%" : UNIT_SUFFIX[METRIC_META[metric].unit];
