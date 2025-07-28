import React, { useMemo } from "react";

import BarChart from "@/components/graph-builder/charts/bar-chart";
import HorizontalBarChart from "@/components/graph-builder/charts/horizontal-bar-chart";
import LineChart from "@/components/graph-builder/charts/line-chart";
import { useGraphBuilderStoreContext } from "@/components/graph-builder/graph-builder-store";
import { GraphType } from "@/components/graph-builder/types";
import { ColumnInfo } from "@/components/graph-builder/utils";
import { ChartConfig } from "@/components/ui/chart";

const selectColumnsFromData = (
  data: Record<string, any>[],
  xColumn: ColumnInfo,
  yColumns: ColumnInfo[]
): Record<string, any>[] =>
  data.map((row) => {
    const selectedRow: Record<string, any> = {
      [xColumn.name]: row[xColumn.name],
    };

    yColumns.forEach((yColumn) => {
      selectedRow[yColumn.name] = row[yColumn.name];
    });

    return selectedRow;
  });

const createMultiColumnChartConfig = (yColumns: ColumnInfo[]): ChartConfig =>
  Object.fromEntries(
    yColumns.map((column, index) => [
      column.name,
      {
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
        label: column.name,
      },
    ])
  );

const groupDataByXAndBreakdown = (
  data: Record<string, any>[],
  xColumnName: string,
  yColumnName: string,
  breakdownColumnName: string
): Map<string, Record<string, number>> => {
  const groupedByX = new Map<string, Record<string, number>>();

  data.forEach((row) => {
    const xValue = String(row[xColumnName]);
    const breakdownValue = String(row[breakdownColumnName]);
    const yValue = Number(row[yColumnName]) || 0;

    if (!groupedByX.has(xValue)) {
      groupedByX.set(xValue, {});
    }

    groupedByX.get(xValue)![breakdownValue] = yValue;
  });

  return groupedByX;
};

const createChartDataFromGroups = (
  groupedData: Map<string, Record<string, number>>,
  xColumnName: string,
  allBreakdownValues: Set<string>
): Record<string, any>[] =>
  Array.from(groupedData.entries()).map(([xValue, breakdownGroups]) => ({
    ...Object.fromEntries(Array.from(allBreakdownValues).map((value) => [value, 0])),
    ...breakdownGroups,
    [xColumnName]: xValue,
  }));

const createBreakdownChartConfig = (breakdownValues: Set<string>): ChartConfig =>
  Object.fromEntries(
    Array.from(breakdownValues).map((value, index) => [
      value,
      {
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
        label: value,
      },
    ])
  );

const transformDataForBreakdownChart = (
  data: Record<string, any>[],
  xColumn: ColumnInfo,
  yColumn: ColumnInfo,
  breakdownColumn: ColumnInfo
) => {
  const allBreakdownValues = new Set(data.map((row) => String(row[breakdownColumn.name])));
  const groupedData = groupDataByXAndBreakdown(data, xColumn.name, yColumn.name, breakdownColumn.name);
  const chartData = createChartDataFromGroups(groupedData, xColumn.name, allBreakdownValues);
  const chartConfig = createBreakdownChartConfig(allBreakdownValues);

  return {
    chartData,
    keys: allBreakdownValues,
    chartConfig,
  };
};

const transformDataForSimpleChart = (data: Record<string, any>[], xColumn: ColumnInfo, yColumns: ColumnInfo[]) => {
  const chartData = selectColumnsFromData(data, xColumn, yColumns);
  const keys = new Set(yColumns.map((col) => col.name));
  const chartConfig = createMultiColumnChartConfig(yColumns);

  return {
    chartData,
    keys,
    chartConfig,
  };
};

const GraphRenderer = () => {
  const {
    chartConfig,
    getSelectedXColumn,
    getSelectedYColumns,
    getSelectedBreakdownColumn,
    isValidGraphConfiguration,
    data
  } = useGraphBuilderStoreContext((state) => ({
    chartConfig: state.chartConfig,
    getSelectedXColumn: state.getSelectedXColumn,
    getSelectedYColumns: state.getSelectedYColumns,
    getSelectedBreakdownColumn: state.getSelectedBreakdownColumn,
    isValidGraphConfiguration: state.isValidGraphConfiguration,
    data: state.data,
  }));

  const selectedXColumn = getSelectedXColumn();
  const selectedYColumns = getSelectedYColumns();
  const selectedBreakdownColumn = getSelectedBreakdownColumn();
  const hasValidConfiguration = isValidGraphConfiguration();

  const { chartData, keys, chartConfig: uiChartConfig } = useMemo(() => {
    if (!hasValidConfiguration || !selectedXColumn || selectedYColumns.length === 0) {
      return { chartData: [], keys: new Set<string>(), chartConfig: {} };
    }

    if (selectedBreakdownColumn) {
      const firstYColumn = selectedYColumns[0];
      return transformDataForBreakdownChart(data, selectedXColumn, firstYColumn, selectedBreakdownColumn);
    }

    return transformDataForSimpleChart(data, selectedXColumn, selectedYColumns);
  }, [data, selectedXColumn, selectedYColumns, selectedBreakdownColumn, hasValidConfiguration]);

  if (!hasValidConfiguration || !selectedXColumn) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">Select chart type, X-axis, and Y-axis columns to display graph</p>
          {!chartConfig.type && <p className="text-xs mt-1">• Choose a chart type</p>}
          {!selectedXColumn && <p className="text-xs mt-1">• Select one X-axis column</p>}
          {selectedYColumns.length === 0 && <p className="text-xs mt-1">• Select at least one Y-axis column</p>}
          {selectedBreakdownColumn && selectedYColumns.length > 1 && (
            <p className="text-xs mt-1">• Breakdown requires exactly one Y-axis column</p>
          )}
        </div>
      </div>
    );
  }

  const lineChartProps = selectedBreakdownColumn
    ? {
      data: chartData,
      keys: keys,
      xAxisKey: selectedXColumn.name,
      chartConfig: uiChartConfig,
    }
    : {
      data: chartData,
      xAxisKey: selectedXColumn.name,
      yColumns: selectedYColumns,
    };

  switch (chartConfig.type) {
    case GraphType.LineGraph:
      return <LineChart {...lineChartProps} />;
    case GraphType.BarGraph:
      return <BarChart data={chartData} xAxisKey={selectedXColumn.name} yColumns={selectedYColumns} />;
    case GraphType.HorizontalBarGraph:
      return (
        <HorizontalBarChart data={chartData} xColumns={[selectedXColumn]} yAxisKey={selectedYColumns[0]?.name || ""} />
      );
    default:
      return (
        <div className="flex items-center justify-center h-full w-full text-muted-foreground">
          <p className="text-sm">Unsupported chart type</p>
        </div>
      );
  }
};

export default GraphRenderer;
