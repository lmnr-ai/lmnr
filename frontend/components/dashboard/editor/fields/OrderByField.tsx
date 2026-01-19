import { useMemo } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { getAvailableColumns } from "@/components/dashboard/editor/table-schemas";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type QueryStructure } from "@/lib/actions/sql/types";
import { cn } from "@/lib/utils.ts";

const OrderByField = () => {
  const { control } = useFormContext<QueryStructure>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "orderBy",
  });

  const table = useWatch({ control, name: "table" });
  const [orderBy = [], metrics = [], dimensions = []] = useWatch({
    control,
    name: ["orderBy", "metrics", "dimensions"],
  });

  const availableFields = useMemo(() => {
    const availableColumns = getAvailableColumns(table).filter((col) => col.name !== "*");
    const fields: Array<{ name: string; type: "string" | "number"; description: string }> = [];

    metrics.forEach((metric) => {
      const fieldName = metric.alias || metric.column;
      const column = availableColumns.find((col) => col.name === metric.column);
      fields.push({
        name: fieldName,
        type: column?.type || "number",
        description: `Metric: ${metric.fn}(${metric.column})`,
      });
    });

    dimensions.forEach((dim) => {
      if (!fields.some((f) => f.name === dim)) {
        const column = availableColumns.find((col) => col.name === dim);
        if (column) {
          fields.push(column);
        }
      }
    });

    return fields;
  }, [table, metrics, dimensions]);

  const selectedFields = orderBy.map((o) => o.field);
  const unselectedFields = availableFields.filter((field) => !selectedFields.includes(field.name));

  const addOrderBy = () => {
    append({ field: "", dir: "desc" });
  };

  return (
    <div className="grid gap-2">
      <Label className="font-semibold text-xs">
        Order By <span className="text-muted-foreground font-normal">(optional)</span>
      </Label>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex gap-2">
            <Controller
              render={({ field: { value, onChange } }) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger className="text-xs flex-1">
                    <SelectValue placeholder="Select field">{value}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((availableField) => (
                      <SelectItem
                        className="[&>span:nth-of-type(1)]:hidden pr-2 [&>span:nth-of-type(2)]:w-full"
                        key={availableField.name}
                        value={availableField.name}
                        disabled={
                          selectedFields.includes(availableField.name) && orderBy[index].field !== availableField.name
                        }
                      >
                        <div className="flex justify-between">
                          <span className="font-mono">{availableField.name}</span>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] py-0 px-1", {
                              "border-success text-success": availableField.type === "string",
                              "border-primary text-primary": availableField.type === "number",
                            })}
                          >
                            {availableField.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              name={`orderBy.${index}.field`}
              control={control}
            />
            <Controller
              render={({ field: { value, onChange } }) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger className="text-xs w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descending</SelectItem>
                    <SelectItem value="asc">Ascending</SelectItem>
                  </SelectContent>
                </Select>
              )}
              name={`orderBy.${index}.dir`}
              control={control}
            />
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
          onClick={addOrderBy}
          disabled={unselectedFields.length === 0}
        >
          Add order by
        </Button>
      </div>
    </div>
  );
};

export default OrderByField;
