import { ChevronRight } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { METRIC_META } from "../constants";
import { thresholdUnit } from "./condition-options";
import Field from "./field";
import NumberInput from "./number-input";
import { type MetricAlertFormValues } from "./types";

/** Settings with sensible defaults, folded away so the form stays short. */
export default function AdvancedFields() {
  const { control, register, watch, getValues } = useFormContext<MetricAlertFormValues>();
  const [metric, conditionType, direction, warning, critical] = watch([
    "metric",
    "conditionType",
    "direction",
    "warning",
    "critical",
  ]);
  const back = direction === "above" ? "at or below" : "at or above";
  const first = warning.trim() === "" && critical.trim() !== "" ? "critical" : "warning";

  return (
    // Open when the rule has its own resolve threshold, so a set value is never hidden.
    <Collapsible defaultOpen={getValues("resolve") !== ""} className="rounded-md border">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 px-3 py-2 text-sm">
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        Advanced
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 border-t p-3">
        {conditionType !== "spending_limit" && (
          <Field
            label="Resolve"
            hint={`The incident closes once the value is back ${back} this. Leave empty to follow the ${first} threshold.`}
          >
            <NumberInput
              unit={thresholdUnit(metric, conditionType)}
              placeholder={warning || critical}
              {...register("resolve")}
            />
          </Field>
        )}
        <Field label="Checks in a row" hint="How many checks in a row must agree before the level changes.">
          <NumberInput min={1} max={10} step={1} {...register("checksInARow")} />
        </Field>
        {METRIC_META[metric].needsMinTraces && (
          <Field label="Minimum traces" hint="A window with fewer traces is skipped, so a few traces cannot alert.">
            <NumberInput min={0} step={1} unit="traces" {...register("minTraces")} />
          </Field>
        )}
        <Field label="When there is no data">
          <Controller
            name="onNoData"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default for this metric</SelectItem>
                  <SelectItem value="skip">Skip the check</SelectItem>
                  <SelectItem value="zero">Treat it as zero</SelectItem>
                  <SelectItem value="alert">Alert</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </CollapsibleContent>
    </Collapsible>
  );
}
