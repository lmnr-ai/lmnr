"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import EmergingClusterBreadcrumbs from "@/components/signal/emerging-cluster-breadcrumbs";
import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import { getBreadcrumbFromData, getChartClustersFromData, useSignalStoreContext } from "@/components/signal/store.tsx";
import { type DateRange } from "@/components/ui/date-range-filter/utils";
import {
  type ClusterVisualizationSnapshot,
  getClusterVisualizationRangeKey,
} from "@/lib/actions/cluster-visualization-types";
import { type ClusterStatsDataPoint } from "@/lib/actions/clusters";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters/types";
import { getClusterColorById, UNCLUSTERED_COLOR } from "@/lib/clusters/colors";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

import ClusterBreadcrumb from "./cluster-breadcrumb";
import ClusterIcicle from "./cluster-icicle";
import ClusterIcicleSkeleton from "./cluster-icicle-skeleton";
import ClusterReadout from "./cluster-readout";
import ClusterStackedChart from "./cluster-stacked-chart";
import { useClusterFocusContext } from "./focus-store";
import { buildClusterModel, type ClusterNode } from "./model";
import { buildTree } from "./utils";

interface Props {
  className?: string;
}

const EMPTY_STATS: ClusterStatsDataPoint[] = [];
const EMPTY_TREE: ClusterNode[] = [];
const EMPTY_HAS_CHILDREN = new Set<string>();

export default function ClustersSectionContent({ className }: Props) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [clusterId, setClusterId] = useClusterId();
  const [emergingClusterId, setEmergingClusterId] = useEmergingClusterId();
  const setHoveredId = useClusterFocusContext((state) => state.setHoveredId);
  const signal = useSignalStoreContext((state) => state.signal);
  const setClusters = useSignalStoreContext((state) => state.setClusters);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const rangeKey = getClusterVisualizationRangeKey({ pastHours, startDate, endDate });

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [localChartWidth, setLocalChartWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) setLocalChartWidth(entry.contentRect.width);
    });
    resizeObserver.observe(chartContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const visualizationUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${signal.projectId}/signals/${signal.id}/clusters/visualization`,
    chartContainerWidth: localChartWidth,
    pastHours,
    startDate,
    endDate,
  });
  const { data: snapshot, error } = useSWR<ClusterVisualizationSnapshot>(visualizationUrl, swrFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    onError: () =>
      toast({ title: "Error", description: "Failed to load cluster visualization.", variant: "destructive" }),
  });
  const isLoading = !snapshot && !error;
  const isCurrentSnapshot = snapshot?.rangeKey === rangeKey;
  const currentSnapshot = isCurrentSnapshot ? snapshot : undefined;

  // The store remains the shared index for event-table filtering. It receives
  // only complete visualization snapshots, never independently fetched pieces.
  useEffect(() => {
    if (!currentSnapshot) return;
    setClusters({
      items: currentSnapshot.clusters,
      totalEventCount: currentSnapshot.totalEventCount,
      clusteredEventCount: currentSnapshot.clusteredEventCount,
      rangeKey: currentSnapshot.rangeKey,
    });
  }, [currentSnapshot, setClusters]);

  const clusterStatsData = useMemo(() => {
    if (!currentSnapshot) return EMPTY_STATS;
    return [
      ...currentSnapshot.stats,
      ...currentSnapshot.unclusteredCounts.map((item) => ({
        cluster_id: UNCLUSTERED_ID,
        timestamp: item.timestamp,
        count: item.count,
      })),
    ];
  }, [currentSnapshot]);

  const clusterTree = useMemo(() => buildTree(currentSnapshot?.clusters ?? []), [currentSnapshot]);
  const chartClusters = useMemo(
    () =>
      currentSnapshot
        ? getChartClustersFromData(
            clusterTree,
            currentSnapshot.totalEventCount,
            currentSnapshot.clusteredEventCount,
            clusterId
          )
        : [],
    [clusterId, clusterTree, currentSnapshot]
  );
  const unclusteredCount = currentSnapshot
    ? Math.max(0, currentSnapshot.totalEventCount - currentSnapshot.clusteredEventCount)
    : 0;
  const model = useMemo(
    () => buildClusterModel(currentSnapshot?.clusters ?? [], clusterStatsData),
    [clusterStatsData, currentSnapshot]
  );
  const breadcrumb = useMemo(
    () => getBreadcrumbFromData(clusterTree, unclusteredCount, clusterId),
    [clusterId, clusterTree, unclusteredCount]
  );
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    chartClusters.forEach((cluster) => map.set(cluster.id, getClusterColorById(cluster.id)));
    map.set(UNCLUSTERED_ID, UNCLUSTERED_COLOR);
    return map;
  }, [chartClusters]);

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

  const selectCluster = useCallback(
    (id: string) => {
      track("signals", "cluster_clicked", { clusterId: id === UNCLUSTERED_ID ? "-" : id });
      setEmergingClusterId(null);
      setClusterId(clusterId === id ? null : id);
    },
    [clusterId, setClusterId, setEmergingClusterId]
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => setClusterId(index < 0 ? null : breadcrumb[index].id),
    [breadcrumb, setClusterId]
  );

  const showSkeleton = isLoading && !currentSnapshot;

  return (
    <div className={cn("relative flex w-full min-w-0 flex-col", className)}>
      {(model || showSkeleton || emergingClusterId) && (
        <div className="mb-2 flex w-full shrink-0 flex-col gap-4">
          {showSkeleton ? (
            <ClusterIcicleSkeleton />
          ) : model ? (
            <ClusterIcicle
              tree={model.tree}
              ancestors={model.ancestors}
              traceTotal={currentSnapshot?.traceTotal ?? 0}
              selectedId={clusterId}
              onHover={setHoveredId}
              onSelect={selectCluster}
            />
          ) : null}
          {emergingClusterId ? (
            <EmergingClusterBreadcrumbs />
          ) : model ? (
            <ClusterBreadcrumb
              breadcrumb={breadcrumb}
              selectedClusterId={clusterId}
              onNavigateToBreadcrumb={navigateToBreadcrumb}
            />
          ) : null}
        </div>
      )}

      <div className="h-[250px] w-full overflow-hidden">
        <div className="h-full" ref={chartContainerRef}>
          {showSkeleton ? (
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
              overlay={
                (model || unclusteredCount > 0) && (
                  <ClusterReadout
                    tree={model?.tree ?? EMPTY_TREE}
                    hasChildren={model?.hasChildren ?? EMPTY_HAS_CHILDREN}
                    clusterId={clusterId}
                    unclusteredCount={unclusteredCount}
                    traceTotal={currentSnapshot?.traceTotal ?? 0}
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
