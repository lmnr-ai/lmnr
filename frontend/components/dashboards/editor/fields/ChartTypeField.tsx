import { ChartBar, ChartColumn, ChartLine, Table2 } from "lucide-react";
import { type ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { transformFormForChartType } from "@/components/dashboards/editor/utils";
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
  [ChartType.Table]: {
    label: "Table",
    icon: <Table2 className="size-3.5" />,
  },
};

const ChartTypeField = () => {
  const { reset, getValues } = useFormContext<QueryStructure>();
  const { chartType, setChartConfig, chart, setData } = useDashboardEditorStoreContext((state) => ({
    chartType: state.chart.settings.config.type,
    setChartConfig: state.setChartConfig,
    chart: state.chart,
    setData: state.setData,
  }));

  const handleChartTypeChange = (newType: ChartType) => {
    const previousType = chart.settings.config.type;
    setChartConfig({ ...chart.settings.config, type: newType });
    // Clear stale data so the preview doesn't show results from the previous
    // chart type's query (which may have had a different or no LIMIT).
    setData([]);
    reset(transformFormForChartType(getValues(), newType, previousType));
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
