import { type MetricRuleInput, type PreviewPoint } from "@/lib/actions/alerts/metric-rule";

import { METRIC_META } from "../constants";
import { DEFAULT_FORM_VALUES, toRule } from "./form-rule";
import { type FormTemplate } from "./templates";
import { type MetricAlertFormValues } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNREACHABLE = "1e15";
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** The numbers a template leaves open, proposed from the project's own data. */
export type Suggestion = Partial<Pick<MetricAlertFormValues, "warning" | "critical" | "spendingLimit">>;

/** A template's rule with thresholds no value reaches, to read its series without firing. */
export const probeRule = (template: FormTemplate): MetricRuleInput =>
  toRule({
    ...DEFAULT_FORM_VALUES,
    ...template.values,
    warning: UNREACHABLE,
    critical: "",
    spendingLimit: UNREACHABLE,
  });

/** The usual daily peak: the median of each day's highest value, over days that had any. */
export const usualPeak = (points: PreviewPoint[]): number | null => {
  const peaks = new Map<number, number>();
  for (const point of points) {
    if (point.value == null || point.value <= 0) continue;
    const day = Math.floor(new Date(point.at).getTime() / DAY_MS);
    peaks.set(day, Math.max(peaks.get(day) ?? 0, point.value));
  }
  const sorted = [...peaks.values()].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Rounds up to a number that reads well as a threshold: 0.0351 gives 0.04, 13 gives 15. */
export const niceCeil = (value: number, whole = false): number => {
  if (!(value > 0)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = NICE_STEPS.find((candidate) => candidate * magnitude >= value * (1 - 1e-9)) ?? 10;
  const nice = Number((step * magnitude).toPrecision(2));
  return whole ? Math.ceil(nice) : nice;
};

/** Thresholds above the usual peak. `null` when the template takes none or the project has no data. */
export const suggestValues = (template: FormTemplate, peak: number | null): Suggestion | null => {
  const { suggest, values } = template;
  if (!suggest || peak == null) return null;
  const unit = METRIC_META[values.metric ?? DEFAULT_FORM_VALUES.metric].unit;
  const whole = unit === "count" || unit === "tokens";
  const above = (multiple: number, floor = "") => String(Math.max(niceCeil(peak * multiple, whole), Number(floor)));
  return {
    ...(suggest.warning != null && { warning: above(suggest.warning, values.warning) }),
    ...(suggest.critical != null && { critical: above(suggest.critical, values.critical) }),
    ...(suggest.limit != null && { spendingLimit: above(suggest.limit) }),
  };
};
