export enum ChartType {
  "LineChart" = "line",
  "BarChart" = "bar",
  "HorizontalBarChart" = "horizontalBar",
  "Table" = "table",
  "MetricCard" = "metric",
}

export type DisplayMode = "total" | "average" | "none";

interface BaseChartConfig {
  x?: string;
  y?: string;
  breakdown?: string;
  /** @deprecated Use displayMode instead. Kept for backward compatibility. */
  total?: boolean;
  displayMode?: DisplayMode;
}

export interface AxisChartConfig extends BaseChartConfig {
  type?: ChartType.LineChart | ChartType.BarChart | ChartType.HorizontalBarChart;
}

export interface TableColumnConfig {
  columnOrder?: string[];
  columnSizing?: Record<string, number>;
  columnVisibility?: Record<string, boolean>;
}

export interface TableChartConfig extends BaseChartConfig {
  type: ChartType.Table;
  tableColumnConfig?: TableColumnConfig;
}

export interface MetricCardConfig extends BaseChartConfig {
  type: ChartType.MetricCard;
  /** The key in the result row to display. Defaults to first key if omitted. */
  valueKey?: string;
  /** Optional unit label shown below the number, e.g. "USD" or "tokens". */
  unit?: string;
}

export type ChartConfig = AxisChartConfig | TableChartConfig | MetricCardConfig;

export const isTableConfig = (config: ChartConfig): config is TableChartConfig => config.type === ChartType.Table;

export const isMetricConfig = (config: ChartConfig): config is MetricCardConfig => config.type === ChartType.MetricCard;

/** Resolve displayMode from config, with backward compatibility for `total: true`. */
export const resolveDisplayMode = (config: ChartConfig): DisplayMode => {
  if (config.displayMode) return config.displayMode;
  if (config.total) return "total";
  return "none";
};
