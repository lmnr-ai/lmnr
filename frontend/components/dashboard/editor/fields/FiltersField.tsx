import {
  type Control,
  Controller,
  useFieldArray,
  useFormContext,
  type UseFormSetValue,
  useWatch,
} from "react-hook-form";

import { FILTER_OPERATOR_OPTIONS } from "@/components/dashboard/editor/constants";
import { getAvailableColumns } from "@/components/dashboard/editor/table-schemas";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Operator } from "@/lib/actions/common/operators";
import { type QueryStructure } from "@/lib/actions/sql/types";
import { cn } from "@/lib/utils.ts";

interface FilterRowProps {
  index: number;
  control: Control<QueryStructure>;
  table: string;
  setValue: UseFormSetValue<QueryStructure>;
  remove: (index: number) => void;
}

const FilterRow = ({ index, control, table, setValue, remove }: FilterRowProps) => {
  const watchedFieldName = useWatch({ control, name: `filters.${index}.field` });
  const selectedColumn = getAvailableColumns(table).find((col) => col.name === watchedFieldName);
  const isNumericColumn = selectedColumn?.type === "number";

  return (
    <div className="flex gap-2">
      <Controller
        name={`filters.${index}.field`}
        control={control}
        render={({ field: { value, onChange } }) => (
          <Select
            value={value}
            onValueChange={(newField) => {
              const newColumn = getAvailableColumns(table).find((col) => col.name === newField);
              const isNowNumeric = newColumn?.type === "number";

              // Always ensure only the correct value field exists
              if (isNowNumeric) {
                setValue(`filters.${index}.numberValue` as any, 0);
                setValue(`filters.${index}.stringValue` as any, undefined);
              } else {
                setValue(`filters.${index}.stringValue` as any, "");
                setValue(`filters.${index}.numberValue` as any, undefined);
              }

              onChange(newField);
            }}
          >
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
      {isNumericColumn ? (
        <Controller
          name={`filters.${index}.numberValue` as any}
          control={control}
          render={({ field: { value, onChange } }) => (
            <Input
              type="number"
              placeholder="Enter number"
              value={value ?? ""}
              onChange={(e) => {
                const numValue = e.target.value === "" ? 0 : parseFloat(e.target.value);
                onChange(isNaN(numValue) ? 0 : numValue);
              }}
              className="text-xs! placeholder:text-xs"
            />
          )}
        />
      ) : (
        <Controller
          name={`filters.${index}.stringValue` as any}
          control={control}
          render={({ field: { value, onChange } }) => (
            <Input
              type="text"
              placeholder="Enter value"
              value={value ?? ""}
              onChange={onChange}
              className="text-xs! placeholder:text-xs"
            />
          )}
        />
      )}
      <Button
        className="text-secondary-foreground"
        icon="x"
        size="icon"
        variant="ghost"
        onClick={() => remove(index)}
      />
    </div>
  );
};

const FiltersField = () => {
  const { control, setValue } = useFormContext<QueryStructure>();
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
          <FilterRow key={field.id} index={index} control={control} table={table} setValue={setValue} remove={remove} />
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
              // Create the appropriate filter structure based on column type
              const newFilter = {
                field: firstColumn.name,
                op: Operator.Eq,
                ...(firstColumn.type === "number" ? { numberValue: 0 } : { stringValue: "" }),
              };
              append(newFilter as any);
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
