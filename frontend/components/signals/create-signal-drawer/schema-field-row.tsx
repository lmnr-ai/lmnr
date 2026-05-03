"use client";

import { X } from "lucide-react";
import { useCallback } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { SCHEMA_FIELD_TYPES } from "@/components/signals/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea";

import EnumValuesInput from "./enum-values-input";
import { type ManageSignalForm } from "./types";

export default function SchemaFieldRow({
  index,
  onRemove,
  canRemove,
}: {
  index: number;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<ManageSignalForm>();

  const fieldType = watch(`schemaFields.${index}.type`);
  const enumValues = watch(`schemaFields.${index}.enumValues`);
  const fieldErrors = errors.schemaFields?.[index];

  const handleTypeChange = useCallback(
    (newType: string) => {
      setValue(`schemaFields.${index}.type`, newType as "string" | "number" | "boolean" | "enum");
      if (newType !== "enum") {
        setValue(`schemaFields.${index}.enumValues`, undefined);
      }
    },
    [setValue, index]
  );

  const handleEnumValuesChange = useCallback(
    (values: string[] | undefined) => {
      setValue(`schemaFields.${index}.enumValues`, values);
    },
    [setValue, index]
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-start">
        <Controller
          name={`schemaFields.${index}.name`}
          control={control}
          rules={{
            required: "Name is required",
            pattern: {
              value: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
              message: "Name must be a valid identifier",
            },
          }}
          render={({ field }) => <Input {...field} placeholder="Field name" className="w-32 text-sm" />}
        />
        {fieldType === "enum" ? (
          <div className="flex flex-col gap-1 w-28">
            <Controller
              name={`schemaFields.${index}.type`}
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={handleTypeChange}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEMA_FIELD_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <EnumValuesInput values={enumValues} onChange={handleEnumValuesChange} />
          </div>
        ) : (
          <Controller
            name={`schemaFields.${index}.type`}
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEMA_FIELD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
        <Controller
          name={`schemaFields.${index}.description`}
          control={control}
          render={({ field }) => (
            <Textarea
              {...field}
              placeholder="Description of the field"
              rows={0}
              className="flex-1 text-xs! py-1.25 min-h-7!"
            />
          )}
        />
        <Button type="button" variant="ghost" onClick={onRemove} disabled={!canRemove} className="py-[7px] shrink-0">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      {fieldErrors && (
        <p className="text-destructive text-xs">
          {fieldErrors.name?.message || fieldErrors.description?.message || fieldErrors.type?.message}
        </p>
      )}
    </div>
  );
}
