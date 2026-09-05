"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { shallow } from "zustand/shallow";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import EmergingClusterBreadcrumbs from "@/components/signal/emerging-cluster-breadcrumbs";
import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import { getChartClusters, useSignalStoreContext } from "@/components/signal/store.tsx";
import { type ClusterStatsDataPoint, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { getClusterColorById, UNCLUSTERED_COLOR } from "@/lib/clusters/colors";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

import ClusterBreadcrumbs from "./cluster-breadcrumbs";
import ClusterIcicle from "./cluster-icicle";
import ClusterIcicleSkeleton from "./cluster-icicle-skeleton";
import ClusterReadout from "./cluster-readout";
import ClusterStackedChart from "./cluster-stacked-chart";
import { useClusterFocusContext } from "./focus-store";
import { buildClusterModel } from "./model";

interface Props {
  className?: string;
}

type ClusterStatsResponse = {
  items: ClusterStatsDataPoint[];
  unclusteredCounts: { timestamp: string; count: number }[];
};

const EMPTY_STATS: ClusterStatsDataPoint[] = [];

export default function ClustersSectionContent({ className }: Props) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [clusterId, setClusterId] = useClusterId();
  const [emergingClusterId, setEmergingClusterId] = useEmergingClusterId();

  // The setter only: subscribing to `hoveredId` here would re-render the section
  // — chart included — on every pointer move over the strip.
  const setHoveredId = useClusterFocusContext((state) => state.setHoveredId);

  const isClustersLoading = useSignalStoreContext((state) => state.isClustersLoading);
  const rawClusters = useSignalStoreContext((state) => state.rawClusters);
  const signal = useSignalStoreContext((state) => state.signal);
  const fetchClusters = useSignalStoreContext((state) => state.fetchClusters);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const chartClusters = useSignalStoreContext((state) => getChartClusters(state, clusterId), shallow);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [localChartWidth, setLocalChartWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setLocalChartWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(chartContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Null until the ResizeObserver has measured the container, which pauses SWR —
  // the state that "not fetched yet" must be distinguishable from "fetched empty".
  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${signal.projectId}/signals/${signal.id}/events/clusters/stats`,
    chartContainerWidth: localChartWidth,
    pastHours,
    startDate,
    endDate,
  });

  const { data: statsResponse, error: statsError } = useSWR<ClusterStatsResponse>(statsUrl, swrFetcher, {
    keepPreviousData: true,
    onError: () => toast({ title: "Error", description: "Failed to load cluster stats.", variant: "destructive" }),
  });

  // Undefined data with no error covers both "paused on a null key" and "in flight".
  const isStatsPending = !statsResponse && !statsError;

  // Memoized on the response object so the merged array keeps one identity —
  // buildClusterModel and the chart both memoize on it.
  const clusterStatsData = useMemo(() => {
    if (!statsResponse) return EMPTY_STATS;
    const unclustered: ClusterStatsDataPoint[] = statsResponse.unclusteredCounts.map((item) => ({
      cluster_id: UNCLUSTERED_ID,
      timestamp: item.timestamp,
      count: item.count,
    }));
    return [...statsResponse.items, ...unclustered];
  }, [statsResponse]);

  // The strip draws every cluster at every level, not the drill-down's slice: it
  // is the navigation, so re-rooting it on selection would take away what the
  // selection is read against.
  const model = useMemo(() => buildClusterModel(rawClusters, clusterStatsData), [rawClusters, clusterStatsData]);

  // Color is a pure function of cluster id (shared with trace-view), so the
  // map is just for the unclustered virtual bucket plus convenience lookups.
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    chartClusters.forEach((c) => map.set(c.id, getClusterColorById(c.id)));
    map.set(UNCLUSTERED_ID, UNCLUSTERED_COLOR);
    return map;
  }, [chartClusters]);

  useEffect(() => {
    if (!pastHours && !(startDate && endDate)) return;
    fetchClusters({ pastHours, startDate, endDate });
  }, [fetchClusters, pastHours, startDate, endDate]);

  // Only while a fetch is actually in flight: settled with no clusters must fall
  // through to the empty chart, since a strip of grey pills over it reads as
  // still loading. A refresh keeps the old strip, because the model survives it.
  const showSkeleton = !model && (isClustersLoading || isStatsPending);

  // The chart's own empty state may only speak for a window whose stats resolved.
  const hasChartData = chartClusters.length > 0 && clusterStatsData.length > 0;
  const showChartLoading = !hasChartData && (isClustersLoading || isStatsPending);

  // Signal-runs overlay: count of traces this signal actually evaluated (post-trigger),
  // fetched at the SAME interval as the cluster stats (same hook → same container width →
  // aligned timestamps) and drawn behind the bars. This is the true denominator for the
  // event counts — no trigger-filter re-implementation, since the backend records each run.
  const runStatsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${signal.projectId}/signals/${signal.id}/runs/stats`,
    chartContainerWidth: localChartWidth,
    pastHours,
    startDate,
    endDate,
  });

  // Same URL as the Runs chart, so the SWR cache is shared and must stay in its `{ items }` shape.
  const { data: runStats } = useSWR<{ items: { timestamp: string; count: number }[] }>(runStatsUrl, swrFetcher);
  const runTotals = useMemo(
    () => (runStats?.items ?? []).map((i) => ({ timestamp: i.timestamp, count: Number(i.count) })),
    [runStats?.items]
  );

  // The one way anything in the section changes the selection.
  const selectCluster = useCallback(
    (id: string) => {
      track("signals", "cluster_clicked", {
        clusterId: id === UNCLUSTERED_ID ? "-" : id,
      });
      // Picking anything in the cluster tree exits the emerging-cluster view —
      // otherwise the events fetcher would keep filtering to the L0 cluster
      // (it prioritizes emergingClusterId over clusterId/unclustered).
      setEmergingClusterId(null);
      setClusterId(clusterId === id ? null : id);
    },
    [setClusterId, setEmergingClusterId, clusterId]
  );

  return (
    <div className={cn("relative flex w-full min-w-0 flex-col", className)}>
      {/* The strip and the trail read as one block above the chart, which is
          why the gap between them is looser than the one under it. */}
      <div className="mb-2 flex w-full shrink-0 flex-col gap-4">
        {model ? (
          <ClusterIcicle
            tree={model.tree}
            ancestors={model.ancestors}
            selectedId={clusterId}
            onHover={setHoveredId}
            onSelect={selectCluster}
          />
        ) : (
          showSkeleton && <ClusterIcicleSkeleton />
        )}
        {emergingClusterId ? <EmergingClusterBreadcrumbs /> : <ClusterBreadcrumbs />}
      </div>

      {/* Unwrapped: no border, no surface fill, no padding, so the chart reads
          as part of the page rather than a card sitting on it. */}
      {/* Stretches instead of taking a fixed height: it is the only flexible
          child of the 70vh top part, so it soaks up whatever the strip, the
          trail and the table's controls leave over. */}
      <div className="min-h-0 w-full flex-1 overflow-hidden">
        <div className="h-full" ref={chartContainerRef}>
          {showChartLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading chart...
            </div>
          ) : (
            <ClusterStackedChart
              clusters={chartClusters}
              statsData={clusterStatsData}
              containerWidth={localChartWidth}
              colorMap={colorMap}
              runTotals={runTotals}
              // With the list gone the chart has no other label for what is pinned.
              overlay={
                model && (
                  <ClusterReadout
                    tree={model.tree}
                    hasChildren={model.hasChildren}
                    clusterId={clusterId}
                    onSelect={selectCluster}
                    onHover={setHoveredId}
                  />
                )
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
