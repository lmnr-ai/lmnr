"use client";

import { useEffect, useRef, useState } from "react";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { DEFAULT_TARGET_BARS } from "@/components/traces/traces-table/constants";
import { type TracesStatsDataPoint } from "@/lib/actions/traces/stats-types";

const chartConfig = {
  successCount: { label: "success", color: "var(--success)", stackId: "stack" },
  errorCount: { label: "error", color: "var(--destructive)", stackId: "stack" },
} as const;

const fields = ["successCount", "errorCount"] as const;

interface SessionsChartProps {
  projectId: string;
  pastHours: string | null;
  startDate: string | null;
  endDate: string | null;
  filter: string[];
  search: string | null;
  customColumns?: string;
  /** Hold off until the saved view resolves, so the first fetch uses its filters. */
  isViewLoading: boolean;
}

/** Sessions started per time bucket (by first trace), split by whether any trace errored. */
export default function SessionsChart({
  projectId,
  pastHours,
  startDate,
  endDate,
  filter,
  search,
  customColumns,
  isViewLoading,
}: SessionsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  // Tagged with the URL it answers, so "loading" is derived instead of tracked.
  const [result, setResult] = useState<{ url: string; items?: TracesStatsDataPoint[] }>();

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${projectId}/sessions/stats`,
    chartContainerWidth: width,
    pastHours,
    startDate,
    endDate,
    filters: filter,
    additionalParams: {
      ...(search && { search }),
      ...(customColumns && { customColumns }),
    },
    defaultTargetBars: DEFAULT_TARGET_BARS,
  });

  useEffect(() => {
    if (isViewLoading || !statsUrl) return;
    const controller = new AbortController();
    (async () => {
      let items: TracesStatsDataPoint[] | undefined;
      try {
        const res = await fetch(statsUrl, { signal: controller.signal });
        if (res.ok) items = ((await res.json()) as { items: TracesStatsDataPoint[] }).items;
      } catch {
        // Aborted or offline. The chart is secondary (the traces chart doesn't toast either), so keep the last data.
      }
      if (!controller.signal.aborted) setResult((prev) => ({ url: statsUrl, items: items ?? prev?.items }));
    })();
    return () => controller.abort();
  }, [statsUrl, isViewLoading]);

  const stats = result?.items;
  const isLoading = !!statsUrl && result?.url !== statsUrl;

  return (
    <div ref={containerRef} className="w-full rounded border bg-secondary p-2">
      {!stats && isLoading ? (
        <ChartSkeleton />
      ) : (
        <TimeSeriesChart data={stats ?? []} chartConfig={chartConfig} fields={fields} containerWidth={width} />
      )}
    </div>
  );
}
