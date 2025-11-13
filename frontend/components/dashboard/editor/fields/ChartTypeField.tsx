import { ChartBar, ChartColumn, ChartLine } from "lucide-react";
import { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { ChartType } from "@/components/chart-builder/types";
import { VisualQueryBuilderForm } from "@/components/dashboard/editor/types";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const chartTypeOptions: Record<ChartType, { label: string; icon: ReactNode }> = {
  [ChartType.LineChart]: {
    label: "Line Chart",
    icon: <ChartLine className="size-3.5" />,
  },
  [ChartType.BarChart]: {
    label: "Bar Chart",
    icon: <ChartColumn className="size-3.5" />,
  },
  [ChartType.HorizontalBarChart]: {
    label: "Horizontal Bar",
    icon: <ChartBar className="size-3.5" />,
  },
};

const ChartTypeField = () => {
  const { control } = useFormContext<VisualQueryBuilderForm>();

  return (
    <div className="grid gap-1">
      <Label className="font-semibold text-xs">Type</Label>
      <Controller
        control={control}
        name="chartType"
        render={({ field }) => (
          <Select value={field.value || ""} onValueChange={(value) => field.onChange(value as ChartType)}>
            <SelectTrigger>
              <SelectValue placeholder="Select chart type" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(chartTypeOptions) as ChartType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  <div className="flex items-center gap-2">
                    {chartTypeOptions[type].icon}
                    <span>{chartTypeOptions[type].label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
};

export default ChartTypeField;
