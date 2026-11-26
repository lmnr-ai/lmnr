import { Controller, useFormContext } from "react-hook-form";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMPARE_TO, WINDOW_MINUTES } from "@/lib/actions/alerts/metric-rule";

import { COMPARE_TO_LABELS, WINDOW_LABELS } from "../constants";
import Field from "./field";
import { type MetricAlertFormValues } from "./types";

/** The window a value is measured over and, for a change, the earlier window it is held against. */
export default function WindowFields() {
  const { control, watch } = useFormContext<MetricAlertFormValues>();
  const conditionType = watch("conditionType");

  return (
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
  );
}
