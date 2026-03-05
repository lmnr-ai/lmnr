import { useCallback } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";

import {
  createMetricFromOption,
  getMetricFunctionValue,
  METRIC_FUNCTION_OPTIONS,
} from "@/components/dashboard/editor/constants";
import { getAvailableColumns } from "@/components/dashboard/editor/table-schemas";
import SQLEditor from "@/components/sql/sql-editor";
import type { SQLSchemaConfig } from "@/components/sql/utils";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type QueryStructure } from "@/lib/actions/sql/types";
import { cn } from "@/lib/utils.ts";

const useMetricFnChange = (index: number) => {
  const { setValue, getValues } = useFormContext<QueryStructure>();

  return useCallback(
    (fnValue: string) => {
      const currentMetric = getValues(`metrics.${index}`);
      const newMetric = createMetricFromOption(fnValue, currentMetric.column || "count");
      if (newMetric.fn === "count") {
        setValue(`metrics.${index}`, { ...newMetric, column: "*", alias: "count" }, { shouldValidate: true });
      } else if (newMetric.fn === "raw") {
        setValue(`metrics.${index}`, { ...newMetric }, { shouldValidate: true });
      } else {
        setValue(`metrics.${index}`, { ...newMetric, column: "" }, { shouldValidate: true });
      }
    },
    [index, setValue, getValues]
  );
};

const RawSqlMetricRow = ({ index, table, onRemove }: { index: number; table: string; onRemove: () => void }) => {
  const { control, setValue } = useFormContext<QueryStructure>();
  const field = useWatch({ control, name: `metrics.${index}` });

  const schema: SQLSchemaConfig = { tables: [table] };

  const handleFnChange = useMetricFnChange(index);

  const handleSqlChange = useCallback(
    (sql: string) => {
      setValue(`metrics.${index}.column`, sql, { shouldValidate: true });
    },
    [index, setValue]
  );

  return (
    <div className="grid gap-2 border rounded p-2 bg-secondary/50">
      <div className="flex gap-2 items-center">
        <Select value={getMetricFunctionValue(field)} onValueChange={handleFnChange}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRIC_FUNCTION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Controller
          control={control}
          name={`metrics.${index}.alias`}
          render={({ field }) => (
            <Input
              placeholder="Alias"
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className="h-8 text-xs flex-1"
            />
          )}
        />
        <Button className="text-secondary-foreground" icon="x" size="icon" variant="ghost" onClick={onRemove} />
      </div>
      <div className="grid gap-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">SQL expression</Label>
          <a
            href="https://docs.laminar.sh/platform/sql-editor#table-schemas"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline"
          >
            schema docs
          </a>
        </div>
        <Controller
          control={control}
          name={`metrics.${index}.column`}
          render={({ field }) => (
            <div className="h-20 flex flex-1 border rounded-md overflow-hidden">
              <SQLEditor
                value={field.value}
                onChange={handleSqlChange}
                editable
                placeholder={`e.g. countIf(status = 'ERROR')`}
                schema={schema}
                generationMode="eval-expression"
                inputPlaceholder="e.g. Count errors"
              />
            </div>
          )}
        />
        <p className="text-[10px] text-muted-foreground">
          {"Expression is added as: SELECT <expr> AS <alias> FROM "}
          {table}
        </p>
      </div>
    </div>
  );
};

const StandardMetricRow = ({ index, table, onRemove }: { index: number; table: string; onRemove: () => void }) => {
  const { control, setValue, getValues } = useFormContext<QueryStructure>();
  const field = useWatch({ control, name: `metrics.${index}` });

  const handleFnChange = useMetricFnChange(index);

  return (
    <div className="flex gap-2">
      <Select value={getMetricFunctionValue(field)} onValueChange={handleFnChange}>
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {METRIC_FUNCTION_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={field.column}
        onValueChange={(column) => {
          const currentMetric = getValues(`metrics.${index}`);
          setValue(`metrics.${index}`, { ...currentMetric, column }, { shouldValidate: true });
        }}
        disabled={field.fn === "count"}
      >
        <SelectTrigger className="text-xs">
          <SelectValue placeholder="Select column">{field.column}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {getAvailableColumns(table, field.fn).map((col) => (
            <SelectItem
              className="[&>span:nth-of-type(1)]:hidden pr-2 [&>span:nth-of-type(2)]:w-full"
              key={col.name}
              value={col.name}
            >
              <div className="flex justify-between">
                <span className="font-mono">{col.name}</span>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] py-0 px-1", {
                    "border-success text-success": col.type === "string",
                    "border-primary text-primary": col.type === "number",
                  })}
                >
                  {col.type}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button className="text-secondary-foreground" icon="x" size="icon" variant="ghost" onClick={onRemove} />
    </div>
  );
};

const MetricsField = () => {
  const { control } = useFormContext<QueryStructure>();
  const { fields, append, remove } = useFieldArray({
    control,
    keyName: "key",
    name: "metrics",
  });

  const table = useWatch({ control, name: "table" });
  const metrics = useWatch({ control, name: "metrics" });

  return (
    <div className="grid gap-2">
      <Label className="font-semibold text-xs">Metrics</Label>
      <div className="space-y-2">
        {fields.map((field, index) => {
          const isRaw = metrics?.[index]?.fn === "raw";
          return isRaw ? (
            <RawSqlMetricRow key={field.key} index={index} table={table} onRemove={() => remove(index)} />
          ) : (
            <StandardMetricRow key={field.key} index={index} table={table} onRemove={() => remove(index)} />
          );
        })}
        <Button
          icon="plus"
          size="sm"
          className="text-primary hover:text-primary/80"
          variant="ghost"
          onClick={() => append(createMetricFromOption("count", "*", "count"))}
        >
          Add metric
        </Button>
      </div>
    </div>
  );
};

export default MetricsField;
