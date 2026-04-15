import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { getAvailableColumns } from "@/components/home/editor/table-schemas";
import SQLEditor from "@/components/sql/sql-editor";
import type { SQLSchemaConfig } from "@/components/sql/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Metric, type QueryStructure } from "@/lib/actions/sql/types";
import { cn } from "@/lib/utils";

const CUSTOM_OPTION_VALUE = "__custom__";

interface ColumnsRowProps {
  index: number;
  table: string;
  /** Names already taken by other rows — disable in the select. */
  disabledColumnNames: Set<string>;
  onRemove: () => void;
  /** Whether removal is allowed (false when only one row remains). */
  canRemove: boolean;
}

/** A column entry stored as a Metric. We treat:
 *   - `fn: "raw"` with `column === alias` and `column ∈ table schema` → "data" source
 *   - `fn: "raw"` with arbitrary `column` expression → "custom" source
 */
const isCustomMetric = (metric: Metric, availableColumnNames: Set<string>): boolean => {
  if (metric.fn !== "raw") return false;
  if (!metric.column) return false;
  return !availableColumnNames.has(metric.column) || metric.column !== metric.alias;
};

/** Stable random alias for custom SQL columns. Generated once per source-switch
 *  so the alias survives reorders/removals (using index would shift on every
 *  remove and trigger a re-fetch). */
const generateCustomAlias = (): string =>
  `column_${Math.random().toString(36).slice(2, 8)}`;

const ColumnsRow = ({ index, table, disabledColumnNames, onRemove, canRemove }: ColumnsRowProps) => {
  const { control, setValue } = useFormContext<QueryStructure>();
  const metric = useWatch({ control, name: `metrics.${index}` });

  const availableColumns = useMemo(() => getAvailableColumns(table).filter((c) => c.name !== "*"), [table]);
  const availableColumnNames = useMemo(() => new Set(availableColumns.map((c) => c.name)), [availableColumns]);

  const isCustom = isCustomMetric(metric, availableColumnNames);
  const sourceValue = isCustom ? CUSTOM_OPTION_VALUE : metric.column || "";

  const sqlSchema: SQLSchemaConfig = useMemo(() => ({ tables: [table] }), [table]);

  const handleSourceChange = (value: string) => {
    if (value === CUSTOM_OPTION_VALUE) {
      // Custom mode: alias is auto-generated stable id used as the rendered header.
      setValue(
        `metrics.${index}`,
        { fn: "raw", column: "", alias: generateCustomAlias(), args: [] },
        { shouldValidate: true }
      );
    } else {
      // Data column: alias mirrors the column name so we can detect data-mode on reload.
      setValue(`metrics.${index}`, { fn: "raw", column: value, alias: value, args: [] }, { shouldValidate: true });
    }
  };

  return (
    <div className="grid gap-2 border rounded p-2 bg-secondary/50">
      <div className="flex gap-2 items-start">
        <Select value={sourceValue} onValueChange={handleSourceChange}>
          <SelectTrigger className="text-xs flex-1">
            <SelectValue placeholder="Select column">
              {sourceValue === CUSTOM_OPTION_VALUE ? "Custom SQL" : sourceValue}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableColumns.map((col) => (
              <SelectItem
                className="[&>span:nth-of-type(1)]:hidden pr-2 [&>span:nth-of-type(2)]:w-full"
                key={col.name}
                value={col.name}
                disabled={disabledColumnNames.has(col.name) && metric.column !== col.name}
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
            <SelectItem value={CUSTOM_OPTION_VALUE}>
              <span className="font-mono">Custom SQL</span>
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          className="text-secondary-foreground"
          icon="x"
          size="icon"
          variant="ghost"
          onClick={onRemove}
          disabled={!canRemove}
        />
      </div>
      {isCustom && (
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
                  onChange={field.onChange}
                  editable
                  placeholder={`e.g. concat(name, ' (', model, ')')`}
                  schema={sqlSchema}
                  generationMode="eval-expression"
                  inputPlaceholder="e.g. Concatenate name and model"
                />
              </div>
            )}
          />
          <p className="text-[10px] text-muted-foreground">
            Expression is selected as <span className="font-mono">{metric.alias}</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default ColumnsRow;
