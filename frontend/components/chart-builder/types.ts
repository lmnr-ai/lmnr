export enum ChartType {
  "LineChart" = "line",
  "BarChart" = "bar",
  "HorizontalBarChart" = "horizontalBar",
  "Metric" = "metric",
}

export interface ChartConfig {
  type?: ChartType;
  x?: string;
  y?: string;
  breakdown?: string;
  total?: boolean;
}
