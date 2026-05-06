"use client";

import { motion, type MotionValue, useMotionValue, useTransform } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ClusterBreadcrumb from "@/components/signal/clusters-section/cluster-breadcrumb";
import ClusterList from "@/components/signal/clusters-section/cluster-list";
import ClusterStackedChart from "@/components/signal/clusters-section/cluster-stacked-chart";
import { getClusterColor, UNCLUSTERED_COLOR } from "@/components/signal/clusters-section/colors";
import { buildPath, type ClusterNode, findNodeById } from "@/components/signal/clusters-section/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { cn } from "@/lib/utils";

import { MOCK_DATASETS, type SignalTabKey } from "./mock-data";
import MockEventsTable from "./mock-events-table";

interface Props {
  tabKey: SignalTabKey;
  className?: string;
  eventsHeaderProgress?: MotionValue<number>;
  clustersProgress?: MotionValue<number>;
}

const SignalsMockUI = ({ tabKey, className, eventsHeaderProgress, clustersProgress }: Props) => {
  const dataset = MOCK_DATASETS[tabKey];
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
  const breadcrumb = useMemo(
    () => (selectedClusterId ? buildPath(dataset.clusterTree, selectedClusterId) : []),
    [dataset.clusterTree, selectedClusterId]
  );
  const displayBreadcrumb = useMemo(
    () => (displayId ? buildPath(dataset.clusterTree, displayId) : []),
    [dataset.clusterTree, displayId]
  );
  const drillDownDepth = displayBreadcrumb.length;

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
    const map = new Map<string, number>();
    for (const c of visibleClusters) map.set(c.id, c.numEvents);
    map.set(UNCLUSTERED_ID, unclusteredCount);
    return map;
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
      if (id === selectedClusterId && isLeaf) {
        setSelectedClusterId(displayId);
      } else {
        setSelectedClusterId(id);
      }
    },
    [selectedClusterId, isLeaf, displayId]
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (index < 0) setSelectedClusterId(null);
      else setSelectedClusterId(breadcrumb[index].id);
    },
    [breadcrumb]
  );

  const visibleEvents = useMemo(() => {
    if (!selectedClusterId) return dataset.events;
    if (selectedClusterId === UNCLUSTERED_ID) return [];
    const node = findNodeById(dataset.clusterTree, selectedClusterId);
    if (!node) return dataset.events;
    const ids = new Set<string>();
    const walk = (n: ClusterNode) => {
      ids.add(n.id);
      n.children.forEach(walk);
    };
    walk(node);
    return dataset.events.filter((e) => ids.has(e.clusterId));
  }, [selectedClusterId, dataset]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    ro.observe(chartContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // Default both panels to fully visible (1) when no MotionValue is passed,
  // so this component still works in any non-orchestrated context.
  const eventsFallback = useMotionValue(1);
  const clustersFallback = useMotionValue(1);
  const eventsSource = eventsHeaderProgress ?? eventsFallback;
  const clustersSource = clustersProgress ?? clustersFallback;
  // 28 px is enough room for the "Signal events" label (text-sm + gap).
  const eventsHeaderHeight = useTransform(eventsSource, [0, 1], [0, 28], { clamp: true });
  const eventsHeaderOpacity = useTransform(eventsSource, [0, 1], [0, 1], { clamp: true });
  const clustersHeight = useTransform(clustersSource, [0, 1], [0, 312], { clamp: true });
  const clustersOpacity = useTransform(clustersSource, [0, 1], [0, 1], { clamp: true });
  const clustersMarginBottom = useTransform(clustersSource, [0, 1], [0, 8], { clamp: true });

  const eventsHeaderStyle = { height: eventsHeaderHeight, opacity: eventsHeaderOpacity };
  const clustersStyle = { height: clustersHeight, opacity: clustersOpacity, marginBottom: clustersMarginBottom };

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex flex-col w-full overflow-hidden border rounded-lg bg-background p-4 ", className)}>
        <motion.div style={clustersStyle} className="flex flex-col gap-2 shrink-0 overflow-hidden">
          <ClusterBreadcrumb
            breadcrumb={breadcrumb}
            selectedClusterId={selectedClusterId}
            onNavigateToBreadcrumb={navigateToBreadcrumb}
          />
          <div className="flex h-[280px] shrink-0 border rounded-md bg-secondary overflow-hidden">
            <div className="w-[280px] shrink-0 border-r overflow-hidden">
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
            <div className="flex-1 min-w-0 py-2 pr-2" ref={chartContainerRef}>
              <ClusterStackedChart
                clusters={chartClusters}
                statsData={dataset.stats}
                containerWidth={chartWidth}
                colorMap={colorMap}
              />
            </div>
          </div>
        </motion.div>
        <motion.div style={eventsHeaderStyle} className="flex items-end shrink-0 overflow-hidden pl-1 ">
          <p className="text-sm text-secondary-foreground mb-2">Signal events</p>
        </motion.div>
        <MockEventsTable events={visibleEvents} className="flex-1 min-h-0 pointer-events-none" />
      </div>
    </TooltipProvider>
  );
};

export default SignalsMockUI;
