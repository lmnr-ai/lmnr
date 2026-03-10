"use client";

import { Circle } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { calculateOptimalInterval, getTargetBarsForWidth } from "@/components/charts/time-series-chart/utils";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { type ClusterStatsDataPoint } from "@/lib/actions/clusters/stats";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { cn } from "@/lib/utils";

import ClusterBreadcrumb from "./cluster-breadcrumb";
import ClusterList from "./cluster-list";
import ClusterStackedChart from "./cluster-stacked-chart";
import { buildPath, buildTree, type ClusterNode, collectDescendantIds, findNodeById } from "./utils";

export default function ClustersTable() {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const signal = useSignalStoreContext((state) => state.signal);
  const setSelectedClusterIds = useSignalStoreContext((state) => state.setSelectedClusterIds);
  const setIsUnclusteredFilter = useSignalStoreContext((state) => state.setIsUnclusteredFilter);

  const [rawClusters, setRawClusters] = useState<EventCluster[]>([]);
  const [totalEventCount, setTotalEventCount] = useState(0);
  const [clusteredEventCount, setClusteredEventCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [statsData, setStatsData] = useState<ClusterStatsDataPoint[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [localChartWidth, setLocalChartWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

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

  // Current drill-down path from URL
  const clusterPath = searchParams.get("clusterPath") || "";
  const pathIds = useMemo(() => (clusterPath ? clusterPath.split(",") : []), [clusterPath]);
  const drillDownDepth = pathIds.length;

  const tree = useMemo(() => buildTree(rawClusters), [rawClusters]);

  const { currentNode, visibleClusters, breadcrumb } = useMemo(() => {
    if (pathIds.length === 0) {
      return { currentNode: null, visibleClusters: tree, breadcrumb: [] as ReturnType<typeof buildPath> };
    }

    const lastId = pathIds[pathIds.length - 1];
    const node = findNodeById(tree, lastId);
    const path = buildPath(tree, lastId);

    return {
      currentNode: node,
      visibleClusters: node ? node.children : tree,
      breadcrumb: path,
    };
  }, [tree, pathIds]);

  // Compute unclustered event count: total events - events that belong to any cluster
  const unclusteredCount = useMemo(
    () => Math.max(0, totalEventCount - clusteredEventCount),
    [totalEventCount, clusteredEventCount]
  );

  const hasTimeRange = !!(searchParams.get("pastHours") || searchParams.get("startDate"));

  const filteredCountByCluster = useMemo(() => {
    const counts = new Map<string, number>();
    // When a time range is active, seed all visible clusters with 0
    // so clusters with no events in range show "0 / N" instead of falling back to all-time count
    if (hasTimeRange) {
      for (const cluster of visibleClusters) {
        counts.set(cluster.id, 0);
      }
      if (drillDownDepth === 0) {
        counts.set(UNCLUSTERED_ID, 0);
      }
    }
    for (const row of statsData) {
      counts.set(row.cluster_id, (counts.get(row.cluster_id) ?? 0) + row.count);
    }
    return counts;
  }, [statsData, hasTimeRange, visibleClusters, drillDownDepth]);

  // Update store with selected cluster IDs for events table filtering
  useEffect(() => {
    if (selectedLeafId === UNCLUSTERED_ID) {
      setSelectedClusterIds([]);
      setIsUnclusteredFilter(true);
    } else if (selectedLeafId) {
      setIsUnclusteredFilter(false);
      const leafNode = findNodeById(tree, selectedLeafId);
      if (leafNode) {
        setSelectedClusterIds(collectDescendantIds(leafNode));
      }
    } else if (currentNode) {
      setIsUnclusteredFilter(false);
      setSelectedClusterIds(collectDescendantIds(currentNode));
    } else {
      setIsUnclusteredFilter(false);
      setSelectedClusterIds([]);
    }
  }, [currentNode, selectedLeafId, tree, setSelectedClusterIds, setIsUnclusteredFilter]);

  // Reset leaf selection when navigating to a different level
  useEffect(() => {
    setSelectedLeafId(null);
  }, [clusterPath]);

  const fetchClusters = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${params.projectId}/signals/${signal.id}/events/clusters`);
      if (!res.ok) {
        const text = (await res.json()) as { error: string };
        throw new Error(text.error);
      }
      const data = (await res.json()) as {
        items: EventCluster[];
        totalEventCount: number;
        clusteredEventCount: number;
      };
      setRawClusters(data.items);
      setTotalEventCount(data.totalEventCount);
      setClusteredEventCount(data.clusteredEventCount);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to load clusters. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [params.projectId, signal.id, toast]);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  // Fetch stats for visible clusters (+ unclustered at root level)
  useEffect(() => {
    let cancelled = false;

    const pastHours = searchParams.get("pastHours");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!pastHours && !startDate) {
      setStatsData([]);
      return;
    }

    const chartWidth = localChartWidth ?? 800;
    const targetBars = getTargetBarsForWidth(chartWidth);
    let range: { start: Date; end: Date } | null = null;
    if (pastHours && pastHours !== "all") {
      const hours = parseInt(pastHours);
      if (!isNaN(hours)) {
        range = { start: new Date(Date.now() - hours * 60 * 60 * 1000), end: new Date() };
      }
    } else if (startDate && endDate) {
      range = { start: new Date(startDate), end: new Date(endDate) };
    }
    const interval = range
      ? calculateOptimalInterval(range.start, range.end, targetBars)
      : { value: 1, unit: "hour" as const };

    setIsLoadingStats(true);

    const fetches: Promise<ClusterStatsDataPoint[]>[] = [];

    // Fetch cluster stats if there are visible clusters
    if (visibleClusters.length > 0) {
      const urlParams = new URLSearchParams();
      visibleClusters.forEach((c) => urlParams.append("clusterId", c.id));
      if (pastHours) urlParams.set("pastHours", pastHours);
      if (startDate) urlParams.set("startDate", startDate);
      if (endDate) urlParams.set("endDate", endDate);
      urlParams.set("intervalValue", interval.value.toString());
      urlParams.set("intervalUnit", interval.unit);

      fetches.push(
        fetch(`/api/projects/${params.projectId}/signals/${signal.id}/events/clusters/stats?${urlParams.toString()}`)
          .then((res) => {
            if (!res.ok) throw new Error("Failed to fetch cluster stats");
            return res.json();
          })
          .then((data: { items: ClusterStatsDataPoint[] }) => data.items)
          .catch(() => [] as ClusterStatsDataPoint[])
      );
    } else {
      fetches.push(Promise.resolve([]));
    }

    // At root level, fetch unclustered stats directly via empty(clusters)
    if (drillDownDepth === 0) {
      const unclusteredParams = new URLSearchParams();
      if (pastHours) unclusteredParams.set("pastHours", pastHours);
      if (startDate) unclusteredParams.set("startDate", startDate);
      if (endDate) unclusteredParams.set("endDate", endDate);
      unclusteredParams.set("intervalValue", interval.value.toString());
      unclusteredParams.set("intervalUnit", interval.unit);
      unclusteredParams.set("unclustered", "true");

      fetches.push(
        fetch(`/api/projects/${params.projectId}/signals/${signal.id}/events/stats?${unclusteredParams.toString()}`)
          .then((res) => {
            if (!res.ok) throw new Error("Failed to fetch unclustered stats");
            return res.json();
          })
          .then((data: { items: Array<{ timestamp: string; count: number }> }) =>
            data.items.map((item) => ({
              cluster_id: UNCLUSTERED_ID,
              timestamp: item.timestamp,
              count: item.count,
            }))
          )
          .catch(() => [] as ClusterStatsDataPoint[])
      );
    } else {
      fetches.push(Promise.resolve([]));
    }

    Promise.all(fetches)
      .then(([clusterStats, unclusteredStats]) => {
        if (!cancelled) {
          setStatsData([...clusterStats, ...unclusteredStats]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingStats(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visibleClusters, searchParams, params.projectId, signal.id, localChartWidth, drillDownDepth]);

  const navigateToCluster = useCallback(
    (clusterId: string) => {
      const newParams = new URLSearchParams(searchParams.toString());
      const newPath = [...pathIds, clusterId].join(",");
      newParams.set("clusterPath", newPath);
      router.push(`${pathname}?${newParams.toString()}`);
    },
    [searchParams, pathIds, router, pathname]
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      const newParams = new URLSearchParams(searchParams.toString());

      if (index < 0) {
        newParams.delete("clusterPath");
      } else {
        const newPath = pathIds.slice(0, index + 1).join(",");
        newParams.set("clusterPath", newPath);
      }

      setSelectedLeafId(null);
      router.push(`${pathname}?${newParams.toString()}`);
    },
    [searchParams, pathIds, router, pathname]
  );

  const handleToggleLeafSelection = useCallback((clusterId: string) => {
    setSelectedLeafId((prev) => (prev === clusterId ? null : clusterId));
  }, []);

  const handleClearLeafSelection = useCallback(() => {
    setSelectedLeafId(null);
  }, []);

  // Build the list of clusters to show in the chart, including unclustered at root level
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

  const chartClusters: ClusterNode[] = useMemo(() => {
    if (selectedLeafId === UNCLUSTERED_ID) {
      return [unclusteredVirtualCluster];
    }
    if (selectedLeafId) {
      return visibleClusters.filter((c) => c.id === selectedLeafId);
    }
    const clusters: ClusterNode[] = [...visibleClusters];
    if (drillDownDepth === 0 && unclusteredCount > 0) {
      clusters.push(unclusteredVirtualCluster);
    }
    return clusters;
  }, [visibleClusters, selectedLeafId, drillDownDepth, unclusteredCount, unclusteredVirtualCluster]);

  const chartStatsData = useMemo(() => {
    if (selectedLeafId === UNCLUSTERED_ID) {
      return statsData.filter((d) => d.cluster_id === UNCLUSTERED_ID);
    }
    if (selectedLeafId) {
      return statsData.filter((d) => d.cluster_id === selectedLeafId);
    }
    return statsData;
  }, [statsData, selectedLeafId]);

  if (isLoading) {
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
            selectedLeafId={selectedLeafId}
            visibleClusters={visibleClusters}
            pathIds={pathIds}
            onNavigateToBreadcrumb={navigateToBreadcrumb}
            onClearLeafSelection={handleClearLeafSelection}
          />
          <DateRangeFilter />
        </div>

        <div className="flex border rounded-lg overflow-hidden h-[300px]">
          <Resizable
            defaultSize={{ width: 320 }}
            minWidth={200}
            maxWidth="70%"
            enable={{ right: true }}
            onResizeStart={() => setIsResizing(true)}
            onResizeStop={() => setIsResizing(false)}
            handleStyles={{ right: { width: 8, right: -4 } }}
            handleComponent={{
              right: (
                <div className="h-full w-full flex items-center justify-center group cursor-col-resize">
                  <div
                    className={cn(
                      "h-full w-px bg-border group-hover:w-0.5 group-hover:bg-blue-400 transition-colors",
                      isResizing && "w-0.5 bg-blue-400"
                    )}
                  />
                </div>
              ),
            }}
          >
            <ClusterList
              className="h-full"
              visibleClusters={visibleClusters}
              selectedLeafId={selectedLeafId}
              drillDownDepth={drillDownDepth}
              filteredCountByCluster={filteredCountByCluster}
              onNavigateToCluster={navigateToCluster}
              onToggleLeafSelection={handleToggleLeafSelection}
              unclusteredCount={unclusteredCount}
              unclusteredVirtualCluster={unclusteredVirtualCluster}
            />
          </Resizable>

          <div className="flex-1 p-2 bg-secondary" ref={chartContainerRef}>
            {isLoadingStats ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Loading chart...
              </div>
            ) : (
              <ClusterStackedChart
                clusters={chartClusters}
                statsData={chartStatsData}
                containerWidth={localChartWidth}
                depthLevel={drillDownDepth}
                colorIndexOffset={selectedLeafId ? visibleClusters.findIndex((c) => c.id === selectedLeafId) : 0}
              />
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
