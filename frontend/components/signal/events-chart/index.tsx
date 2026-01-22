"use client";

import { type RefObject } from "react";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { useSignalStoreContext } from "@/components/signal/store.tsx";

interface EventsChartProps {
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
}

const fields = ["count"] as const;

export default function EventsChart({ className, containerRef }: EventsChartProps) {
  const { stats, isLoadingStats, chartContainerWidth, eventDefinition } = useSignalStoreContext((state) => ({
    stats: state.stats,
    isLoadingStats: state.isLoadingStats,
    chartContainerWidth: state.chartContainerWidth,
    eventDefinition: state.signal,
  }));

  const chartConfig = {
    count: {
      label: eventDefinition.name,
      color: "hsl(var(--primary))",
    },
  } as const;

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
