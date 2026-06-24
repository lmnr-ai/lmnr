"use client";

import { Info, Plus, X } from "lucide-react";
import { useMemo } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import { jsonSchemaToSchemaFields, type SchemaField } from "@/components/signals/utils";
import { Button } from "@/components/ui/button";
import { type ColumnFilter, dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type Filter, type StringFilter } from "@/lib/actions/common/filters";

export type AlertFilterFormItem = {
  id?: string;
  filters: Filter[];
};

const BOOLEAN_OPTIONS = [
  { label: "True", value: "true" },
  { label: "False", value: "false" },
];

export const schemaToFilterColumns = (schema: unknown): ColumnFilter[] => {
  const fields: SchemaField[] = jsonSchemaToSchemaFields(schema);

  return fields
    .filter((field) => field.name.trim())
    .map((field): ColumnFilter => {
      switch (field.type) {
        case "number":
          return { name: field.name, key: field.name, dataType: "number" };
        case "boolean":
          return { name: field.name, key: field.name, dataType: "enum", options: BOOLEAN_OPTIONS };
        case "enum":
          return {
            name: field.name,
            key: field.name,
            dataType: "enum",
            options: (field.enumValues ?? []).map((v) => ({ label: v, value: v })),
          };
        default:
          return { name: field.name, key: field.name, dataType: "string" };
      }
    });
};

const getDefaultFilter = (columns: ColumnFilter[]): StringFilter => {
  const firstColumn = columns[0];
  const defaultOperator = dataTypeOperationsMap[firstColumn.dataType][0].key as StringFilter["operator"];
  return { column: firstColumn.key, operator: defaultOperator, value: "" };
};

function FilterConditionRow({
  columns,
  conditionIndex,
  onRemove,
}: {
  columns: ColumnFilter[];
  conditionIndex: number;
  onRemove: () => void;
}) {
  const { control, watch, setValue } = useFormContext<{ alertFilters: AlertFilterFormItem[] }>();
  const currentColumn = watch(`alertFilters.0.filters.${conditionIndex}.column`);

  const column = columns.find((c) => c.key === currentColumn);
  const dataType = column?.dataType || "string";
  const operations = dataTypeOperationsMap[dataType] || dataTypeOperationsMap.string;

  const handleColumnChange = (newColumn: string, onChange: (value: string) => void) => {
    const newColumnDef = columns.find((c) => c.key === newColumn);
    const newDataType = newColumnDef?.dataType || "string";
    const defaultOperator = dataTypeOperationsMap[newDataType][0].key;

    onChange(newColumn);
    setValue(`alertFilters.0.filters.${conditionIndex}.operator`, defaultOperator);

    if (newDataType === "enum" && newColumnDef && "options" in newColumnDef && newColumnDef.options.length > 0) {
      setValue(`alertFilters.0.filters.${conditionIndex}.value`, newColumnDef.options[0].value);
    } else {
      setValue(`alertFilters.0.filters.${conditionIndex}.value`, "");
    }
  };

  return (
    <div className="flex gap-2 items-start">
      <Controller
        name={`alertFilters.0.filters.${conditionIndex}.column`}
        control={control}
        render={({ field }) => (
          <Select value={field.value} onValueChange={(value) => handleColumnChange(value, field.onChange)}>
            <SelectTrigger className="w-48 truncate">
              <span className="truncate">{columns.find((c) => c.key === field.value)?.name || "Select field..."}</span>
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectItem key={col.key} value={col.key}>
                  {col.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Controller
        name={`alertFilters.0.filters.${conditionIndex}.operator`}
        control={control}
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-12">
              <span>{operations.find((op) => op.key === field.value)?.label || field.value}</span>
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
        name={`alertFilters.0.filters.${conditionIndex}.value`}
        control={control}
        rules={{ required: "Value is required" }}
        render={({ field }) =>
          dataType === "enum" && column && "options" in column ? (
            <Select value={field.value as string} onValueChange={field.onChange}>
              <SelectTrigger className="flex-1">
                <span>{column.options.find((opt) => opt.value === field.value)?.label || "Select value..."}</span>
              </SelectTrigger>
              <SelectContent>
                {column.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              {...field}
              type={dataType === "number" ? "number" : "text"}
              placeholder="Enter value..."
              className="flex-1 hide-arrow"
              value={field.value as string}
            />
          )
        }
      />
      <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function AlertFiltersSection({ schema }: { schema: unknown }) {
  const columns = useMemo(() => schemaToFilterColumns(schema), [schema]);
  const { control } = useFormContext<{ alertFilters: AlertFilterFormItem[] }>();
  // All conditions live in a single ANDed group (alertFilters[0]); the alert
  // fires only when every condition matches. Editing this field array keeps
  // alertFilters[0].id intact so an existing row is updated in place on save.
  const { fields, append, remove } = useFieldArray({ control, name: "alertFilters.0.filters" });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">Output schema filters</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-60">
                <p>Only notify when an event&apos;s extracted output matches all of these conditions.</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={columns.length === 0}
          onClick={() => append(getDefaultFilter(columns))}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add condition
        </Button>
      </div>
      <div className="space-y-2">
        {columns.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
            This signal has no output fields to build filters from.
          </div>
        ) : (
          fields.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
              No conditions. The alert fires on every matching event. Click &quot;Add condition&quot; to filter by
              output.
            </div>
          )
        )}
        {fields.map((field, index) => (
          <FilterConditionRow key={field.id} columns={columns} conditionIndex={index} onRemove={() => remove(index)} />
        ))}
      </div>
    </div>
  );
}
