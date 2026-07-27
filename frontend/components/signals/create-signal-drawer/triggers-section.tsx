"use client";

import { SelectValue } from "@radix-ui/react-select";
import { Info, Plus, X } from "lucide-react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import {
  getDefaultFilter,
  getRootSpanFinishedCondition,
  getSpanNameCondition,
  getTriggerKind,
  getTriggerSpanNames,
  SIGNAL_FILTER_COLUMNS,
  TRIGGER_KIND,
} from "@/components/signals/trigger-filter-field";
import { Button } from "@/components/ui/button";
import { dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";

import { type ManageSignalForm } from "./types";

/** The signal's single trigger always lives at index 0. */
const TRIGGER_INDEX = 0;

const SectionLabel = ({ label, hint }: { label: string; hint: string }) => (
  <div className="flex items-center gap-1.5">
    <Label className="text-sm font-medium">{label}</Label>
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-60">
        <p>{hint}</p>
      </TooltipContent>
    </Tooltip>
  </div>
);

function SpanNamesInput() {
  const { watch, setValue, register } = useFormContext<ManageSignalForm>();
  const conditions = watch(`triggers.${TRIGGER_INDEX}.conditions`) ?? [];
  const spanNames = getTriggerSpanNames(conditions);
  // Always render one trailing empty row so there's something to type into.
  const rows = spanNames.length > 0 ? spanNames : [""];
  // A trigger saved with no real names would never fire, silently.
  const hasName = rows.some((name) => name.trim() !== "");

  // `shouldValidate` because setValue skips validation by default, and the
  // registered rule below is what gates the Save button.
  const write = (next: string[]) =>
    setValue(`triggers.${TRIGGER_INDEX}.conditions`, [getSpanNameCondition(next)], {
      shouldDirty: true,
      shouldValidate: true,
    });

  // Registered (not rendered) purely so an unfirable trigger fails `isValid`
  // and the Save button stays disabled — the inputs write via setValue.
  register(`triggers.${TRIGGER_INDEX}.conditions`, {
    validate: (value) =>
      getTriggerKind(value ?? []) !== TRIGGER_KIND.SPAN_NAME ||
      getTriggerSpanNames(value ?? []).some((name) => name.trim() !== "") ||
      "Enter at least one span name",
  });

  return (
    <div className="grid gap-2">
      {rows.map((name, index) => (
        <div key={index} className="flex gap-2 items-center">
          <Input
            value={name}
            placeholder="Span name, e.g. agent.run"
            onChange={(e) => write(rows.map((n, i) => (i === index ? e.target.value : n)))}
          />
          {rows.length > 1 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => write(rows.filter((_, i) => i !== index))}>
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => write([...rows, ""])}>
        <Plus className="w-3.5 h-3.5 mr-1" />
        Add span name
      </Button>
      {hasName ? (
        <span className="text-xs text-muted-foreground">
          The signal runs when a span with any of these names finishes. Use this for distributed traces where the root
          span never arrives.
        </span>
      ) : (
        <span className="text-xs text-destructive">Enter at least one span name, or the signal will never run.</span>
      )}
    </div>
  );
}

function TriggerKindSelect() {
  const { watch, setValue } = useFormContext<ManageSignalForm>();
  const conditions = watch(`triggers.${TRIGGER_INDEX}.conditions`) ?? [];
  const kind = getTriggerKind(conditions);

  const handleChange = (next: string) => {
    setValue(
      `triggers.${TRIGGER_INDEX}.conditions`,
      next === TRIGGER_KIND.SPAN_NAME ? [getSpanNameCondition([""])] : [getRootSpanFinishedCondition()],
      { shouldDirty: true, shouldValidate: true }
    );
  };

  return (
    <div className="grid gap-2">
      <Select value={kind} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select trigger" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TRIGGER_KIND.ROOT_SPAN_FINISHED}>Root span finished</SelectItem>
          <SelectItem value={TRIGGER_KIND.SPAN_NAME}>Custom span names</SelectItem>
        </SelectContent>
      </Select>
      {kind === TRIGGER_KIND.ROOT_SPAN_FINISHED && (
        <span className="text-xs text-muted-foreground">
          The signal runs once the trace&apos;s root span finishes. Right for most traces.
        </span>
      )}
      {kind === TRIGGER_KIND.SPAN_NAME && <SpanNamesInput />}
    </div>
  );
}

function FilterRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const { control, watch, setValue } = useFormContext<ManageSignalForm>();
  const currentColumn = watch(`triggers.${TRIGGER_INDEX}.filters.${index}.column`);

  const column = SIGNAL_FILTER_COLUMNS.find((c) => c.key === currentColumn);
  const dataType = column?.dataType || "string";
  const operations = dataTypeOperationsMap[dataType] || dataTypeOperationsMap.string;

  const handleColumnChange = (newColumn: string, onChange: (value: string) => void) => {
    const newColumnDef = SIGNAL_FILTER_COLUMNS.find((c) => c.key === newColumn);
    const newDataType = newColumnDef?.dataType || "string";
    const defaultOperator = dataTypeOperationsMap[newDataType][0].key;

    onChange(newColumn);
    setValue(`triggers.${TRIGGER_INDEX}.filters.${index}.operator`, defaultOperator);

    if (newDataType === "enum" && newColumnDef && "options" in newColumnDef && newColumnDef.options.length > 0) {
      setValue(`triggers.${TRIGGER_INDEX}.filters.${index}.value`, newColumnDef.options[0].value);
    } else {
      setValue(`triggers.${TRIGGER_INDEX}.filters.${index}.value`, "");
    }
  };

  return (
    <div className="flex gap-2 items-start">
      <Controller
        name={`triggers.${TRIGGER_INDEX}.filters.${index}.column`}
        control={control}
        render={({ field }) => (
          <Select value={field.value} onValueChange={(value) => handleColumnChange(value, field.onChange)}>
            <SelectTrigger className="w-48 truncate">
              <span className="truncate">
                {SIGNAL_FILTER_COLUMNS.find((c) => c.key === field.value)?.name || "Select column..."}
              </span>
            </SelectTrigger>
            <SelectContent>
              {SIGNAL_FILTER_COLUMNS.map((col) => (
                <SelectItem key={col.key} value={col.key}>
                  {col.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Controller
        name={`triggers.${TRIGGER_INDEX}.filters.${index}.operator`}
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
        name={`triggers.${TRIGGER_INDEX}.filters.${index}.value`}
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
      <Button aria-label="Close" type="button" variant="ghost" size="icon" onClick={onRemove}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function FiltersSection() {
  const { control } = useFormContext<ManageSignalForm>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `triggers.${TRIGGER_INDEX}.filters`,
  });

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <SectionLabel
          label="Filters"
          hint="Once triggered, the signal only runs on traces matching all of these conditions."
        />
        <Button type="button" variant="outline" className="w-fit" onClick={() => append(getDefaultFilter())}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add filter
        </Button>
      </div>
      {fields.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
          No filters. The signal runs on every triggered trace.
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <FilterRow key={field.id} index={index} onRemove={() => remove(index)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProcessingModeSelect() {
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

export default function TriggersSection() {
  const featureFlags = useFeatureFlags();
  const batchEnabled = featureFlags[Feature.BATCH_SIGNALS];

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <SectionLabel label="Trigger" hint="When the signal is evaluated. Each signal has one trigger." />
        <TriggerKindSelect />
      </div>
      <FiltersSection />
      {batchEnabled && <ProcessingModeSelect />}
    </div>
  );
}
