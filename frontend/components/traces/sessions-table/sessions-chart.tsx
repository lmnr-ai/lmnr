"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { DEFAULT_TARGET_BARS } from "@/components/traces/traces-table/constants";
import { type SessionsStatsDataPoint } from "@/lib/actions/sessions/stats";
import { swrFetcher } from "@/lib/api/fetch-api";
import { withOpacity } from "@/lib/clusters/colors";
import { toast } from "@/lib/hooks/use-toast";

// One series (sessions have no status): primary, muted to the signals chart's bar opacity.
const chartConfig = {
  count: { label: "sessions", color: withOpacity("var(--color-primary)", 0.6) },
} as const;

const fields = ["count"] as const;

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

/** Sessions started per time bucket, by each session's first trace. */
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

  // keepPreviousData holds the last chart through a filter change instead of flashing the skeleton.
  const { data, isLoading } = useSWR<{ items: SessionsStatsDataPoint[] }>(isViewLoading ? null : statsUrl, swrFetcher, {
    keepPreviousData: true,
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });
  const stats = data?.items;

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
