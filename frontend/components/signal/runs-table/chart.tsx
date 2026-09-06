"use client";

import { type RefObject, useMemo } from "react";
import useSWR from "swr";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { type TimeSeriesChartConfig, type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import { type SignalRunStatsDataPoint } from "@/lib/actions/signal-runs/types";
import { swrFetcher } from "@/lib/utils";

const chartConfig: TimeSeriesChartConfig = {
  eventCreated: {
    label: "Event",
    color: "var(--color-primary)",
    stackId: "stack",
  },
  noEvent: {
    label: "No event",
    color: "color-mix(in srgb, var(--color-muted-foreground) 60%, transparent)",
    stackId: "stack",
  },
  inProgress: {
    label: "Running",
    color: "hsl(var(--chart-4))",
    stackId: "stack",
  },
  failed: {
    label: "Failed",
    color: "hsl(var(--destructive-bright))",
    stackId: "stack",
  },
};

const fields = ["eventCreated", "noEvent", "inProgress", "failed"] as const;

interface RunsChartProps {
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
  containerWidth: number | null;
  statsUrl: string | null;
}

export default function RunsChart({ className, containerRef, containerWidth, statsUrl }: RunsChartProps) {
  const { data, isLoading } = useSWR<{ items: SignalRunStatsDataPoint[] }>(statsUrl, swrFetcher);

  // Drop `count` (analyzed-only overlay denominator) so the chart total is the stacked series, not series + subset.
  const chartData = useMemo(
    () =>
      (data?.items ?? []).map(({ timestamp, eventCreated, noEvent, inProgress, failed }) => {
        const point = { timestamp } as TimeSeriesDataPoint;
        point.eventCreated = eventCreated;
        point.noEvent = noEvent;
        point.inProgress = inProgress;
        point.failed = failed;
        return point;
      }),
    [data?.items]
  );

  return (
    <div ref={containerRef} className={className}>
      {!data && (isLoading || !statsUrl) ? (
        <ChartSkeleton />
      ) : (
        <TimeSeriesChart
          data={chartData}
          chartConfig={chartConfig}
          fields={fields}
          containerWidth={containerWidth}
          hideZeroValues
        />
      )}
    </div>
  );
}
