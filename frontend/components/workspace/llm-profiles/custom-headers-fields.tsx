"use client";

import { Plus, X } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { type LlmProfileFormValues } from "./types";

/** Extra request headers for a custom gateway. Values are secrets: blank on edit keeps the stored value. */
export function CustomHeadersFields({ storedHeaderNames }: { storedHeaderNames: string[] }) {
  const { control, register, watch } = useFormContext<LlmProfileFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "headers" });
  const headers = watch("headers");

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-secondary-foreground">HTTP headers (optional)</Label>
      <div className="flex flex-col gap-2">
        {fields.map((field, index) => {
          const stored = storedHeaderNames.includes(headers[index]?.name?.trim() ?? "");
          return (
            <div key={field.id} className="flex items-center gap-2">
              <Input {...register(`headers.${index}.name`)} placeholder="X-Header-Name" className="flex-1" />
              <Input
                {...register(`headers.${index}.value`)}
                type={stored ? "password" : "text"}
                placeholder={stored ? "••••••••" : "value"}
                autoComplete="new-password"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Remove header"
                onClick={() => remove(index)}
              >
                <X size={14} />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => append({ name: "", value: "" })}
        >
          <Plus size={14} className="mr-1" />
          Header
        </Button>
      </div>
    </div>
  );
}
