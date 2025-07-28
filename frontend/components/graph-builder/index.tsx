import React from "react";

import { GraphBuilderStoreProvider, useGraphBuilderStoreContext } from "@/components/graph-builder/graph-builder-store";
import GraphRenderer from "@/components/graph-builder/graph-renderer";
import { GraphType, graphTypeLabelMap } from "@/components/graph-builder/types";
import { ColumnInfo } from "@/components/graph-builder/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const GraphBuilderCore = () => {
  const {
    type,
    setType,
    columns,
    setColumnXAxis,
    setColumnYAxis,
    setColumnBreakdown,
    canSelectForYAxis,
    getAvailableBreakdownColumns,
    getSelectedBreakdownColumn,
    enableTimeRange,
    setEnableTimeRange,
  } = useGraphBuilderStoreContext((state) => ({
    type: state.type,
    setType: state.setType,
    columns: state.columns,
    setColumnXAxis: state.setColumnXAxis,
    setColumnYAxis: state.setColumnYAxis,
    setColumnBreakdown: state.setColumnBreakdown,
    canSelectForYAxis: state.canSelectForYAxis,
    getAvailableBreakdownColumns: state.getAvailableBreakdownColumns,
    getSelectedBreakdownColumn: state.getSelectedBreakdownColumn,
    enableTimeRange: state.enableTimeRange,
    setEnableTimeRange: state.setEnableTimeRange,
  }));

  const availableBreakdownColumns = getAvailableBreakdownColumns();
  const selectedBreakdownColumn = getSelectedBreakdownColumn();
  const hasGraphType = !!type;

  return (
    <div className="flex flex-col space-y-4 w-full h-full">
      <div className="flex-shrink-0 space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Chart type</label>
          <Select value={type || ""} onValueChange={setType}>
            <SelectTrigger className="max-w-xs focus:ring-0">
              <SelectValue placeholder="Select Graph Type" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(graphTypeLabelMap) as GraphType[]).map((item) => (
                <SelectItem key={item} value={item}>
                  <div className="flex items-center">
                    {graphTypeLabelMap[item].icon} {graphTypeLabelMap[item].label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasGraphType && (
          <>
            <div className="flex items-center space-x-2">
              <Checkbox id="enable-time-range" checked={enableTimeRange} onCheckedChange={setEnableTimeRange} />
              <label
                htmlFor="enable-time-range"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Add timestamps to data (for time-based charts)
              </label>
            </div>

            {type === GraphType.LineGraph && availableBreakdownColumns.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Break down lines by</label>
                <Select
                  value={selectedBreakdownColumn?.name || "none"}
                  onValueChange={(value) => {
                    if (selectedBreakdownColumn) {
                      setColumnBreakdown(selectedBreakdownColumn.name, false);
                    }
                    if (value && value !== "none") {
                      setColumnBreakdown(value, true);
                    }
                  }}
                >
                  <SelectTrigger className="max-w-xs focus:ring-0">
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
          </>
        )}
      </div>

      {hasGraphType && (
        <div className="overflow-hidden grid grid-cols-4 h-full gap-4">
          <div className="col-span-1">
            <ScrollArea className="rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow className="bg-muted/50">
                    <TableCell className="font-medium">Column</TableCell>
                    <TableCell className="font-medium w-20 text-center">X</TableCell>
                    <TableCell className="font-medium w-20 text-center">Y</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columns.map((column: ColumnInfo) => (
                    <TableRow key={column.name} className="last:border-b-0 h-14">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{column.name}</span>
                          <span className="text-sm text-muted-foreground">{column.type}</span>
                          {column.isBreakdown && (
                            <span className="text-xs text-blue-600 font-medium">• Line breakdown</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="w-20 text-center">
                        <Switch
                          checked={column.isXAxis}
                          onCheckedChange={(checked) => setColumnXAxis(column.name, checked)}
                          disabled={column.isBreakdown}
                        />
                      </TableCell>
                      <TableCell className="w-20 text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Switch
                                  checked={column.isYAxis}
                                  onCheckedChange={(checked) => setColumnYAxis(column.name, checked)}
                                  disabled={!canSelectForYAxis(column.name) || column.isBreakdown}
                                />
                              </div>
                            </TooltipTrigger>
                            {(!canSelectForYAxis(column.name) || column.isBreakdown) && (
                              <TooltipContent>
                                <p>
                                  {column.isBreakdown
                                    ? "Column is used for line breakdown"
                                    : "String columns cannot be used for Y-axis in this chart type"}
                                </p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
          <div className="col-span-3">
            <GraphRenderer />
          </div>
        </div>
      )}

      {!hasGraphType && (
        <div className="flex items-center justify-center h-full w-full text-muted-foreground">
          <div className="text-center">
            <p className="text-sm">Select a chart type to configure your graph</p>
            <p className="text-xs mt-1">Choose from line, bar, or horizontal bar charts above</p>
          </div>
        </div>
      )}
    </div>
  );
};

interface GraphBuilderProps<T extends Record<string, string | number | boolean>> {
  data: T[];
}

const GraphBuilder = <T extends Record<string, string | number | boolean>>({ data }: GraphBuilderProps<T>) => (
  <GraphBuilderStoreProvider data={data}>
    <GraphBuilderCore />
  </GraphBuilderStoreProvider>
);

export default GraphBuilder;
