import React, { useMemo } from "react";

import { useChartBuilderStoreContext } from "@/components/chart-builder/chart-builder-store";
import BarChart from "@/components/chart-builder/charts/bar-chart";
import HorizontalBarChart from "@/components/chart-builder/charts/horizontal-bar-chart";
import LineChart from "@/components/chart-builder/charts/line-chart";
import { transformDataForBreakdown, transformDataForSimpleChart } from "@/components/chart-builder/charts/utils";
import { ChartType } from "@/components/chart-builder/types";

const ChartRenderer = () => {
  const {
    chartConfig,
    getSelectedXColumn,
    getSelectedYColumns,
    getSelectedBreakdownColumn,
    isValidChartConfiguration,
    data,
  } = useChartBuilderStoreContext((state) => ({
    chartConfig: state.chartConfig,
    getSelectedXColumn: state.getSelectedXColumn,
    getSelectedYColumns: state.getSelectedYColumns,
    getSelectedBreakdownColumn: state.getSelectedBreakdownColumn,
    isValidChartConfiguration: state.isValidChartConfiguration,
    data: state.data,
  }));

  const selectedXColumn = getSelectedXColumn();
  const selectedYColumns = getSelectedYColumns();
  const selectedBreakdownColumn = getSelectedBreakdownColumn();
  const hasValidConfiguration = isValidChartConfiguration();

  const {
    chartData,
    keys,
    chartConfig: uiChartConfig,
  } = useMemo(() => {
    if (!hasValidConfiguration || !selectedXColumn || selectedYColumns.length === 0) {
      return { chartData: [], keys: new Set<string>(), chartConfig: {} };
    }

    if (selectedBreakdownColumn) {
      return transformDataForBreakdown(data, selectedXColumn, selectedYColumns[0], selectedBreakdownColumn);
    }

    return transformDataForSimpleChart(data, selectedXColumn, selectedYColumns);
  }, [data, selectedXColumn, selectedYColumns, selectedBreakdownColumn, hasValidConfiguration]);

  if (!hasValidConfiguration || !selectedXColumn) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground">
        <div className="text-center">
          <p className="text">Select chart type, X-axis, and Y-axis columns to display chart</p>
          {!chartConfig.type && <p className="text-sm mt-1">• Choose a chart type</p>}
          {!selectedXColumn && <p className="text-sm mt-1">• Select one X-axis column</p>}
          {selectedYColumns.length === 0 && <p className="text-sm mt-1">• Select at least one Y-axis column</p>}
          {selectedBreakdownColumn && selectedYColumns.length > 1 && (
            <p className="text-sm mt-1">• Breakdown requires exactly one Y-axis column</p>
          )}
        </div>
      </div>
    );
  }

  const chartProps = selectedBreakdownColumn
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
    case ChartType.LineChart:
      return <LineChart {...chartProps} />;
    case ChartType.BarChart:
      return <BarChart data={chartData} xAxisKey={selectedXColumn.name} yColumns={selectedYColumns} />;
    case ChartType.HorizontalBarChart:
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

export default ChartRenderer;
