"use client";

import { SelectValue } from "@radix-ui/react-select";
import { Info, Plus, Trash2, X } from "lucide-react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import { getDefaultFilter, SIGNAL_TRIGGER_COLUMNS } from "@/components/signals/trigger-filter-field";
import { Button } from "@/components/ui/button";
import { dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { type ManageSignalForm } from "./types";

function TriggerFilterRow({
  triggerIndex,
  filterIndex,
  onRemove,
}: {
  triggerIndex: number;
  filterIndex: number;
  onRemove: () => void;
}) {
  const { control, watch, setValue } = useFormContext<ManageSignalForm>();
  const currentColumn = watch(`triggers.${triggerIndex}.filters.${filterIndex}.column`);

  const column = SIGNAL_TRIGGER_COLUMNS.find((c) => c.key === currentColumn);
  const dataType = column?.dataType || "string";
  const operations = dataTypeOperationsMap[dataType] || dataTypeOperationsMap.string;

  const handleColumnChange = (newColumn: string, onChange: (value: string) => void) => {
    const newColumnDef = SIGNAL_TRIGGER_COLUMNS.find((c) => c.key === newColumn);
    const newDataType = newColumnDef?.dataType || "string";
    const newOperations = dataTypeOperationsMap[newDataType];
    const defaultOperator = newOperations[0].key;

    onChange(newColumn);
    setValue(`triggers.${triggerIndex}.filters.${filterIndex}.operator`, defaultOperator);

    if (newDataType === "enum" && newColumnDef && "options" in newColumnDef && newColumnDef.options.length > 0) {
      setValue(`triggers.${triggerIndex}.filters.${filterIndex}.value`, newColumnDef.options[0].value);
    } else {
      setValue(`triggers.${triggerIndex}.filters.${filterIndex}.value`, "");
    }
  };

  return (
    <div className="flex gap-2 items-start">
      <Controller
        name={`triggers.${triggerIndex}.filters.${filterIndex}.column`}
        control={control}
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
        name={`triggers.${triggerIndex}.filters.${filterIndex}.operator`}
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
        name={`triggers.${triggerIndex}.filters.${filterIndex}.value`}
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

function TriggerCard({ triggerIndex, onRemove }: { triggerIndex: number; onRemove: () => void }) {
  const { control, watch } = useFormContext<ManageSignalForm>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `triggers.${triggerIndex}.filters`,
  });

  const mode = watch(`triggers.${triggerIndex}.mode`);

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">All conditions must match</span>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="space-y-2">
        {fields.map((field, filterIndex) => (
          <TriggerFilterRow
            key={field.id}
            triggerIndex={triggerIndex}
            filterIndex={filterIndex}
            onRemove={() => remove(filterIndex)}
          />
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => append(getDefaultFilter())}>
        <Plus className="w-3.5 h-3.5 mr-1" />
        Add condition
      </Button>
      <div className="pt-2 border-t">
        <Controller
          name={`triggers.${triggerIndex}.mode`}
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-3">
              <div>
                <Select value={String(field.value ?? 0)} onValueChange={(v) => field.onChange(Number(v))}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Select processing mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Batch processing</SelectItem>
                    <SelectItem value="1">Realtime processing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-muted-foreground">
                {mode === 1
                  ? "Results in minutes, but each run is billed as 2 signal runs."
                  : "Results available within several hours."}
              </span>
            </div>
          )}
        />
      </div>
    </div>
  );
}

export default function TriggersSection() {
  const { control } = useFormContext<ManageSignalForm>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "triggers",
  });

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">Triggers</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-60">
                <p>Signal will run when the following conditions on trace are met.</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() => append({ filters: [getDefaultFilter()], mode: 0 })}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add trigger
        </Button>
      </div>
      <div className="space-y-2">
        {fields.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
            No triggers configured. The signal will only run via jobs. Click &quot;Add trigger&quot; to add one.
          </div>
        )}
        {fields.map((field, index) => (
          <TriggerCard key={field.id} triggerIndex={index} onRemove={() => remove(index)} />
        ))}
      </div>
    </div>
  );
}
