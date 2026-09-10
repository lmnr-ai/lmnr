"use client";

import { Controller, useFormContext } from "react-hook-form";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  selectTriggerWithIconClassName,
  SelectValue,
} from "@/components/ui/select";

import { Field } from "./field";
import { ProviderIcon } from "./provider-icon";
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
            <SelectTrigger className={selectTriggerWithIconClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UI_PROVIDER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex items-center gap-2 leading-none">
                    <ProviderIcon provider={o.value} />
                    {o.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}
