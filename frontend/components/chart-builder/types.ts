export enum ChartType {
  LineChart = "line",
  BarChart = "bar",
  HorizontalBarChart = "horizontalBar",
  Table = "table",
  Value = "value",
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

interface AxisChartConfig extends BaseChartConfig {
  type?: ChartType.LineChart | ChartType.BarChart | ChartType.HorizontalBarChart;
}

export interface TableColumnConfig {
  columnOrder?: string[];
  columnSizing?: Record<string, number>;
  columnVisibility?: Record<string, boolean>;
}

interface TableChartConfig extends BaseChartConfig {
  type: ChartType.Table;
  tableColumnConfig?: TableColumnConfig;
}

/** One cell of the first row, number or text. `y` names its column; unset means the first visible column. */
interface ValueChartConfig extends BaseChartConfig {
  type: ChartType.Value;
}

export type ChartConfig = AxisChartConfig | TableChartConfig | ValueChartConfig;

/** Resolve displayMode from config, with backward compatibility for `total: true`. */
export const resolveDisplayMode = (config: ChartConfig): DisplayMode => {
  if (config.displayMode) return config.displayMode;
  if (config.total) return "total";
  return "none";
};
