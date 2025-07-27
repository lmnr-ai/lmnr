import React, { useMemo } from "react";

import BarChart from "@/components/graph-builder/charts/bar-chart";
import HorizontalBarChart from "@/components/graph-builder/charts/horizontal-bar-chart";
import LineChart from "@/components/graph-builder/charts/line-chart";
import { useGraphBuilderStoreContext } from "@/components/graph-builder/graph-builder-store";
import { GraphType } from "@/components/graph-builder/types";
import { ChartConfig } from "@/components/ui/chart";

const GraphRenderer = () => {
  const { type, getSelectedXColumn, getSelectedYColumns, getSelectedBreakdownColumn, isValidGraphConfiguration, data } =
    useGraphBuilderStoreContext((state) => ({
      type: state.type,
      getSelectedXColumn: state.getSelectedXColumn,
      getSelectedYColumns: state.getSelectedYColumns,
      getSelectedBreakdownColumn: state.getSelectedBreakdownColumn,
      isValidGraphConfiguration: state.isValidGraphConfiguration,
      data: state.data,
    }));

  const xColumn = getSelectedXColumn();
  const yColumns = getSelectedYColumns();
  const breakdownColumn = getSelectedBreakdownColumn();
  const isValidConfig = isValidGraphConfiguration();

  const { chartData, keys, chartConfig } = useMemo(() => {
    if (!isValidConfig || !xColumn || yColumns.length === 0) {
      return { chartData: [], keys: new Set<string>(), chartConfig: {} };
    }

    if (!breakdownColumn) {
      const simpleData = data.map((row) => {
        const transformedRow: Record<string, any> = {
          [xColumn.name]: row[xColumn.name],
        };
        yColumns.forEach((yCol) => {
          transformedRow[yCol.name] = row[yCol.name];
        });
        return transformedRow;
      });

      const simpleKeys = new Set(yColumns.map((col) => col.name));
      const simpleConfig = Object.fromEntries(
        yColumns.map((col, index) => [
          col.name,
          {
            color: `hsl(var(--chart-${(index % 5) + 1}))`,
            label: col.name,
          },
        ])
      ) satisfies ChartConfig;

      return { chartData: simpleData, keys: simpleKeys, chartConfig: simpleConfig };
    }

    const yColumn = yColumns[0];

    const groupedData = new Map<string | number, Record<string, number>>();
    const uniqueGroups = new Set<string>();

    data.forEach((row) => {
      const xValue = String(row[xColumn.name]);
      const groupValue = String(row[breakdownColumn.name]);
      const yValue = Number(row[yColumn.name]) || 0;

      uniqueGroups.add(groupValue);

      if (!groupedData.has(xValue)) {
        groupedData.set(xValue, {});
      }

      groupedData.get(xValue)![groupValue] = yValue;
    });

    const transformedData = Array.from(groupedData.entries()).map(([xValue, groups]) => ({
      ...Object.fromEntries(Array.from(uniqueGroups).map((group) => [group, 0])),
      ...groups,
      [xColumn.name]: xValue,
    }));

    const groupConfig = Object.fromEntries(
      Array.from(uniqueGroups).map((group, index) => [
        group,
        {
          color: `hsl(var(--chart-${(index % 5) + 1}))`,
          label: group,
        },
      ])
    ) satisfies ChartConfig;

    return {
      chartData: transformedData,
      keys: uniqueGroups,
      chartConfig: groupConfig,
    };
  }, [data, xColumn, yColumns, breakdownColumn, isValidConfig]);

  if (!isValidConfig || !xColumn) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">Select chart type, X-axis, and Y-axis columns to display graph</p>
          {!type && <p className="text-xs mt-1">• Choose a chart type</p>}
          {!xColumn && <p className="text-xs mt-1">• Select one X-axis column</p>}
          {yColumns.length === 0 && <p className="text-xs mt-1">• Select at least one Y-axis column</p>}
          {breakdownColumn && yColumns.length > 1 && (
            <p className="text-xs mt-1">• Breakdown requires exactly one Y-axis column</p>
          )}
        </div>
      </div>
    );
  }

  const lineChartProps = breakdownColumn
    ? {
      data: chartData,
      keys: keys,
      xAxisKey: xColumn.name,
      chartConfig: chartConfig,
    }
    : {
      data: chartData,
      xAxisKey: xColumn.name,
      yColumns: yColumns,
    };

  switch (type) {
    case GraphType.LineGraph:
      return <LineChart {...lineChartProps} />;
    case GraphType.BarGraph:
      return <BarChart data={chartData} xAxisKey={xColumn.name} yColumns={yColumns} />;
    case GraphType.HorizontalBarGraph:
      return <HorizontalBarChart data={chartData} xColumns={[xColumn]} yAxisKey={yColumns[0]?.name || ""} />;
    default:
      return (
        <div className="flex items-center justify-center h-full w-full text-muted-foreground">
          <p className="text-sm">Unsupported chart type</p>
        </div>
      );
  }
};

export default GraphRenderer;
