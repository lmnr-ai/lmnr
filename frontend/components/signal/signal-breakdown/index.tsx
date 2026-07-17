"use client";

import { isEmpty } from "lodash";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import EmergingClusterBreadcrumbs from "@/components/signal/emerging-cluster-breadcrumbs";
import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import { useSignalStoreContext } from "@/components/signal/store";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProjectContext } from "@/contexts/project-context";
import { getHasClusteringAccess } from "@/lib/features/clustering";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

import { availableDimensions } from "./dimensions";
import SignalBreakdownBreadcrumbs from "./signal-breakdown-breadcrumbs";
import SignalBreakdownGraph from "./signal-breakdown-graph";
import SignalBreakdownList from "./signal-breakdown-list";
import { buildPath, countsByBucket, findNodeById, isLeaf, rangeTotal, visibleChildren } from "./tree";
import { dimensionKey } from "./types";
import { useSignalBreakdown } from "./use-signal-breakdown";

interface Props {
  className?: string;
}

export default function SignalBreakdownSection({ className }: Props) {
  const { workspace, settingsHref } = useProjectContext();
  const searchParams = useSearchParams();

  const signal = useSignalStoreContext((s) => s.signal);
  const breakdownBy = useSignalStoreContext((s) => s.breakdownBy);
  const setBreakdownBy = useSignalStoreContext((s) => s.setBreakdownBy);
  const rawClusters = useSignalStoreContext((s) => s.rawClusters);
  const fetchClusters = useSignalStoreContext((s) => s.fetchClusters);
  const fetchClusterStats = useSignalStoreContext((s) => s.fetchClusterStats);
  const [emergingClusterId] = useEmergingClusterId();

  const isClusters = breakdownBy.kind === "clusters";
  const isPaywall = isClusters && !getHasClusteringAccess(workspace?.tierName);
  const billingHref = settingsHref("billing");

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  const { nodes, statsData, selectedId, setSelectedId, isLoading, isStatsLoading } = useSignalBreakdown({
    pastHours,
    startDate,
    endDate,
    containerWidth,
  });

  const dimensions = useMemo(() => availableDimensions(signal.schemaFields), [signal.schemaFields]);

  // For leaf nodes, keep the list at the parent's level (show siblings).
  const leafSelected = isLeaf(nodes, selectedId);
  const currentNode = selectedId ? findNodeById(nodes, selectedId) : null;
  const displayId = leafSelected ? (currentNode?.parentId ?? null) : selectedId;

  const visibleNodes = useMemo(() => visibleChildren(nodes, displayId), [nodes, displayId]);
  const breadcrumb = useMemo(() => (selectedId ? buildPath(nodes, selectedId) : []), [nodes, selectedId]);
  const isRoot = displayId === null;
  const chartBuckets = useMemo(
    () => (leafSelected && currentNode ? [currentNode] : visibleNodes),
    [leafSelected, currentNode, visibleNodes]
  );
  const filteredCountByBucket = useMemo(
    () =>
      countsByBucket(
        statsData,
        visibleNodes.map((n) => n.id)
      ),
    [statsData, visibleNodes]
  );
  const total = useMemo(() => rangeTotal(nodes, statsData), [nodes, statsData]);

  // --- Cluster fetches (dimension-scoped; other dims fetch inside the hook). ---
  useEffect(() => {
    if (!isClusters) return;
    if (!pastHours && !(startDate && endDate)) return;
    fetchClusters({ pastHours, startDate, endDate });
  }, [isClusters, fetchClusters, pastHours, startDate, endDate]);

  const clusterStatsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${signal.projectId}/signals/${signal.id}/events/clusters/stats`,
    chartContainerWidth: containerWidth,
    pastHours,
    startDate,
    endDate,
  });
  useEffect(() => {
    if (!isClusters) return;
    const controller = new AbortController();
    fetchClusterStats({ statsUrl: clusterStatsUrl, abortSignal: controller.signal });
    return () => controller.abort();
  }, [isClusters, clusterStatsUrl, fetchClusterStats, rawClusters]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(chartContainerRef.current);
    return () => ro.disconnect();
  }, [isLoading]);

  // Signal-runs overlay (denominator) — dimension-independent.
  const runStatsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${signal.projectId}/signals/${signal.id}/runs/stats`,
    chartContainerWidth: containerWidth,
    pastHours,
    startDate,
    endDate,
  });
  const { data: runTotals = [] } = useSWR(runStatsUrl, async (url: string) => {
    const data = (await swrFetcher(url)) as { items: { timestamp: string; count: number }[] };
    return (data?.items ?? []).map((i) => ({ timestamp: i.timestamp, count: Number(i.count) }));
  });

  const navigate = useCallback(
    (id: string) => {
      if (isPaywall) return;
      if (isClusters) track("signals", "cluster_clicked", { clusterId: id });
      // Clicking the already-selected node goes up to its parent (→ root at top).
      if (id === selectedId) {
        setSelectedId(currentNode?.parentId ?? null);
      } else {
        setSelectedId(id);
      }
    },
    [isPaywall, isClusters, selectedId, currentNode, setSelectedId]
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => setSelectedId(index < 0 ? null : breadcrumb[index].id),
    [setSelectedId, breadcrumb]
  );

  const onDimensionChange = useCallback(
    (key: string) => {
      const opt = dimensions.find((d) => d.key === key);
      if (opt) setBreakdownBy(opt.dimension);
    },
    [dimensions, setBreakdownBy]
  );

  // Emerging-cluster view is a clusters-only sub-state.
  const showEmerging = isClusters && !!emergingClusterId;

  const showListSkeleton = isLoading && isEmpty(nodes);

  return (
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      {showEmerging ? (
        <EmergingClusterBreadcrumbs />
      ) : (
        <SignalBreakdownBreadcrumbs
          dimensions={dimensions}
          currentKey={dimensionKey(breakdownBy)}
          onDimensionChange={onDimensionChange}
          breadcrumb={breadcrumb}
          onNavigateToBreadcrumb={navigateToBreadcrumb}
        />
      )}

      <TooltipProvider delayDuration={200}>
        <ResizablePanelGroup
          id="signal-breakdown-section"
          orientation="horizontal"
          className="border rounded-lg overflow-hidden h-[240px] min-h-[240px] max-h-[240px] w-full"
        >
          <ResizablePanel defaultSize={"36%"} minSize={"200px"} className="overflow-hidden">
            <div className="relative h-full w-full">
              {showListSkeleton ? (
                <div className="h-full w-full bg-secondary flex items-center justify-center text-muted-foreground text-sm shimmer duration-[2s]">
                  Loading
                </div>
              ) : (
                <SignalBreakdownList
                  className="h-full w-full"
                  nodes={visibleNodes}
                  selectedId={selectedId}
                  filteredCountByBucket={filteredCountByBucket}
                  rangeTotal={total}
                  isRoot={isRoot}
                  onNavigate={navigate}
                  isPaywall={isPaywall}
                />
              )}
              {isPaywall && (
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 px-3 py-2 rounded-md border bg-background">
                  <span className="text-xs text-muted-foreground flex-1 min-w-0">
                    Event clusters for high-level insights
                  </span>
                  <Link href={billingHref}>
                    <Button size="sm">Upgrade to Pro</Button>
                  </Link>
                </div>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={"64%"} minSize={"400px"}>
            <div className="h-full py-2 pr-2 bg-secondary" ref={chartContainerRef}>
              {isStatsLoading && isEmpty(statsData) ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Loading chart...
                </div>
              ) : (
                <SignalBreakdownGraph
                  buckets={chartBuckets}
                  statsData={statsData}
                  containerWidth={containerWidth}
                  showTooltip={!isPaywall}
                  runTotals={runTotals}
                />
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </TooltipProvider>
    </div>
  );
}
