"use client";

import { Circle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import {
  getChartClusters,
  getCurrentNode,
  getDrillDownDepth,
  getFilteredCountByCluster,
  getIsLeaf,
  getVisibleClusters,
  useSignalStoreContext,
} from "@/components/signal/store.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";

import ClusterList from "./cluster-list";
import ClusterStackedChart from "./cluster-stacked-chart";
import { getClusterColor, UNCLUSTERED_COLOR } from "./colors";

export default function ClustersSection() {
  const searchParams = useSearchParams();
  const [clusterId, setClusterId] = useClusterId();

  // For leaf nodes, stay at the parent's navigation level
  const isLeaf = useSignalStoreContext((state) => getIsLeaf(state, clusterId));
  const currentNode = useSignalStoreContext((state) => getCurrentNode(state, clusterId));
  const displayId = isLeaf ? (currentNode?.parentId ?? null) : clusterId;

  const isClustersLoading = useSignalStoreContext((state) => state.isClustersLoading);
  const clusterStatsData = useSignalStoreContext((state) => state.clusterStatsData);
  const isClusterStatsLoading = useSignalStoreContext((state) => state.isClusterStatsLoading);
  const rawClusters = useSignalStoreContext((state) => state.rawClusters);
  const fetchClusters = useSignalStoreContext((state) => state.fetchClusters);
  const fetchClusterStats = useSignalStoreContext((state) => state.fetchClusterStats);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const hasTimeRange = !!(pastHours || startDate);

  // Depth uses displayId (parent level for leaves), chart uses clusterId (shows selected node's data)
  const visibleClusters = useSignalStoreContext((state) => getVisibleClusters(state, displayId), shallow);
  const drillDownDepth = useSignalStoreContext((state) => getDrillDownDepth(state, displayId));
  const chartClusters = useSignalStoreContext((state) => getChartClusters(state, clusterId), shallow);
  const filteredCountByCluster = useSignalStoreContext(
    (state) => getFilteredCountByCluster(state, displayId, hasTimeRange),
    shallow
  );

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

  // Fetch stats when time range or chart width change
  useEffect(() => {
    const controller = new AbortController();

    fetchClusterStats({
      pastHours,
      startDate,
      endDate,
      chartWidth: localChartWidth,
      abortSignal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [pastHours, startDate, endDate, localChartWidth, fetchClusterStats, rawClusters]);

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

  if (isClustersLoading) {
    return (
      <div className="flex border rounded-lg overflow-hidden h-[240px] w-full bg-secondary" style={{ maxHeight: 300 }}>
        <div className="w-[320px] shrink-0 border-r overflow-y-auto">
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
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <ResizablePanelGroup
        id="clusters-section"
        orientation="horizontal"
        className="border rounded-lg overflow-hidden h-[240px] min-h-[240px] max-h-[240px]"
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
    </TooltipProvider>
  );
}
