"use client";

import { RefObject } from "react";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { useEventsStoreContext } from "@/components/events/events-store";

interface EventsChartProps {
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
}

const chartConfig = {
  count: {
    label: "events",
    color: "hsl(var(--primary))",
  },
} as const;

const fields = ["count"] as const;

export default function EventsChart({ className, containerRef }: EventsChartProps) {
  const { stats, isLoadingStats, chartContainerWidth } = useEventsStoreContext((state) => ({
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
