"use client";

import { SelectValue } from "@radix-ui/react-select";
import { Controller, useFormContext } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select.tsx";

import { type ManageSignalForm } from "../types";
import { TRIGGER_INDEX } from "./constants";

export default function ProcessingModeSelect() {
  const { control, watch } = useFormContext<ManageSignalForm>();
  const mode = watch(`triggers.${TRIGGER_INDEX}.mode`);

  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">Processing mode</Label>
      <Controller
        name={`triggers.${TRIGGER_INDEX}.mode`}
        control={control}
        render={({ field }) => (
          <div className="flex items-center gap-3">
            <Select value={String(field.value ?? 0)} onValueChange={(v) => field.onChange(Number(v))}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select processing mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Batch processing</SelectItem>
                <SelectItem value="1">Realtime processing</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {mode === 1
                ? "Results in minutes, but each run is billed as 2 signal runs."
                : "Results available within several hours."}
            </span>
          </div>
        )}
      />
    </div>
  );
}
