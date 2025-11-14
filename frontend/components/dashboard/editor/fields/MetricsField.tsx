import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import {
  createMetricFromOption,
  getMetricFunctionValue,
  METRIC_FUNCTION_OPTIONS,
} from "@/components/dashboard/editor/constants";
import { getAvailableColumns } from "@/components/dashboard/editor/table-schemas";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryStructure } from "@/lib/actions/sql/types";
import { cn } from "@/lib/utils.ts";

const MetricsField = () => {
  const { control } = useFormContext<QueryStructure>();
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "metrics",
  });

  const table = useWatch({ control, name: "table" });

  return (
    <div className="grid gap-2">
      <Label className="font-semibold text-xs">Metrics</Label>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex gap-2">
            <Select
              value={getMetricFunctionValue(field)}
              onValueChange={(fnValue) => {
                const newMetric = createMetricFromOption(fnValue, field.column || "count");
                if (newMetric.fn === "count") {
                  update(index, { ...newMetric, column: "*", alias: "count" });
                } else {
                  update(index, { ...newMetric, column: "" });
                }
              }}
            >
              <SelectTrigger className="w-24">
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
            <Button
              className="text-secondary-foreground"
              icon="x"
              size="icon"
              variant="ghost"
              onClick={() => remove(index)}
            />
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
