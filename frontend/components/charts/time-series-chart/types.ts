export type TimeSeriesDataPoint = {
  timestamp: string;
} & Record<string, number>;

export interface TimeSeriesChartConfig {
  [key: string]: {
    label: string;
    color: string;
    stackId?: string;
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
  customBarShape?: React.ComponentType<any>;
  formatValue?: (value: number) => string;
  showTotal?: boolean;
}

