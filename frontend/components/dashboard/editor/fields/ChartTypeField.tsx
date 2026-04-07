import { ChartBar, ChartColumn, ChartLine } from "lucide-react";
import { type ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboard/editor/dashboard-editor-store";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type QueryStructure } from "@/lib/actions/sql/types.ts";

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
  const { setValue } = useFormContext<QueryStructure>();
  const { chartType, setChartConfig, chart } = useDashboardEditorStoreContext((state) => ({
    chartType: state.chart.settings.config.type,
    setChartConfig: state.setChartConfig,
    chart: state.chart,
  }));

  const handleChartTypeChange = (newType: ChartType) => {
    setChartConfig({
      ...chart.settings.config,
      type: newType,
    });

    if (newType === ChartType.LineChart || newType === ChartType.BarChart) {
      setValue("orderBy", []);
    }
  };

  return (
    <div className="grid gap-1">
      <Label className="font-semibold text-xs">Type</Label>
      <Select value={chartType || ""} onValueChange={(value) => handleChartTypeChange(value as ChartType)}>
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
    </div>
  );
};

export default ChartTypeField;
