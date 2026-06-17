"use client";

import { Plus, X } from "lucide-react";
import { useEffect } from "react";
import { type Control, Controller, useFieldArray, type UseFormSetValue, useWatch } from "react-hook-form";
import useSWR from "swr";

import { type AlertFormValues } from "@/components/settings/alerts/manage-alert-sheet";
import { jsonSchemaToSchemaFields, type SchemaField } from "@/components/signals/utils";
import { Button } from "@/components/ui/button";
import {
  BOOLEAN_OPERATIONS,
  NUMBER_OPERATIONS,
  STRING_OPERATIONS,
} from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { swrFetcher } from "@/lib/utils";

const operationsForType = (type: SchemaField["type"]) => {
  if (type === "number") return NUMBER_OPERATIONS;
  if (type === "boolean") return BOOLEAN_OPERATIONS;
  return STRING_OPERATIONS;
};

function RuleRow({
  control,
  setValue,
  fields,
  index,
  onRemove,
}: {
  control: Control<AlertFormValues>;
  setValue: UseFormSetValue<AlertFormValues>;
  fields: SchemaField[];
  index: number;
  onRemove: () => void;
}) {
  const selectedColumn = useWatch({ control, name: `rules.${index}.column` });
  const selected = fields.find((f) => f.name === selectedColumn);
  const type = selected?.type ?? "string";
  const operations = operationsForType(type);

  return (
    <div className="flex gap-2 items-center">
      <Controller
        name={`rules.${index}.column`}
        control={control}
        render={({ field }) => (
          <Select
            value={field.value || undefined}
            onValueChange={(value) => {
              field.onChange(value);
              // Operator/value sets are type-specific; reset them so a stale operator
              // (e.g. number ">" carried onto a boolean field) can't survive a field switch.
              // valueType drives type-correct coercion at save time.
              setValue(`rules.${index}.operator`, "eq");
              setValue(`rules.${index}.value`, "");
              setValue(`rules.${index}.valueType`, fields.find((f) => f.name === value)?.type ?? "string");
            }}
          >
            <SelectTrigger className="w-40 truncate">
              <span className="truncate">{field.value || "Select field..."}</span>
            </SelectTrigger>
            <SelectContent>
              {fields.map((f) => (
                <SelectItem key={f.name} value={f.name}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Controller
        name={`rules.${index}.operator`}
        control={control}
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-16">
              <span>{operations.find((op) => op.key === field.value)?.label ?? field.value}</span>
            </SelectTrigger>
            <SelectContent>
              {operations.map((op) => (
                <SelectItem key={op.key} value={op.key}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Controller
        name={`rules.${index}.value`}
        control={control}
        rules={{
          required: "Value is required",
          validate: (value) =>
            type !== "number" || value === "" || !Number.isNaN(Number(value)) || "Value must be a number",
        }}
        render={({ field }) => {
          if (type === "boolean") {
            return (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger className="flex-1">
                  <span>{field.value || "Select value..."}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">true</SelectItem>
                  <SelectItem value="false">false</SelectItem>
                </SelectContent>
              </Select>
            );
          }
          if (type === "enum" && selected?.enumValues && selected.enumValues.length > 0) {
            return (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger className="flex-1">
                  <span>{field.value || "Select value..."}</span>
                </SelectTrigger>
                <SelectContent>
                  {selected.enumValues.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }
          return (
            <Input
              {...field}
              type={type === "number" ? "number" : "text"}
              placeholder="Enter value..."
              className="flex-1 hide-arrow"
            />
          );
        }}
      />
      <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function AlertRulesSection({
  control,
  setValue,
  projectId,
  signalId,
}: {
  control: Control<AlertFormValues>;
  setValue: UseFormSetValue<AlertFormValues>;
  projectId: string;
  signalId: string | undefined;
}) {
  const { data: signal, isLoading } = useSWR<{ structuredOutput?: Record<string, unknown> }>(
    signalId ? `/api/projects/${projectId}/signals/${signalId}` : null,
    swrFetcher
  );

  const { fields, append, remove, replace } = useFieldArray({ control, name: "rules" });

  const schemaFields = (signal?.structuredOutput ? jsonSchemaToSchemaFields(signal.structuredOutput) : []).filter((f) =>
    f.name.trim()
  );

  // No fields to filter on means the conditions UI is hidden; drop any rules
  // loaded on edit so they aren't silently persisted where the user can't see them.
  useEffect(() => {
    if (!isLoading && schemaFields.length === 0 && fields.length > 0) {
      replace([]);
    }
  }, [isLoading, schemaFields.length, fields.length, replace]);

  if (isLoading) {
    return <Skeleton className="h-7 w-full" />;
  }

  return (
    <div className="grid gap-2">
      <Label>Conditions</Label>
      <p className="text-xs text-muted-foreground">
        Only notify when the event payload matches all of these conditions. Leave empty to notify on every event.
      </p>
      {schemaFields.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">This signal has no structured fields to filter on.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {fields.map((field, index) => (
              <RuleRow
                key={field.id}
                control={control}
                setValue={setValue}
                fields={schemaFields}
                index={index}
                onRemove={() => remove(index)}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              append({ column: schemaFields[0].name, operator: "eq", value: "", valueType: schemaFields[0].type })
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add condition
          </Button>
        </>
      )}
    </div>
  );
}
