export enum ChartType {
  "LineChart" = "line",
  "BarChart" = "bar",
  "HorizontalBarChart" = "horizontalBar",
  "Metric" = "metric",
  "Table" = "table",
}

export type DisplayMode = "total" | "latest" | "none";

export interface ChartConfig {
  type?: ChartType;
  x?: string;
  y?: string;
  breakdown?: string;
  /** @deprecated Use displayMode instead. Kept for backward compatibility. */
  total?: boolean;
  displayMode?: DisplayMode;
}

/** Resolve displayMode from config, with backward compatibility for `total: true`. */
export const resolveDisplayMode = (config: ChartConfig): DisplayMode => {
  if (config.displayMode) return config.displayMode;
  if (config.total) return "total";
  return "none";
};
