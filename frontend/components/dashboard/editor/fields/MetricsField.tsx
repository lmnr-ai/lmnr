import { useParams } from "next/navigation";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

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

const MetricsField = () => {
  const { projectId } = useParams();
  const { control } = useFormContext<QueryStructure>();
  const { fields, append, remove, update } = useFieldArray({
    control,
    keyName: "key",
    name: "metrics",
  });

  const table = useWatch({ control, name: "table" });

  const sqlSchema: SQLSchemaConfig = { tables: [table] };

  return (
    <div className="grid gap-2">
      <Label className="font-semibold text-xs">Metrics</Label>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.key} className="grid gap-2">
            <div className="flex gap-2">
              <Select
                value={getMetricFunctionValue(field)}
                onValueChange={(fnValue) => {
                  if (fnValue === "raw") {
                    update(index, { fn: "raw", column: "", args: [], rawSql: "", alias: "" });
                  } else {
                    const newMetric = createMetricFromOption(fnValue, field.column || "count");
                    if (newMetric.fn === "count") {
                      update(index, { ...newMetric, column: "*", alias: "count" });
                    } else {
                      update(index, { ...newMetric, column: "" });
                    }
                  }
                }}
              >
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
              {field.fn !== "raw" && (
                <Select
                  value={field.column}
                  onValueChange={(column) => update(index, { ...field, column })}
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
              )}
              <Button
                className="text-secondary-foreground"
                icon="x"
                size="icon"
                variant="ghost"
                onClick={() => remove(index)}
              />
            </div>
            {field.fn === "raw" && (
              <div className="grid gap-1.5 pl-1">
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
                <div className="h-20 flex flex-1 border rounded-md overflow-hidden">
                  <SQLEditor
                    value={field.rawSql ?? ""}
                    onChange={(value) => update(index, { ...field, rawSql: value })}
                    editable
                    placeholder="e.g. countIf(status = 'ERROR')"
                    schema={sqlSchema}
                    projectId={projectId as string}
                  />
                </div>
                <Input
                  placeholder="Alias (e.g. error_count)"
                  value={field.alias ?? ""}
                  onChange={(e) => update(index, { ...field, alias: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
            )}
          </div>
        ))}
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
