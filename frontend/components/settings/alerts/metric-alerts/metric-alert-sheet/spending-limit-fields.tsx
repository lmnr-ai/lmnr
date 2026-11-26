import { Controller, useFormContext } from "react-hook-form";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { MONTH_TO_DATE } from "../constants";
import Field from "./field";
import { DAY_WINDOW } from "./form-rule";
import NumberInput from "./number-input";
import { type MetricAlertFormValues } from "./types";

/** A spending limit sets its own thresholds: critical at the limit, warning at a share of it. */
export default function SpendingLimitFields() {
  const { control, register } = useFormContext<MetricAlertFormValues>();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Limit">
          <NumberInput unit="USD" min={0} placeholder="50" {...register("spendingLimit")} />
        </Field>
        <Field label="Warn at">
          <NumberInput unit="%" min={1} max={99} step={1} {...register("warnAtPercent")} />
        </Field>
        <Field label="Covers">
          <Controller
            name="window"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DAY_WINDOW}>The last 24 hours</SelectItem>
                  <SelectItem value={MONTH_TO_DATE}>This month so far</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Warning when spend reaches that share of the limit. Critical at the limit. A month runs on UTC. Nothing is
        blocked.
      </p>
    </div>
  );
}
