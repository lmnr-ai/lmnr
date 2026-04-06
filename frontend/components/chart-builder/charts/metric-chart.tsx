import React, { useMemo } from "react";

import { formatMetricValue } from "./format-value";

interface MetricChartProps {
  data: Record<string, any>[];
  x: string;
  y: string;
  metricColumn?: string;
}

const MetricChart = ({ data, x, metricColumn }: MetricChartProps) => {
  const value = useMemo(() => {
    if (data.length === 0) return null;

    // For metric charts, use the first numeric column value from the first row
    const row = data[0];
    // x is the metric value column in the config
    const rawValue = row[x];
    const numValue = Number(rawValue);
    return isNaN(numValue) ? null : numValue;
  }, [data, x]);

  if (value === null) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground">
        <span className="text-sm">No data</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full w-full">
      <span className="font-semibold text-4xl">{formatMetricValue(value, metricColumn)}</span>
    </div>
  );
};

export default MetricChart;
