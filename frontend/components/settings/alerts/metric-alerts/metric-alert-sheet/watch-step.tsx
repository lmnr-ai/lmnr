import { Controller, useFormContext } from "react-hook-form";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type Metric } from "@/lib/actions/alerts/metric-rule";

import { METRIC_GROUPS, METRIC_META, MONTH_TO_DATE } from "../constants";
import { conditionOptions } from "./condition-options";
import Field from "./field";
import FiltersField from "./filters-field";
import { DEFAULT_FORM_VALUES } from "./form-rule";
import { type MetricAlertFormValues } from "./types";

export default function WatchStep() {
  const { control, register, watch, setValue, getValues } = useFormContext<MetricAlertFormValues>();
  const [metric, filters, conditionType] = watch(["metric", "filters", "conditionType"]);
  const splittable = METRIC_META[metric].splittable;
  const canSplit = splittable && filters.length === 0 && conditionType !== "spending_limit";
  const splitHint = canSplit
    ? "Each model is checked on its own and opens its own incident. Covers the 20 largest models."
    : !splittable
      ? "Not available for this metric."
      : conditionType === "spending_limit"
        ? "Not available for a spending limit."
        : "Not available together with filters.";

  const changeMetric = (next: Metric) => {
    setValue("metric", next, { shouldDirty: true });
    const keepsCondition = conditionOptions(next).includes(getValues("conditionType"));
    // Thresholds are in the metric's unit, or a percent under some conditions, so they
    // do not carry over to another unit or condition.
    if (!keepsCondition || METRIC_META[next].unit !== METRIC_META[metric].unit) {
      for (const field of ["warning", "critical", "resolve", "minChange"] as const) setValue(field, "");
    }
    if (!keepsCondition) {
      setValue("conditionType", "value");
      if (getValues("window") === MONTH_TO_DATE) setValue("window", DEFAULT_FORM_VALUES.window);
    }
    if (next === "trace_cost") setValue("direction", "above");
    if (!METRIC_META[next].splittable) setValue("splitByModel", false);
  };

  return (
    <div className="flex flex-col gap-5">
      <Field label="Name">
        <Input placeholder="e.g. Cost spike" {...register("name")} />
      </Field>
      <Field label="Metric">
        <Select value={metric} onValueChange={changeMetric}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRIC_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel className="pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
                  {group.label}
                </SelectLabel>
                {group.metrics.map((value) => (
                  <SelectItem key={value} value={value}>
                    {METRIC_META[value].label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        label="Filters"
        hint="Only traces that match are counted. Evaluation and playground traces are left out unless you filter on trace type."
      >
        <FiltersField />
      </Field>
      <Controller
        name="splitByModel"
        control={control}
        render={({ field }) => (
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">Split by model</span>
              <span className="text-xs text-muted-foreground">{splitHint}</span>
            </div>
            <Switch checked={field.value && canSplit} disabled={!canSplit} onCheckedChange={field.onChange} />
          </div>
        )}
      />
    </div>
  );
}
