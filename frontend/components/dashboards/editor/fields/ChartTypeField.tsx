import { ChartBar, ChartColumn, ChartLine, Hash, type LucideIcon, Table2 } from "lucide-react";
import { useFormContext } from "react-hook-form";

import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { transformFormForChartType } from "@/components/dashboards/editor/utils";
import { Label } from "@/components/ui/label";
import { type QueryStructure } from "@/lib/actions/sql/types.ts";
import { cn } from "@/lib/utils";

const CHART_TYPES: { type: ChartType; label: string; title: string; icon: LucideIcon }[] = [
  { type: ChartType.LineChart, label: "Line", title: "Line chart", icon: ChartLine },
  { type: ChartType.BarChart, label: "Bar", title: "Bar chart", icon: ChartColumn },
  { type: ChartType.HorizontalBarChart, label: "Horizontal", title: "Horizontal bar chart", icon: ChartBar },
  { type: ChartType.Table, label: "Table", title: "Table", icon: Table2 },
  { type: ChartType.Value, label: "Value", title: "Single value: a big number, or text", icon: Hash },
];

const ChartTypeField = () => {
  const { reset, getValues } = useFormContext<QueryStructure>();
  const { chartType, setChartConfig, chart, setData, editorMode } = useDashboardEditorStoreContext((state) => ({
    chartType: state.chart.settings.config.type,
    editorMode: state.editorMode,
    setChartConfig: state.setChartConfig,
    chart: state.chart,
    setData: state.setData,
  }));

  const handleChartTypeChange = (newType: ChartType) => {
    const previousType = chart.settings.config.type;
    if (newType === previousType) return;
    setChartConfig({ ...chart.settings.config, type: newType });
    // Advanced keeps its SQL as written, so its current rows stay valid for the new type.
    if (editorMode === "sql") return;
    // Clear stale data so the preview doesn't show results from the previous
    // chart type's query (which may have had a different or no LIMIT).
    setData([]);
    reset(transformFormForChartType(getValues(), newType, previousType));
  };

  return (
    <div className="grid gap-1">
      <Label className="font-semibold text-xs">Type</Label>
      <div
        role="radiogroup"
        aria-label="Chart type"
        // Same surfaces as the Standard/Advanced tabs below it.
        className="grid grid-cols-5 gap-1 rounded-lg bg-surface-down-2 p-[3px] dark:bg-muted"
      >
        {CHART_TYPES.map(({ type, label, title, icon: Icon }) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={chartType === type}
            title={title}
            onClick={() => handleChartTypeChange(type)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              chartType === type && "bg-surface-up text-foreground shadow-sm dark:bg-background"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ChartTypeField;
