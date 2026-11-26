import { Controller, useFormContext } from "react-hook-form";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMPARE_TO, WINDOW_MINUTES } from "@/lib/actions/alerts/metric-rule";

import { COMPARE_TO_LABELS, METRIC_META, UNIT_SUFFIX, WINDOW_LABELS } from "../constants";
import AdvancedFields from "./advanced-fields";
import ConditionTypeField from "./condition-type-field";
import Field from "./field";
import NumberInput from "./number-input";
import ThresholdFields from "./threshold-fields";
import { type MetricAlertFormValues } from "./types";

export default function ConditionStep() {
  const { control, register, watch } = useFormContext<MetricAlertFormValues>();
  const [metric, conditionType] = watch(["metric", "conditionType"]);

  return (
    <div className="flex flex-col gap-5">
      <ConditionTypeField />
      {conditionType === "budget" ? (
        <Field
          label="Budget for the month"
          hint="Warning when the month is on pace to pass the budget. Critical when spend has passed it. The month runs on UTC. Nothing is blocked."
        >
          <NumberInput unit="USD" min={0} placeholder="2000" {...register("budgetAmount")} />
        </Field>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Window">
              <Controller
                name="window"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WINDOW_MINUTES.map((minutes) => (
                        <SelectItem key={minutes} value={String(minutes)}>
                          Last {WINDOW_LABELS[String(minutes)]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            {conditionType === "change" && (
              <Field label="Compared with">
                <Controller
                  name="compareTo"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPARE_TO.map((shift) => (
                          <SelectItem key={shift} value={shift}>
                            The same window {COMPARE_TO_LABELS[shift]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            )}
          </div>
          <ThresholdFields />
          {conditionType === "change" && (
            <Field
              label="Minimum change"
              hint="Ignore a change smaller than this amount, so a move from $0.10 to $0.40 does not count as +300%."
            >
              <NumberInput unit={UNIT_SUFFIX[METRIC_META[metric].unit]} min={0} {...register("minChange")} />
            </Field>
          )}
        </>
      )}
      <AdvancedFields />
    </div>
  );
}
