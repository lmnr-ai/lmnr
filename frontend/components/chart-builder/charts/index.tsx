import React, { useMemo } from "react";

import { useChartBuilderStoreContext } from "@/components/chart-builder/chart-builder-store";
import BarChart from "@/components/chart-builder/charts/bar-chart";
import HorizontalBarChart from "@/components/chart-builder/charts/horizontal-bar-chart";
import LineChart from "@/components/chart-builder/charts/line-chart";
import { transformDataForBreakdown, transformDataForSimpleChart } from "@/components/chart-builder/charts/utils";
import { ChartConfig, ChartType } from "@/components/chart-builder/types";
import { ColumnInfo } from "@/components/chart-builder/utils";

interface ChartRendererCoreProps {
  config: ChartConfig;
  data: Record<string, any>[];
  columns: ColumnInfo[];
}

export const ChartRendererCore = ({ config, data, columns }: ChartRendererCoreProps) => {
  const {
    chartData,
    keys,
    chartConfig: uiChartConfig,
  } = useMemo(() => {
    if (!config.type || !config.x || !config.y?.length) {
      return { chartData: [], keys: new Set<string>(), chartConfig: {} };
    }

    const xColumn = columns.find((col) => col.name === config.x);
    const yColumns = config.y.map((yName) => columns.find((col) => col.name === yName)).filter(Boolean) as ColumnInfo[];
    const breakdownColumn = config.breakdown ? columns.find((col) => col.name === config.breakdown) : undefined;

    if (!xColumn || !yColumns.length) {
      return { chartData: [], keys: new Set<string>(), chartConfig: {} };
    }

    if (breakdownColumn && yColumns.length === 1) {
      return transformDataForBreakdown(data, config.x, config.y[0], config.breakdown!);
    }

    return transformDataForSimpleChart(data, config.x, config.y);
  }, [config, data, columns]);

  if (!config.type || !config.x || !config.y?.length) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground">
        <div className="text-center">
          <p className="text">Invalid chart configuration</p>
          {!config.type && <p className="text-sm mt-1">• Chart type is required</p>}
          {!config.x && <p className="text-sm mt-1">• X-axis column is required</p>}
          {!config.y?.length && <p className="text-sm mt-1">• At least one Y-axis column is required</p>}
        </div>
      </div>
    );
  }

  const baseProps = {
    data: chartData,
    x: config.x,
    y: config.y,
    breakdown: config.breakdown,
    total: config.total,
  };

  const props = config.breakdown
    ? {
      ...baseProps,
      keys: keys,
      chartConfig: uiChartConfig,
    }
    : baseProps;

  switch (config.type) {
    case ChartType.LineChart:
      return <LineChart {...props} />;
    case ChartType.BarChart:
      return <BarChart {...props} />;
    case ChartType.HorizontalBarChart:
      return <HorizontalBarChart {...props} />;
    default:
      return (
        <div className="flex items-center justify-center h-full w-full text-muted-foreground">
          <p className="text-sm">Unsupported chart type: {config.type}</p>
        </div>
      );
  }
};

const ChartRenderer = () => {
  const { chartConfig, columns, data } = useChartBuilderStoreContext((state) => ({
    chartConfig: state.chartConfig,
    columns: state.columns,
    data: state.data,
  }));

  return <ChartRendererCore config={chartConfig} data={data} columns={columns} />;
};

export default ChartRenderer;
