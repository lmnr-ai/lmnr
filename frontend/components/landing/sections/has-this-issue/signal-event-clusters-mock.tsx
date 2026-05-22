"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ClusterBreadcrumb from "@/components/signal/clusters-section/cluster-breadcrumb";
import ClusterList from "@/components/signal/clusters-section/cluster-list";
import ClusterStackedChart from "@/components/signal/clusters-section/cluster-stacked-chart";
import { getClusterColor, UNCLUSTERED_COLOR } from "@/components/signal/clusters-section/colors";
import { buildPath, type ClusterNode, findNodeById } from "@/components/signal/clusters-section/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { cn } from "@/lib/utils";

import { MOCK_DATASETS } from "./clusters-mock-data";

interface Props {
  className?: string;
}

// Cluster card mirroring the production clusters section visual (bg-secondary
// inner card on a bg-background wrapper) — list + stacked chart, no
// breadcrumb/events. Drill-down works just like the real one.
const SignalEventClustersMock = ({ className }: Props) => {
  const dataset = MOCK_DATASETS["detect-failures"];
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  const currentNode = useMemo(
    () => (selectedClusterId ? findNodeById(dataset.clusterTree, selectedClusterId) : null),
    [dataset.clusterTree, selectedClusterId]
  );
  const isLeaf = selectedClusterId === UNCLUSTERED_ID || (currentNode !== null && currentNode.children.length === 0);
  const displayId = isLeaf ? (currentNode?.parentId ?? null) : selectedClusterId;
  const displayNode = useMemo(
    () => (displayId ? findNodeById(dataset.clusterTree, displayId) : null),
    [dataset.clusterTree, displayId]
  );

  const visibleClusters: ClusterNode[] = displayNode ? displayNode.children : dataset.clusterTree;
  const drillDownDepth = displayNode ? displayNode.level + 1 : 0;

  const unclusteredCount = Math.max(0, dataset.totalEventCount - dataset.clusteredEventCount);
  const unclusteredVirtualCluster: ClusterNode = useMemo(
    () => ({
      id: UNCLUSTERED_ID,
      name: "Unclustered Events",
      parentId: null,
      level: 0,
      numChildrenClusters: 0,
      numEvents: unclusteredCount,
      createdAt: "",
      updatedAt: "",
      children: [],
    }),
    [unclusteredCount]
  );

  const filteredCountByCluster = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of visibleClusters) m.set(c.id, c.numEvents);
    m.set(UNCLUSTERED_ID, unclusteredCount);
    return m;
  }, [visibleClusters, unclusteredCount]);

  const chartClusters: ClusterNode[] = useMemo(() => {
    if (selectedClusterId === UNCLUSTERED_ID) return [unclusteredVirtualCluster];
    if (currentNode && currentNode.children.length === 0) return [currentNode];
    const visible = displayNode ? displayNode.children : dataset.clusterTree;
    const list: ClusterNode[] = [...visible];
    if (drillDownDepth === 0 && unclusteredCount > 0) list.push(unclusteredVirtualCluster);
    return list;
  }, [
    selectedClusterId,
    currentNode,
    displayNode,
    dataset.clusterTree,
    drillDownDepth,
    unclusteredCount,
    unclusteredVirtualCluster,
  ]);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    visibleClusters.forEach((c, i) => m.set(c.id, getClusterColor(i, drillDownDepth)));
    m.set(UNCLUSTERED_ID, UNCLUSTERED_COLOR);
    return m;
  }, [visibleClusters, drillDownDepth]);

  const navigateToCluster = useCallback(
    (id: string) => {
      if (id === selectedClusterId && isLeaf) setSelectedClusterId(displayId);
      else setSelectedClusterId(id);
    },
    [selectedClusterId, isLeaf, displayId]
  );

  const breadcrumb = useMemo(
    () => (selectedClusterId ? buildPath(dataset.clusterTree, selectedClusterId) : []),
    [dataset.clusterTree, selectedClusterId]
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (index < 0) setSelectedClusterId(null);
      else setSelectedClusterId(breadcrumb[index].id);
    },
    [breadcrumb]
  );

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    ro.observe(chartContainerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("w-[720px] min-w-[600px] rounded-lg border bg-background p-3 flex flex-col gap-2", className)}>
        <ClusterBreadcrumb
          breadcrumb={breadcrumb}
          selectedClusterId={selectedClusterId}
          onNavigateToBreadcrumb={navigateToBreadcrumb}
        />
        <div className="flex h-[230px] rounded-md border bg-secondary overflow-hidden">
          <div className="w-[250px] md:w-[300px] shrink-0 border-r overflow-hidden">
            <ClusterList
              className="h-full w-full bg-transparent"
              drillDownDepth={drillDownDepth}
              filteredCountByCluster={filteredCountByCluster}
              visibleClusters={visibleClusters}
              unclusteredCount={unclusteredCount}
              unclusteredVirtualCluster={unclusteredVirtualCluster}
              selectedClusterId={selectedClusterId}
              onNavigateToCluster={navigateToCluster}
            />
          </div>
          <div className="flex-1 min-w-0 py-2 pr-2 pl-1 bg-secondary" ref={chartContainerRef}>
            <ClusterStackedChart
              clusters={chartClusters}
              statsData={dataset.stats}
              containerWidth={chartWidth}
              colorMap={colorMap}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default SignalEventClustersMock;
