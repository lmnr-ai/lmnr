"use client";

import { X } from "lucide-react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  type ColumnFilter,
  dataTypeOperationsMap,
  OperatorLabelMap,
} from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select.tsx";
import { type Filter, type StringFilter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators.ts";

export const SIGNAL_TRIGGER_COLUMNS: ColumnFilter[] = [
  { name: "Trace has span with name", key: "span_name", dataType: "string" },
  { name: "Status", key: "status", dataType: "enum", options: [{ label: "Error", value: "error" }] },
];

export const getDefaultFilter = (): StringFilter => {
  const firstColumn = SIGNAL_TRIGGER_COLUMNS[0];
  const defaultOperator = dataTypeOperationsMap[firstColumn.dataType][0].key as StringFilter["operator"];
  return {
    column: firstColumn.key,
    operator: defaultOperator,
    value: "",
  };
};

export const getColumnName = (columnKey: string): string =>
  SIGNAL_TRIGGER_COLUMNS.find((c) => c.key === columnKey)?.name || columnKey;

export const getOperatorLabel = (columnKey: string, operator: string): string => {
  const column = SIGNAL_TRIGGER_COLUMNS.find((c) => c.key === columnKey);
  const dataType = column?.dataType || "string";
  const operations = dataTypeOperationsMap[dataType] || dataTypeOperationsMap.string;
  return operations.find((op) => op.key === operator)?.label || operator;
};

type FiltersForm = {
  filters: Filter[];
};

function FilterRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<FiltersForm>();
  const currentColumn = watch(`filters.${index}.column`);

  const column = SIGNAL_TRIGGER_COLUMNS.find((c) => c.key === currentColumn);
  const dataType = column?.dataType || "string";
  const operations = [{ key: Operator.Eq, label: OperatorLabelMap[Operator.Eq] }];

  const handleColumnChange = (newColumn: string, onChange: (value: string) => void) => {
    const newColumnDef = SIGNAL_TRIGGER_COLUMNS.find((c) => c.key === newColumn);
    const newDataType = newColumnDef?.dataType || "string";
    const newOperations = dataTypeOperationsMap[newDataType];
    const defaultOperator = newOperations[0].key;

    onChange(newColumn);
    setValue(`filters.${index}.operator`, defaultOperator);

    if (newDataType === "enum" && newColumnDef && "options" in newColumnDef && newColumnDef.options.length > 0) {
      setValue(`filters.${index}.value`, newColumnDef.options[0].value);
    } else {
      setValue(`filters.${index}.value`, "");
    }
  };

  const filterErrors = errors.filters?.[index];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-start">
        <Controller
          name={`filters.${index}.column`}
          control={control}
          rules={{ required: "Column is required" }}
          render={({ field }) => (
            <Select value={field.value} onValueChange={(value) => handleColumnChange(value, field.onChange)}>
              <SelectTrigger className="w-48 truncate">
                <span className="truncate">
                  {SIGNAL_TRIGGER_COLUMNS.find((c) => c.key === field.value)?.name || "Select column..."}
                </span>
              </SelectTrigger>
              <SelectContent>
                {SIGNAL_TRIGGER_COLUMNS.map((col) => (
                  <SelectItem key={col.key} value={col.key}>
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <Controller
          name={`filters.${index}.operator`}
          control={control}
          rules={{ required: "Operator is required" }}
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
          name={`filters.${index}.value`}
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
        <Button type="button" variant="ghost" onClick={onRemove} className="py-[7px] shrink-0">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      {filterErrors && (
        <p className="text-destructive text-xs">
          {filterErrors.column?.message || filterErrors.operator?.message || filterErrors.value?.message}
        </p>
      )}
    </div>
  );
}

export function TriggerFiltersField() {
  const { control } = useFormContext<FiltersForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "filters" });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>The signal will fire only when all of the following conditions are met.</Label>
        <Button type="button" icon="plus" variant="outline" onClick={() => append(getDefaultFilter())}>
          Add Filter
        </Button>
      </div>
      <div className="space-y-2">
        {fields.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
            No filters configured. Click "Add Filter" to add one.
          </div>
        )}
        {fields.map((field, index) => (
          <FilterRow key={field.id} index={index} onRemove={() => remove(index)} />
        ))}
      </div>
    </div>
  );
}
