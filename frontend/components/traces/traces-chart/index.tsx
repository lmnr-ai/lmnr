"use client";

import { RefObject } from "react";

import { useTracesStoreContext } from "@/components/traces/traces-store";
import { Skeleton } from "@/components/ui/skeleton";

import Chart from "./chart";

interface TracesChartProps {
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
}

const SKELETON_BAR_WIDTH = 40;

const ChartSkeleton = () => {
  const getHeight = (index: number) => 20 + ((index * 17 + index * index) % 32);

  return (
    <div>
      <div className="flex flex-col gap-1 pt-4 pb-3">
        <div className="h-36 w-full flex items-end justify-between gap-2">
          {Array.from({ length: 48 }).map((_, i) => (
            <Skeleton
              key={i}
              className="rounded-t"
              style={{
                width: `${SKELETON_BAR_WIDTH}px`,
                height: `${getHeight(i)}%`,
              }}
            />
          ))}
        </div>
        <div className="flex items-end justify-between gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="rounded-t w-8 h-4" />
          ))}
        </div>
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  );
};

export default function TracesChart({ className, containerRef }: TracesChartProps) {
  const { stats, isLoadingStats, chartContainerWidth } = useTracesStoreContext((state) => ({
    stats: state.stats,
    isLoadingStats: state.isLoadingStats,
    chartContainerWidth: state.chartContainerWidth,
  }));

  return (
    <div ref={containerRef} className={className}>
      {!stats && isLoadingStats ? <ChartSkeleton /> : <Chart data={stats ?? []} containerWidth={chartContainerWidth} />}
    </div>
  );
}
