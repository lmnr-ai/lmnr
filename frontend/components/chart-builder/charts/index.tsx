import React, { useMemo } from "react";

import { useChartBuilderStoreContext } from "@/components/chart-builder/chart-builder-store";
import BarChart from "@/components/chart-builder/charts/bar-chart";
import HorizontalBarChart from "@/components/chart-builder/charts/horizontal-bar-chart";
import LineChart, { type ChartDragHandlers } from "@/components/chart-builder/charts/line-chart";
import TableChart from "@/components/chart-builder/charts/table-chart";
import {
  generateChartConfig,
  transformDataForBreakdown,
  transformDataForSimpleChart,
} from "@/components/chart-builder/charts/utils";
import {
  type ChartConfig,
  ChartType,
  resolveDisplayMode,
  type TableColumnConfig,
} from "@/components/chart-builder/types";
import { type ColumnInfo } from "@/components/chart-builder/utils";

interface ChartRendererCoreProps {
  config: ChartConfig;
  data: Record<string, any>[];
  columns: ColumnInfo[];
  onBarClick?: (rowData: Record<string, any>) => void;
  syncId?: string;
  drag?: ChartDragHandlers;
  onColumnConfigChange?: (config: TableColumnConfig) => void;
  hasMore?: boolean;
  isFetching?: boolean;
  fetchNextPage?: () => void;
}

export const ChartRendererCore = ({
  config,
  data,
  columns,
  onBarClick,
  syncId,
  drag,
  onColumnConfigChange,
  hasMore,
  isFetching,
  fetchNextPage,
}: ChartRendererCoreProps) => {
  const isTable = config.type === ChartType.Table;

  const {
    chartData,
    keys,
    chartConfig: uiChartConfig,
  } = useMemo(() => {
    if (!config.type || isTable || !config.x || !config.y) {
      return { chartData: [], keys: new Set<string>(), chartConfig: {} };
    }

    const xColumn = columns.find((col) => col.name === config.x);
    const yColumn = columns.find((col) => col.name === config.y);
    const breakdownColumn = config.breakdown ? columns.find((col) => col.name === config.breakdown) : undefined;

    if (!xColumn || !yColumn) {
      return { chartData: [], keys: new Set<string>(), chartConfig: {} };
    }

    if (breakdownColumn) {
      return transformDataForBreakdown(data, config.x, config.y, config.breakdown!);
    }

    return transformDataForSimpleChart(data, config.x, [config.y]);
  }, [config, data, columns, isTable]);

  if (isTable) {
    const hiddenColumns = config.type === ChartType.Table ? config.hiddenColumns : undefined;
    const tableColumnConfig = config.type === ChartType.Table ? config.tableColumnConfig : undefined;
    return (
      <TableChart
        data={data}
        columns={columns}
        hiddenColumns={hiddenColumns}
        onRowClick={onBarClick}
        tableColumnConfig={tableColumnConfig}
        onColumnConfigChange={onColumnConfigChange}
        hasMore={hasMore}
        isFetching={isFetching}
        fetchNextPage={fetchNextPage}
      />
    );
  }

  if (!config.type || !config.x || !config.y) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground">
        <div className="text-center">
          <p className="text">Invalid chart configuration</p>
          {!config.type && <p className="text-sm mt-1">• Chart type is required</p>}
          {!config.x && <p className="text-sm mt-1">• X-axis column is required</p>}
          {!config.y && <p className="text-sm mt-1">• Y-axis column is required</p>}
        </div>
      </div>
    );
  }

  const displayMode = resolveDisplayMode(config);

  const props = {
    data: chartData,
    x: config.x,
    y: config.y,
    breakdown: config.breakdown,
    displayMode,
    metricColumn: config.type === ChartType.HorizontalBarChart ? config.x : config.y,
    keys: Array.from(keys),
    chartConfig: uiChartConfig || generateChartConfig(Array.from(keys)),
    syncId,
    drag,
  };

  if (keys.size === 0) {
    return (
      <div className="flex flex-1 h-full justify-center items-center bg-muted/30 rounded-lg">
        <span className="text-muted-foreground">No data during this period</span>
      </div>
    );
  }

  switch (config.type) {
    case ChartType.LineChart:
      return <LineChart {...props} />;
    case ChartType.BarChart:
      return <BarChart {...props} />;
    case ChartType.HorizontalBarChart: {
      const { syncId: _, drag: __, ...horizontalBarProps } = props;
      return <HorizontalBarChart {...horizontalBarProps} onBarClick={onBarClick} />;
    }
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
