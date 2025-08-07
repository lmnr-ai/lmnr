import { ChartBar, ChartColumn, ChartLine, Upload } from "lucide-react";
import React, { ReactNode } from "react";

import {
  ChartBuilderProps,
  ChartBuilderStoreProvider,
  useChartBuilderStoreContext,
} from "@/components/chart-builder/chart-builder-store";
import ChartRenderer from "@/components/chart-builder/charts";
import ExportChartDialog from "@/components/chart-builder/export-chart-dialog";
import { ChartType } from "@/components/chart-builder/types";
import { ColumnInfo } from "@/components/chart-builder/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const ChartBuilderCore = () => {
  const {
    chartConfig,
    setChartType,
    setXColumn,
    setYColumn,
    setBreakdownColumn,
    setShowTotal,
    columns,
    canSelectForYAxis,
    getAvailableBreakdownColumns,
    getSelectedBreakdownColumn,
    isValidChartConfiguration,
  } = useChartBuilderStoreContext((state) => ({
    chartConfig: state.chartConfig,
    setChartType: state.setChartType,
    setXColumn: state.setXColumn,
    setYColumn: state.setYColumn,
    setBreakdownColumn: state.setBreakdownColumn,
    setShowTotal: state.setShowTotal,
    columns: state.columns,
    canSelectForYAxis: state.canSelectForYAxis,
    getAvailableBreakdownColumns: state.getAvailableBreakdownColumns,
    getSelectedBreakdownColumn: state.getSelectedBreakdownColumn,
    isValidChartConfiguration: state.isValidChartConfiguration,
  }));

  const availableBreakdownColumns = getAvailableBreakdownColumns();
  const selectedBreakdownColumn = getSelectedBreakdownColumn();
  const hasChartType = !!chartConfig.type;

  const isColumnSelected = (columnName: string, axis: "x" | "y" | "breakdown") => {
    switch (axis) {
      case "x":
        return chartConfig.x === columnName;
      case "y":
        return chartConfig.y === columnName;
      case "breakdown":
        return chartConfig.breakdown === columnName;
      default:
        return false;
    }
  };

  return (
    <div className="grid grid-cols-4 h-full divide-x overflow-hidden">
      <ScrollArea className="col-span-1">
        <div className="flex flex-col flex-1 gap-3 p-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Chart type</label>
            <Select value={chartConfig.type || ""} onValueChange={setChartType}>
              <SelectTrigger className="focus:ring-0">
                <SelectValue placeholder="Select Chart Type" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(chartTypeLabelMap) as ChartType[]).map((item) => (
                  <SelectItem key={item} value={item}>
                    <div className="flex items-center">
                      {chartTypeLabelMap[item].icon} {chartTypeLabelMap[item].label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasChartType && chartConfig.type === ChartType.LineChart && availableBreakdownColumns.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-1 block">Break down lines by</label>
              <Select
                value={selectedBreakdownColumn?.name || "none"}
                onValueChange={(value) => {
                  setBreakdownColumn(value === "none" ? undefined : value);
                }}
              >
                <SelectTrigger className="focus:ring-0">
                  <SelectValue placeholder="Select column for multiple lines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (single line)</SelectItem>
                  {availableBreakdownColumns.map((column) => (
                    <SelectItem key={column.name} value={column.name}>
                      <div className="flex items-center space-x-2">
                        <span>{column.name}</span>
                        <span className="text-xs text-muted-foreground">({column.type})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {hasChartType && (
            <div>
              <label className="text-sm font-medium mb-1 block">Axes</label>
              <div className="rounded-lg border min-h-fit mt-2">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow className="bg-muted/50 rounded-lg">
                      <TableCell className="font-medium rounded-tl-lg">Column</TableCell>
                      <TableCell className="font-medium w-20 text-center">X</TableCell>
                      <TableCell className="font-medium w-20 text-center rounded-tr-lg">Y</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {columns.length === 0 ? (
                      <TableRow className="last:border-b-0 h-14">
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          <div className="text-center">
                            <p className="text-sm">No columns available</p>
                            <p className="text-xs mt-1">Make sure your data has valid columns</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      columns.map((column: ColumnInfo) => (
                        <TableRow key={column.name} className="last:border-b-0">
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{column.name}</span>
                              <span className="text-sm text-muted-foreground">{column.type}</span>
                              {isColumnSelected(column.name, "breakdown") && (
                                <span className="text-xs text-blue-600 font-medium">• Line breakdown</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="w-20 text-center">
                            <Switch
                              checked={isColumnSelected(column.name, "x")}
                              onCheckedChange={(checked) => setXColumn(checked ? column.name : undefined)}
                              disabled={isColumnSelected(column.name, "breakdown")}
                            />
                          </TableCell>
                          <TableCell className="w-20 text-center">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <Switch
                                      checked={isColumnSelected(column.name, "y")}
                                      onCheckedChange={(checked) => setYColumn(checked ? column.name : undefined)}
                                      disabled={
                                        !canSelectForYAxis(column.name) || isColumnSelected(column.name, "breakdown")
                                      }
                                    />
                                  </div>
                                </TooltipTrigger>
                                {(!canSelectForYAxis(column.name) || isColumnSelected(column.name, "breakdown")) && (
                                  <TooltipContent>
                                    <p>
                                      {isColumnSelected(column.name, "breakdown")
                                        ? "Column is used for line breakdown"
                                        : "String columns cannot be used for Y-axis in this chart type"}
                                    </p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              disabled={!hasChartType}
              id="show-total"
              checked={chartConfig.total || false}
              onCheckedChange={setShowTotal}
            />
            <label className="text-sm font-medium block">Show Total</label>
          </div>

          <ExportChartDialog>
            <Button
              variant="outlinePrimary"
              disabled={!hasChartType || !isValidChartConfiguration()}
              className="self-end"
            >
              <Upload className="w-4 h-4 mr-2" />
              Export to Dashboard
            </Button>
          </ExportChartDialog>
        </div>
      </ScrollArea>

      <ScrollArea className="col-span-3">
        <div className="size-full p-4">
          {!hasChartType ? (
            <div className="flex flex-1 items-center justify-center h-full w-full text-muted-foreground">
              <div className="text-center">
                <p className="text">Select a chart type to configure your chart</p>
                <p className="text-sm mt-1">Choose from line, bar, or horizontal bar charts above</p>
              </div>
            </div>
          ) : (
            <ChartRenderer />
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

const ChartBuilder = ({ data, query }: ChartBuilderProps) => (
  <ChartBuilderStoreProvider data={data} query={query}>
    <ChartBuilderCore />
  </ChartBuilderStoreProvider>
);

export default ChartBuilder;

export const chartTypeLabelMap: Record<ChartType, { label: string; icon: ReactNode }> = {
  [ChartType.LineChart]: {
    label: "Line Chart",
    icon: <ChartLine className="w-4 h-4 mr-2" />,
  },
  [ChartType.BarChart]: {
    label: "Bar Chart",
    icon: <ChartColumn className="w-4 h-4 mr-2" />,
  },
  [ChartType.HorizontalBarChart]: {
    label: "Horizontal Bar Chart",
    icon: <ChartBar className="w-4 h-4 mr-2" />,
  },
};
