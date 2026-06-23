"use client";

import { type RefObject } from "react";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { useTracesStoreContext } from "@/components/traces/traces-store";

interface TracesChartProps {
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
}

const chartConfig = {
  successCount: {
    label: "success",
    color: "hsl(var(--success-bright))",
    stackId: "stack",
  },
  errorCount: {
    label: "error",
    color: "hsl(var(--destructive-bright))",
    stackId: "stack",
  },
} as const;

const fields = ["successCount", "errorCount"] as const;

export default function TracesChart({ className, containerRef }: TracesChartProps) {
  const { stats, isLoadingStats, chartContainerWidth } = useTracesStoreContext((state) => ({
    stats: state.stats,
    isLoadingStats: state.isLoadingStats,
    chartContainerWidth: state.chartContainerWidth,
  }));

  return (
    <div ref={containerRef} className={className}>
      {!stats && isLoadingStats ? (
        <ChartSkeleton />
      ) : (
        <TimeSeriesChart
          data={stats ?? []}
          chartConfig={chartConfig}
          fields={fields}
          containerWidth={chartContainerWidth}
        />
      )}
    </div>
  );
}
