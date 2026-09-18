import { Upload } from "lucide-react";

import { useChartBuilderStoreContext } from "@/components/chart-builder/chart-builder-store";
import ColumnSelect from "@/components/chart-builder/column-select";
import { CHART_TYPE_OPTIONS } from "@/components/chart-builder/constants";
import ExportChartDialog from "@/components/chart-builder/export-chart-dialog";
import { ChartType } from "@/components/chart-builder/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Left rail of the chart builder: chart type, the two axes, an optional breakdown, and export. */
const ChartControls = () => {
  const {
    chartConfig,
    columns,
    setChartType,
    setXColumn,
    setYColumn,
    setBreakdownColumn,
    setShowTotal,
    canSelectForXAxis,
    canSelectForYAxis,
    getAvailableBreakdownColumns,
    isValidChartConfiguration,
  } = useChartBuilderStoreContext((state) => ({
    chartConfig: state.chartConfig,
    columns: state.columns,
    setChartType: state.setChartType,
    setXColumn: state.setXColumn,
    setYColumn: state.setYColumn,
    setBreakdownColumn: state.setBreakdownColumn,
    setShowTotal: state.setShowTotal,
    canSelectForXAxis: state.canSelectForXAxis,
    canSelectForYAxis: state.canSelectForYAxis,
    getAvailableBreakdownColumns: state.getAvailableBreakdownColumns,
    isValidChartConfiguration: state.isValidChartConfiguration,
  }));

  const isHorizontal = chartConfig.type === ChartType.HorizontalBarChart;
  const breakdownColumns = getAvailableBreakdownColumns();
  const showBreakdown = chartConfig.type === ChartType.LineChart && breakdownColumns.length > 0;

  return (
    <div className="flex w-56 shrink-0 flex-col border-r">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Chart type</span>
            <TooltipProvider>
              <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
                {CHART_TYPE_OPTIONS.map(({ type, label, icon: Icon }) => (
                  <Tooltip key={type}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={chartConfig.type === type}
                        onClick={() => setChartType(type)}
                        className={cn(
                          "flex h-7 flex-1 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-up-2 hover:text-foreground",
                          chartConfig.type === type && "bg-surface-up-2 text-foreground"
                        )}
                      >
                        <Icon className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>

          <ColumnSelect
            label={isHorizontal ? "Value" : "X axis"}
            columns={columns.filter((column) => canSelectForXAxis(column.name))}
            value={chartConfig.x}
            onChange={setXColumn}
          />

          <ColumnSelect
            label={isHorizontal ? "Category" : "Y axis"}
            columns={columns.filter((column) => canSelectForYAxis(column.name))}
            value={chartConfig.y}
            onChange={setYColumn}
          />

          {showBreakdown && (
            <ColumnSelect
              label="Break down lines by"
              columns={breakdownColumns}
              value={chartConfig.breakdown}
              onChange={setBreakdownColumn}
              noneLabel="None (single line)"
            />
          )}

          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
            <Checkbox id="show-total" checked={chartConfig.total || false} onCheckedChange={setShowTotal} />
            Show total
          </label>
        </div>
      </ScrollArea>

      <div className="border-t p-2">
        <ExportChartDialog>
          <Button variant="outline" size="sm" className="w-full" disabled={!isValidChartConfiguration()}>
            <Upload data-icon="inline-start" className="size-3.5" />
            Export to dashboard
          </Button>
        </ExportChartDialog>
      </div>
    </div>
  );
};

export default ChartControls;
