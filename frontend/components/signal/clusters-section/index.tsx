"use client";

import { Circle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import {
  selectBreadcrumb,
  selectChartClusters,
  selectCurrentNode,
  selectDrillDownDepth,
  selectFilteredCountByCluster,
  selectIsLeaf,
  selectVisibleClusters,
  useSignalStoreContext,
} from "@/components/signal/store.tsx";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";

import ClusterBreadcrumb from "./cluster-breadcrumb";
import ClusterList from "./cluster-list";
import ClusterStackedChart from "./cluster-stacked-chart";
import { getClusterColor, UNCLUSTERED_COLOR } from "./colors";

export default function ClustersSection() {
  const searchParams = useSearchParams();
  const [clusterId, setClusterId] = useClusterId();

  // For leaf nodes, stay at the parent's navigation level
  const isLeafSelector = useMemo(() => selectIsLeaf(clusterId), [clusterId]);
  const isLeaf = useSignalStoreContext(isLeafSelector);
  const currentNodeSelector = useMemo(() => selectCurrentNode(clusterId), [clusterId]);
  const currentNode = useSignalStoreContext(currentNodeSelector);
  const displayId = isLeaf ? (currentNode?.parentId ?? null) : clusterId;

  const isClustersLoading = useSignalStoreContext((state) => state.isClustersLoading);
  const clusterStatsData = useSignalStoreContext((state) => state.clusterStatsData);
  const isClusterStatsLoading = useSignalStoreContext((state) => state.isClusterStatsLoading);
  const rawClusters = useSignalStoreContext((state) => state.rawClusters);
  const fetchClusters = useSignalStoreContext((state) => state.fetchClusters);
  const fetchClusterStats = useSignalStoreContext((state) => state.fetchClusterStats);

  // Breadcrumb uses clusterId (shows the leaf in the path)
  const breadcrumbSelector = useMemo(() => selectBreadcrumb(clusterId), [clusterId]);
  // Depth uses displayId (parent level for leaves), chart uses clusterId (shows selected node's data)
  const drillDownDepthSelector = useMemo(() => selectDrillDownDepth(displayId), [displayId]);
  const chartClustersSelector = useMemo(() => selectChartClusters(clusterId), [clusterId]);
  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const hasTimeRange = !!(pastHours || startDate);
  const filteredCountSelector = useMemo(
    () => selectFilteredCountByCluster(displayId, hasTimeRange),
    [displayId, hasTimeRange]
  );

  const visibleClustersSelector = useMemo(() => selectVisibleClusters(displayId), [displayId]);
  const visibleClusters = useSignalStoreContext(visibleClustersSelector);

  const breadcrumb = useSignalStoreContext(breadcrumbSelector);
  const drillDownDepth = useSignalStoreContext(drillDownDepthSelector);
  const chartClusters = useSignalStoreContext(chartClustersSelector);
  const filteredCountByCluster = useSignalStoreContext(filteredCountSelector);

  // Build stable color map from sibling list so colors match between list and chart
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    visibleClusters.forEach((c, i) => map.set(c.id, getClusterColor(i, drillDownDepth)));
    map.set(UNCLUSTERED_ID, UNCLUSTERED_COLOR);
    return map;
  }, [visibleClusters, drillDownDepth]);

  // Fetch clusters on mount
  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  // Local UI state for resize observer
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [localChartWidth, setLocalChartWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setLocalChartWidth(entry.contentRect.width);
      }
    });
    observer.observe(chartContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Fetch stats when time range, visible clusters, or chart width change
  useEffect(() => {
    const controller = new AbortController();

    fetchClusterStats({
      pastHours,
      startDate,
      endDate,
      chartWidth: localChartWidth,
      clusterId: displayId,
      abortSignal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [pastHours, startDate, endDate, localChartWidth, fetchClusterStats, displayId, rawClusters]);

  // Navigation callbacks
  const navigateToCluster = useCallback(
    (id: string) => {
      // Toggle off if clicking the already-selected leaf/unclustered — go back to parent
      if (id === clusterId && isLeaf) {
        setClusterId(displayId);
      } else {
        setClusterId(id);
      }
    },
    [setClusterId, clusterId, isLeaf, displayId]
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (index < 0) {
        setClusterId(null);
      } else {
        setClusterId(breadcrumb[index].id);
      }
    },
    [setClusterId, breadcrumb]
  );

  if (isClustersLoading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-secondary-foreground">All Events</span>
          </div>
          <DateRangeFilter />
        </div>
        <div className="flex border rounded-lg overflow-hidden h-[300px]" style={{ maxHeight: 300 }}>
          <div className="w-[320px] shrink-0 border-r bg-secondary overflow-y-auto">
            <div className="flex flex-col gap-0.5 py-2 px-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm">
                  <Circle className="size-4 shrink-0 fill-muted stroke-none" />
                  <div className="h-4 w-40 bg-muted rounded animate-pulse truncate" />
                  <div className="h-3 w-6 bg-muted rounded animate-pulse ml-auto shrink-0" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 p-2 bg-secondary flex items-center justify-center text-muted-foreground text-sm shimmer duration-[2s]">
            Loading clusters
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <ClusterBreadcrumb
            breadcrumb={breadcrumb}
            selectedClusterId={clusterId}
            onNavigateToBreadcrumb={navigateToBreadcrumb}
          />
          <DateRangeFilter />
        </div>

        <ResizablePanelGroup
          id="clusters-section"
          orientation="horizontal"
          className="border rounded-lg overflow-hidden h-[300px] min-h-[300px] max-h-[300px]"
        >
          <ResizablePanel defaultSize={"30%"} minSize={"200px"} className="overflow-hidden">
            <ClusterList
              className="h-full w-full"
              displayId={displayId}
              drillDownDepth={drillDownDepth}
              filteredCountByCluster={filteredCountByCluster}
              onNavigateToCluster={navigateToCluster}
            />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={"70%"} minSize={"200px"}>
            <div className="h-full p-2 bg-secondary" ref={chartContainerRef}>
              {isClusterStatsLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Loading chart...
                </div>
              ) : (
                <ClusterStackedChart
                  clusters={chartClusters}
                  statsData={clusterStatsData}
                  containerWidth={localChartWidth}
                  colorMap={colorMap}
                />
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
