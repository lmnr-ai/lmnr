"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { shallow } from "zustand/shallow";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import EmergingClusterBreadcrumbs from "@/components/signal/emerging-cluster-breadcrumbs";
import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import {
  getChartClusters,
  getClustersRangeKey,
  selectUnclusteredCount,
  useSignalStoreContext,
} from "@/components/signal/store.tsx";
import { type DateRange } from "@/components/ui/date-range-filter/utils";
import { type ClusterStatsDataPoint, type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
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
import { buildClusterModel, type ClusterNode } from "./model";

interface Props {
  className?: string;
}

type ClusterStatsResponse = {
  items: ClusterStatsDataPoint[];
  unclusteredCounts: { timestamp: string; count: number }[];
};

const EMPTY_STATS: ClusterStatsDataPoint[] = [];
const EMPTY_CLUSTERS: EventCluster[] = [];
// Stable identities: the readout is rendered without a model when only the
// unclustered bucket exists, and fresh literals would remount it each render.
const EMPTY_TREE: ClusterNode[] = [];
const EMPTY_HAS_CHILDREN = new Set<string>();

export default function ClustersSectionContent({ className }: Props) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [clusterId, setClusterId] = useClusterId();
  const [emergingClusterId, setEmergingClusterId] = useEmergingClusterId();

  // The setter only: subscribing to `hoveredId` here would re-render the section
  // — chart included — on every pointer move over the strip.
  const setHoveredId = useClusterFocusContext((state) => state.setHoveredId);

  const isClustersLoading = useSignalStoreContext((state) => state.isClustersLoading);
  const rawClusters = useSignalStoreContext((state) => state.rawClusters);
  const clustersRangeKey = useSignalStoreContext((state) => state.clustersRangeKey);
  const signal = useSignalStoreContext((state) => state.signal);
  const fetchClusters = useSignalStoreContext((state) => state.fetchClusters);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const rangeKey = getClustersRangeKey({ pastHours, startDate, endDate });
  const hasCurrentClusters = clustersRangeKey === rangeKey;

  const storedChartClusters = useSignalStoreContext((state) => getChartClusters(state, clusterId), shallow);
  const storedUnclusteredCount = useSignalStoreContext(selectUnclusteredCount);
  const chartClusters = hasCurrentClusters ? storedChartClusters : EMPTY_CLUSTERS;
  const unclusteredCount = hasCurrentClusters ? storedUnclusteredCount : 0;

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

  // No revalidation on focus: the strip's tree is fetched through the store, which
  // has no such trigger, so refetching the bars alone would leave the two halves of
  // this chart describing different moments.
  const {
    data: statsResponse,
    error: statsError,
    isValidating: isStatsValidating,
  } = useSWR<ClusterStatsResponse>(statsUrl, swrFetcher, {
    revalidateOnFocus: false,
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
  const model = useMemo(
    () => buildClusterModel(hasCurrentClusters ? rawClusters : EMPTY_CLUSTERS, clusterStatsData),
    [hasCurrentClusters, rawClusters, clusterStatsData]
  );

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

  // This supplies only the denominator for "% of traces" in cluster details.
  // The run totals are deliberately not passed to the chart: its background line
  // graph was removed while this contextual statistic remains useful.
  const runStatsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${signal.projectId}/signals/${signal.id}/runs/stats`,
    // The total is independent of chart bucketing. A stable width avoids
    // refetching the denominator whenever the chart container resizes.
    chartContainerWidth: 1,
    pastHours,
    startDate,
    endDate,
  });
  const {
    data: runStats,
    error: runStatsError,
    isValidating: isRunStatsValidating,
  } = useSWR<{ items: { count: number }[] }>(runStatsUrl, swrFetcher, { revalidateOnFocus: false });
  const traceTotal = useMemo(
    () => (runStats?.items ?? []).reduce((sum, item) => sum + Number(item.count), 0),
    [runStats?.items]
  );

  const isRunStatsPending = !runStats && !runStatsError;

  const isInitialDataLoading = !hasCurrentClusters || isStatsPending || isRunStatsPending;
  const isClusterDataRefreshing = isClustersLoading || isStatsValidating || isRunStatsValidating;
  const showSkeleton = isInitialDataLoading;
  const showChartLoading = isInitialDataLoading;
  const displayedTraceTotal = isClusterDataRefreshing ? 0 : traceTotal;

  const searchWiderRange = useCallback(
    (range: DateRange) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("startDate");
      params.delete("endDate");
      params.delete("groupByInterval");
      params.set("pastHours", range.value);
      params.set("pageNumber", "0");
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
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
      {((hasCurrentClusters && model) || showSkeleton || emergingClusterId) && (
        <div className="mb-2 flex w-full shrink-0 flex-col gap-4">
          {showSkeleton ? (
            <ClusterIcicleSkeleton />
          ) : hasCurrentClusters && model ? (
            <ClusterIcicle
              tree={model.tree}
              ancestors={model.ancestors}
              traceTotal={displayedTraceTotal}
              selectedId={clusterId}
              onHover={setHoveredId}
              onSelect={selectCluster}
            />
          ) : null}
          {emergingClusterId ? (
            <EmergingClusterBreadcrumbs />
          ) : hasCurrentClusters && model ? (
            <ClusterBreadcrumbs />
          ) : null}
        </div>
      )}

      {/* The graph fills this fixed-height container below tunable top padding;
          the readout remains absolutely positioned over the full container. */}
      <div className="h-[250px] w-full overflow-hidden">
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
              pastHours={pastHours}
              startDate={startDate}
              endDate={endDate}
              onSelectRange={searchWiderRange}
              showSearchWiderRange={!clusterId && !emergingClusterId}
              // With the list gone the chart has no other label for what is pinned
              // — and with nothing pinned, the readout's root list is the only way
              // to reach a folded cluster or the unclustered bucket, which has no
              // band on the strip at all.
              // Rendered without a model too, as long as there is something to
              // pick: with no clusters at all the unclustered bucket has neither a
              // band nor a list row anywhere else, so gating this on `model` left
              // those events unreachable.
              overlay={
                (model || unclusteredCount > 0) && (
                  <ClusterReadout
                    tree={model?.tree ?? EMPTY_TREE}
                    hasChildren={model?.hasChildren ?? EMPTY_HAS_CHILDREN}
                    clusterId={clusterId}
                    unclusteredCount={unclusteredCount}
                    traceTotal={displayedTraceTotal}
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
