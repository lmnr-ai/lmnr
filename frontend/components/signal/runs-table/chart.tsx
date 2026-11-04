"use client";

import { type RefObject, useMemo } from "react";
import useSWR from "swr";

import CartesianPlot, { type PlotSeries } from "@/components/charts/cartesian-plot";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import { useChartUrlZoom } from "@/components/charts/use-chart-url-zoom";
import { useSignalVersionMarkers } from "@/components/signal/hooks/use-signal-version-markers";
import { type SignalRunStatsDataPoint } from "@/lib/actions/signal-runs/types";
import { swrFetcher } from "@/lib/utils";

const series: PlotSeries[] = [
  { key: "eventCreated", label: "Event", color: "var(--color-primary)" },
  { key: "noEvent", label: "No event", color: "color-mix(in srgb, var(--color-muted-foreground) 60%, transparent)" },
  { key: "inProgress", label: "Running", color: "hsl(var(--chart-4))" },
  { key: "failed", label: "Failed", color: "var(--destructive)" },
];
const countNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

interface RunsChartProps {
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
  statsUrl: string | null;
}

export default function RunsChart({ className, containerRef, statsUrl }: RunsChartProps) {
  const { data, isLoading } = useSWR<{ items: SignalRunStatsDataPoint[] }>(statsUrl, swrFetcher);
  const markers = useSignalVersionMarkers();
  const onRangeSelect = useChartUrlZoom();

  // `count` is an analyzed-only denominator, not another part of the stack or total.
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
  const total = useMemo(
    () => chartData.reduce((sum, row) => sum + series.reduce((value, item) => value + row[item.key], 0), 0),
    [chartData]
  );

  return (
    <div ref={containerRef} className={className}>
      {!data && (isLoading || !statsUrl) ? (
        <ChartSkeleton />
      ) : (
        <div className="flex flex-col items-start h-full">
          <CartesianPlot
            kind="bar"
            data={chartData}
            x="timestamp"
            series={series}
            markers={markers}
            className="h-48"
            onRangeSelect={onRangeSelect}
          />
          <div className="text-xs text-muted-foreground text-center" title={String(total)}>
            Total: {countNumberFormatter.format(total)}
          </div>
        </div>
      )}
    </div>
  );
}
