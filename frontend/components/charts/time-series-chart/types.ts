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
  overlayColor?: string;
  /** Pin the y domain upper bound so the axis doesn't rescale as data streams in. */
  yAxisMax?: number;
  /** Recharts' own enter/update bar tween. Turn off when driving the data yourself. */
  animateBars?: boolean;
}
