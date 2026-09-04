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
  /** Milliseconds the pointer must dwell on the plot before the tooltip appears.
   *  0 (the default) is recharts' own behaviour — it opens on the first move. */
  tooltipDelay?: number;
  /** Only open the tooltip when the pointer is actually over the stack, not
   *  anywhere in its column. Off by default — recharts' own behaviour. */
  tooltipRequireBar?: boolean;
  /** Bar entry animation. Turn it off where the stack is wide enough that the
   *  transition costs more main thread than it is worth. */
  animate?: boolean;
  hideZeroValues?: boolean;
  // Optional secondary-axis line + gradient drawn behind the bars.
  overlayField?: string;
  overlayColor?: string;
}
