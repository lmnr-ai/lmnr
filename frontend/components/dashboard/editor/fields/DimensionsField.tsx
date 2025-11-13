import { useFormContext, useWatch } from "react-hook-form";

import { getAvailableColumns } from "@/components/dashboard/editor/table-schemas";
import { VisualQueryBuilderForm } from "@/components/dashboard/editor/types";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils.ts";

const DimensionsField = () => {
  const { control, setValue } = useFormContext<VisualQueryBuilderForm>();
  const table = useWatch({ control, name: "table" });
  const dimensions = useWatch({ control, name: "dimensions" }) || [];

  const availableColumns = getAvailableColumns(table).filter((col) => col.name !== "*");

  const unselectedColumns = availableColumns.filter((col) => !dimensions.includes(col.name));

  const addDimension = () => {
    setValue("dimensions", [...dimensions, ""], { shouldValidate: true });
  };

  const updateDimension = (index: number, value: string) => {
    const newDimensions = [...dimensions];
    newDimensions[index] = value;
    setValue("dimensions", newDimensions, { shouldValidate: true });
  };

  const removeDimension = (index: number) => {
    setValue(
      "dimensions",
      dimensions.filter((_, i) => i !== index),
      { shouldValidate: true }
    );
  };

  return (
    <div className="grid gap-2">
      <Label className="font-semibold text-xs">
        Group By <span className="text-muted-foreground font-normal">(optional)</span>
      </Label>
      <div className="space-y-2">
        {dimensions.map((dimension, index) => (
          <div key={index} className="flex gap-2">
            <Select value={dimension} onValueChange={(value) => updateDimension(index, value)}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select column">{dimension}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableColumns.map((col) => (
                  <SelectItem
                    className="[&>span:nth-of-type(1)]:hidden pr-2 [&>span:nth-of-type(2)]:w-full"
                    key={col.name}
                    value={col.name}
                    disabled={dimensions.includes(col.name) && dimensions[index] !== col.name}
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
              onClick={() => removeDimension(index)}
            />
          </div>
        ))}
        <Button
          icon="plus"
          size="sm"
          className="text-primary hover:text-primary/80"
          variant="ghost"
          onClick={addDimension}
          disabled={unselectedColumns.length === 0}
        >
          Add dimension
        </Button>
      </div>
    </div>
  );
};

export default DimensionsField;
