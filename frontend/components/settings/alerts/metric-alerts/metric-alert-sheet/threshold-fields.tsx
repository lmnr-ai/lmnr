import { Controller, useFormContext } from "react-hook-form";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { canAlertBelow, thresholdUnit } from "./condition-options";
import Field from "./field";
import NumberInput from "./number-input";
import { type MetricAlertFormValues } from "./types";

/** Direction, warning and critical for every condition except a spending limit. */
export default function ThresholdFields() {
  const { control, register, watch } = useFormContext<MetricAlertFormValues>();
  const [metric, conditionType] = watch(["metric", "conditionType"]);
  const unit = thresholdUnit(metric, conditionType);

  return (
    <div className="flex flex-col gap-4">
      {canAlertBelow(metric, conditionType) && (
        <Field label="Alert when the value is">
          <Controller
            name="direction"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">Above the threshold</SelectItem>
                  <SelectItem value="below">Below the threshold</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Warning">
          <NumberInput unit={unit} {...register("warning")} />
        </Field>
        <Field label="Critical">
          <NumberInput unit={unit} {...register("critical")} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Set a warning, a critical threshold, or both.
        {conditionType === "change" && " 100% means no change. 130% is 30% more than the earlier window."}
        {conditionType === "trace_p99" && " 300% is three times the p99 trace cost of the last 7 days."}
      </p>
    </div>
  );
}
