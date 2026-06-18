import type React from "react";

export type TimeSeriesDataPoint = {
  timestamp: string;
} & Record<string, number>;

export interface TimeSeriesChartConfig {
  [key: string]: {
    label: string;
    color: string;
    stackId?: string;
    icon?: React.ComponentType;
  };
}

export interface TimeSeriesChartProps<T extends TimeSeriesDataPoint> {
  data: T[];
  chartConfig: TimeSeriesChartConfig;
  fields: readonly string[];
  containerWidth?: number | null;
  className?: string;
  isLoading?: boolean;
  onZoom?: (startDate: string, endDate: string) => void;
  formatValue?: (value: number) => string;
  showTotal?: boolean;
  showTooltip?: boolean;
  hideZeroValues?: boolean;
  // Optional secondary-axis line + gradient drawn behind the bars.
  overlayField?: string;
  overlayLabel?: string;
  overlayColor?: string;
}
