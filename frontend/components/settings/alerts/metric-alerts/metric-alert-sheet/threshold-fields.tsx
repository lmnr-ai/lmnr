import { useFormContext } from "react-hook-form";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { METRIC_META, UNIT_SUFFIX } from "../constants";
import { canAlertBelow } from "./condition-options";
import Field from "./field";
import { suggestResolve } from "./form-rule";
import NumberInput from "./number-input";
import { type MetricAlertFormValues } from "./types";

type Level = "warning" | "critical";

/** Direction, warning, critical and resolve for every condition except a budget. */
export default function ThresholdFields() {
  const { watch, setValue, getValues } = useFormContext<MetricAlertFormValues>();
  const [metric, conditionType, direction, warning, critical, resolve] = watch([
    "metric",
    "conditionType",
    "direction",
    "warning",
    "critical",
    "resolve",
  ]);
  const relative = conditionType === "change" || conditionType === "trace_p99";
  const unit = relative ? "%" : UNIT_SUFFIX[METRIC_META[metric].unit];

  // Resolve follows the first alerting threshold until the user types their own.
  const update = (changes: Partial<Pick<MetricAlertFormValues, Level | "direction">>) => {
    const before = getValues();
    const after = { ...before, ...changes };
    const suggested = (values: MetricAlertFormValues) =>
      suggestResolve(values.conditionType, values.direction, values.warning || values.critical);
    for (const [field, value] of Object.entries(changes)) {
      setValue(field as Level | "direction", value, { shouldDirty: true });
    }
    if (before.resolve === "" || before.resolve === suggested(before)) {
      setValue("resolve", suggested(after), { shouldDirty: true });
    }
  };

  const back = direction === "above" ? "at or below" : "at or above";

  return (
    <div className="flex flex-col gap-4">
      {canAlertBelow(metric, conditionType) && (
        <Field label="Alert when the value is">
          <Select value={direction} onValueChange={(value: "above" | "below") => update({ direction: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="above">Above the threshold</SelectItem>
              <SelectItem value="below">Below the threshold</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Warning">
          <NumberInput unit={unit} value={warning} onChange={(e) => update({ warning: e.target.value })} />
        </Field>
        <Field label="Critical">
          <NumberInput unit={unit} value={critical} onChange={(e) => update({ critical: e.target.value })} />
        </Field>
        <Field label="Resolve">
          <NumberInput
            unit={unit}
            value={resolve}
            onChange={(e) => setValue("resolve", e.target.value, { shouldDirty: true })}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Set a warning, a critical threshold, or both. The incident closes once the value is back {back} the resolve
        threshold, so a value that hovers at the limit does not open and close over and over.
        {conditionType === "change" && " 100% means no change. 130% is 30% more than the earlier window."}
        {conditionType === "trace_p99" && " 300% is three times the p99 trace cost of the last 7 days."}
      </p>
    </div>
  );
}
