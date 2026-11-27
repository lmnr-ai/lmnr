import { useFormContext } from "react-hook-form";

import { cn } from "@/lib/utils";

import { CONDITION_LABELS, CONDITION_TYPES } from "./condition-options";
import { type ConditionType, type MetricAlertFormValues } from "./types";

export default function ConditionTypeField() {
  const { watch, setValue } = useFormContext<MetricAlertFormValues>();
  const conditionType = watch("conditionType");

  const change = (next: ConditionType) => {
    if (next === conditionType) return;
    setValue("conditionType", next, { shouldDirty: true });
    // A percentage of a baseline and a plain value are different numbers, so thresholds start over.
    for (const field of ["warning", "critical", "resolve"] as const) setValue(field, "");
  };

  return (
    <div role="radiogroup" aria-label="Condition" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {CONDITION_TYPES.map((option) => (
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
