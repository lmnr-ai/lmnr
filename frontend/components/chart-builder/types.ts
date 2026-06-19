export enum ChartType {
  "LineChart" = "line",
  "BarChart" = "bar",
  "HorizontalBarChart" = "horizontalBar",
  "Table" = "table",
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

export type ChartConfig = AxisChartConfig | TableChartConfig;

export const isTableConfig = (config: ChartConfig): config is TableChartConfig => config.type === ChartType.Table;

/** Resolve displayMode from config, with backward compatibility for `total: true`. */
export const resolveDisplayMode = (config: ChartConfig): DisplayMode => {
  if (config.displayMode) return config.displayMode;
  if (config.total) return "total";
  return "none";
};
