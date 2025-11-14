import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { FILTER_OPERATOR_OPTIONS } from "@/components/dashboard/editor/constants";
import { getAvailableColumns } from "@/components/dashboard/editor/table-schemas";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button";
import { Operator } from "@/components/ui/datatable-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryStructure } from "@/lib/actions/sql/types";
import { cn } from "@/lib/utils.ts";

const FiltersField = () => {
  const { control } = useFormContext<QueryStructure>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "filters",
  });

  const table = useWatch({ control, name: "table" });

  return (
    <div className="grid gap-2">
      <Label className="font-semibold text-xs">
        Filters <span className="text-muted-foreground font-normal">(optional)</span>
      </Label>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex gap-2">
            <Controller
              name={`filters.${index}.field`}
              control={control}
              render={({ field: { value, onChange } }) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger className="w-fit text-xs">
                    <SelectValue placeholder="Column">{value}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableColumns(table)
                      .filter((col) => col.name !== "*")
                      .map((col) => (
                        <SelectItem
                          className="[&>span:nth-of-type(1)]:hidden pr-2 [&>span:nth-of-type(2)]:w-full"
                          key={col.name}
                          value={col.name}
                        >
                          <div className="flex justify-between gap-2">
                            <span className="font-mono text-xs">{col.name}</span>
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
            />
            <Controller
              name={`filters.${index}.op`}
              control={control}
              render={({ field: { onChange, value } }) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger className="w-fit font-medium text-xs px-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_OPERATOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <Controller
              name={`filters.${index}.value`}
              control={control}
              render={({ field: { value, onChange } }) => (
                <Input
                  placeholder="Enter value"
                  value={value?.toString() ?? ""}
                  onChange={onChange}
                  className="text-xs! placeholder:text-xs"
                />
              )}
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
          onClick={() => {
            const availableColumns = getAvailableColumns(table).filter((col) => col.name !== "*");
            const firstColumn = availableColumns[0];
            if (firstColumn) {
              append({
                field: firstColumn.name,
                op: Operator.Eq,
                value: "",
              });
            }
          }}
        >
          Add filter
        </Button>
      </div>
    </div>
  );
};

export default FiltersField;
