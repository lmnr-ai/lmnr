import React, { useMemo } from "react";

import { useChartBuilderStoreContext } from "@/components/chart-builder/chart-builder-store";
import CartesianChart from "@/components/chart-builder/charts/cartesian-chart";
import ChartEmptyState from "@/components/chart-builder/charts/chart-empty-state";
import ChartTotal from "@/components/chart-builder/charts/chart-total";
import HorizontalBarChart from "@/components/chart-builder/charts/horizontal-bar-chart";
import TableChart from "@/components/chart-builder/charts/table-chart";
import {
  calculateDisplayValue,
  generateChartConfig,
  SINGLE_BAR_PALETTE,
  SINGLE_LINE_PALETTE,
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
  hiddenColumns?: string[];
  onBarClick?: (rowData: Record<string, any>) => void;
  /** Set on dashboards, where dragging across a line or bar chart selects a time range. */
  selectionChartId?: string;
  onColumnConfigChange?: (config: TableColumnConfig) => void;
  hasMore?: boolean;
  isFetching?: boolean;
  fetchNextPage?: () => void;
}

export const ChartRendererCore = ({
  config,
  data,
  columns,
  hiddenColumns,
  onBarClick,
  selectionChartId,
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

    const palette =
      config.type === ChartType.LineChart
        ? SINGLE_LINE_PALETTE
        : config.type === ChartType.BarChart
          ? SINGLE_BAR_PALETTE
          : undefined;
    return transformDataForSimpleChart(data, config.x, [config.y], palette);
  }, [config, data, columns, isTable]);
  // Stable so the chart only rebuilds its definition when the data changes, not on every hover-store update.
  const seriesKeys = useMemo(() => Array.from(keys), [keys]);

  if (isTable) {
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
    if (columns.length === 0) {
      return <ChartEmptyState title="Nothing to plot" hint="This result set has no columns to chart." />;
    }

    const missing = [!config.type && "a chart type", !config.x && "an X axis", !config.y && "a Y axis"].filter(
      Boolean
    ) as string[];

    return (
      <ChartEmptyState
        title="Nothing to plot yet"
        hint={`Select ${missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}` : missing[0]}.`}
      />
    );
  }

  const displayMode = resolveDisplayMode(config);

  const metricColumn = config.type === ChartType.HorizontalBarChart ? config.x : config.y;

  // With a breakdown, only zero-valued WITH FILL rows produce no series (empty values chart as "(none)").
  if (keys.size === 0) {
    return data.length === 0 || config.breakdown ? (
      <ChartEmptyState title="No data during this period" />
    ) : (
      <ChartEmptyState title="Nothing to plot" />
    );
  }

  // Horizontal bars plot their value on x, so that's the column to total.
  const totalKeys = config.type === ChartType.HorizontalBarChart ? [config.x] : seriesKeys;
  const chart =
    config.type === ChartType.LineChart || config.type === ChartType.BarChart ? (
      <CartesianChart
        kind={config.type === ChartType.LineChart ? "line" : "bar"}
        data={chartData}
        x={config.x}
        keys={seriesKeys}
        chartConfig={uiChartConfig || generateChartConfig(seriesKeys)}
        selectionChartId={selectionChartId}
      />
    ) : config.type === ChartType.HorizontalBarChart ? (
      <HorizontalBarChart data={chartData} x={config.x} y={config.y} onBarClick={onBarClick} />
    ) : (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground">
        <p className="text-sm">Unsupported chart type: {config.type}</p>
      </div>
    );

  // Siblings, not wrapped: the parent flex column lays out the total and the chart.
  return (
    <>
      {displayMode !== "none" && (
        <ChartTotal
          value={calculateDisplayValue(chartData, totalKeys, displayMode).displayValue ?? 0}
          metricColumn={metricColumn}
        />
      )}
      {chart}
    </>
  );
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
