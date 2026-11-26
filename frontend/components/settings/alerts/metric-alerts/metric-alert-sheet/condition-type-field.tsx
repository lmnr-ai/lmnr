import { useFormContext } from "react-hook-form";

import { cn } from "@/lib/utils";

import { MONTH_TO_DATE } from "../constants";
import { CONDITION_LABELS, conditionOptions } from "./condition-options";
import { DAY_WINDOW, DEFAULT_FORM_VALUES } from "./form-rule";
import { type ConditionType, type MetricAlertFormValues } from "./types";

export default function ConditionTypeField() {
  const { watch, setValue, getValues } = useFormContext<MetricAlertFormValues>();
  const [metric, conditionType] = watch(["metric", "conditionType"]);

  const change = (next: ConditionType) => {
    if (next === conditionType) return;
    setValue("conditionType", next, { shouldDirty: true });
    // A percentage of a baseline and a plain value are different numbers, so thresholds start over.
    for (const field of ["warning", "critical", "resolve"] as const) setValue(field, "");
    if (next === "spending_limit") {
      setValue("direction", "above");
      setValue("splitByModel", false);
      setValue("window", DAY_WINDOW);
    } else if (getValues("window") === MONTH_TO_DATE) {
      setValue("window", DEFAULT_FORM_VALUES.window);
    }
  };

  return (
    <div role="radiogroup" aria-label="Condition" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {conditionOptions(metric).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === conditionType}
          onClick={() => change(option)}
          className={cn(
            "flex flex-col gap-1 rounded-md border p-3 text-left transition-colors hover:overlay-hover",
            option === conditionType && "border-primary bg-primary/5"
          )}
        >
          <span className="text-sm font-medium">{CONDITION_LABELS[option].title}</span>
          <span className="text-xs text-muted-foreground">{CONDITION_LABELS[option].description}</span>
        </button>
      ))}
    </div>
  );
}
