import { useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";

import { thresholdsLine } from "./form-rule";
import { type Suggestion } from "./suggestions";
import { type MetricAlertFormValues } from "./types";

/** Offers the thresholds read from the project's last 7 days, for the template that was picked. */
export default function SuggestionHint({ suggestion }: { suggestion?: Suggestion }) {
  const { watch, setValue } = useFormContext<MetricAlertFormValues>();
  const values = watch();
  if (!suggestion) return null;

  const fields = Object.entries(suggestion) as [keyof Suggestion, string][];
  const applied = fields.every(([field, value]) => Number(values[field]) === Number(value));
  if (applied) {
    return (
      <p className="text-xs text-muted-foreground">
        Suggested from the last 7 days: just above this project&apos;s usual peak.
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>From the last 7 days: {thresholdsLine({ ...values, ...suggestion })}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 shrink-0 text-xs"
        onClick={() => fields.forEach(([field, value]) => setValue(field, value, { shouldDirty: true }))}
      >
        Use suggested
      </Button>
    </div>
  );
}
