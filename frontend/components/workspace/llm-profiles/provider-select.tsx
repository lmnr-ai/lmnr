"use client";

import { Controller, useFormContext } from "react-hook-form";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Field } from "./field";
import { type LlmProfileFormValues, UI_PROVIDER_OPTIONS } from "./types";

export function ProviderSelect() {
  const { control } = useFormContext<LlmProfileFormValues>();
  return (
    <Controller
      control={control}
      name="uiProvider"
      render={({ field }) => (
        <Field label="Provider">
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UI_PROVIDER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}
