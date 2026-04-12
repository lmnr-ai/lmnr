import React, { useMemo } from "react";

interface MetricChartProps {
  data: Record<string, any>[];
  y: string;
}

const MetricChart = ({ data, y }: MetricChartProps) => {
  const value = useMemo(() => data.reduce((sum, row) => sum + (Number(row[y]) || 0), 0), [data, y]);

  return (
    <div className="flex flex-1 items-center justify-center h-full">
      <span className="font-medium text-4xl">{value.toLocaleString()}</span>
    </div>
  );
};

export default MetricChart;
