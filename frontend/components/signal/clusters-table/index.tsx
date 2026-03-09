"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { calculateOptimalInterval, getTargetBarsForWidth } from "@/components/charts/time-series-chart/utils";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type EventCluster } from "@/lib/actions/clusters";
import { type ClusterStatsDataPoint } from "@/lib/actions/clusters/stats";
import { useToast } from "@/lib/hooks/use-toast.ts";

import ClusterBreadcrumb from "./cluster-breadcrumb";
import ClusterList from "./cluster-list";
import ClusterStackedChart from "./cluster-stacked-chart";
import { buildPath, buildTree, collectDescendantIds, findNodeById } from "./utils";

export default function ClustersTable() {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const signal = useSignalStoreContext((state) => state.signal);
  const setSelectedClusterIds = useSignalStoreContext((state) => state.setSelectedClusterIds);

  const [rawClusters, setRawClusters] = useState<EventCluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statsData, setStatsData] = useState<ClusterStatsDataPoint[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null);
  const prevDepthRef = useRef(0);
  const [slideClass, setSlideClass] = useState("");

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

  // Current drill-down path from URL
  const clusterPath = searchParams.get("clusterPath") || "";
  const pathIds = useMemo(() => (clusterPath ? clusterPath.split(",") : []), [clusterPath]);
  const drillDownDepth = pathIds.length;

  // Slide animation on level change
  useEffect(() => {
    const goingDeeper = drillDownDepth > prevDepthRef.current;
    prevDepthRef.current = drillDownDepth;

    setSlideClass(goingDeeper ? "translate-x-[60px] opacity-0 duration-0" : "-translate-x-[60px] opacity-0 duration-0");

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSlideClass("translate-x-0 opacity-100 duration-300");
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [drillDownDepth]);

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

  const filteredCountByCluster = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of statsData) {
      counts.set(row.cluster_id, (counts.get(row.cluster_id) ?? 0) + row.count);
    }
    return counts;
  }, [statsData]);

  // Update store with selected cluster IDs for events table filtering
  useEffect(() => {
    if (selectedLeafId) {
      const leafNode = findNodeById(tree, selectedLeafId);
      if (leafNode) {
        setSelectedClusterIds(collectDescendantIds(leafNode));
      }
    } else if (currentNode) {
      setSelectedClusterIds(collectDescendantIds(currentNode));
    } else {
      setSelectedClusterIds([]);
    }
  }, [currentNode, selectedLeafId, tree, setSelectedClusterIds]);

  // Reset leaf selection when navigating to a different level
  useEffect(() => {
    setSelectedLeafId(null);
  }, [pathIds.length]);

  const fetchClusters = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${params.projectId}/signals/${signal.id}/events/clusters`);
      if (!res.ok) {
        const text = (await res.json()) as { error: string };
        throw new Error(text.error);
      }
      const data = (await res.json()) as { items: EventCluster[] };
      setRawClusters(data.items);
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

  // Fetch stats for visible clusters
  useEffect(() => {
    if (visibleClusters.length === 0) {
      setStatsData([]);
      return;
    }

    const pastHours = searchParams.get("pastHours");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!pastHours && !startDate) {
      setStatsData([]);
      return;
    }

    setIsLoadingStats(true);

    const urlParams = new URLSearchParams();
    visibleClusters.forEach((c) => urlParams.append("clusterId", c.id));
    if (pastHours) urlParams.set("pastHours", pastHours);
    if (startDate) urlParams.set("startDate", startDate);
    if (endDate) urlParams.set("endDate", endDate);

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
    urlParams.set("intervalValue", interval.value.toString());
    urlParams.set("intervalUnit", interval.unit);

    fetch(`/api/projects/${params.projectId}/signals/${signal.id}/events/clusters/stats?${urlParams.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch cluster stats");
        return res.json();
      })
      .then((data: { items: ClusterStatsDataPoint[] }) => {
        setStatsData(data.items);
      })
      .catch(() => {
        setStatsData([]);
      })
      .finally(() => {
        setIsLoadingStats(false);
      });
  }, [visibleClusters, searchParams, params.projectId, signal.id, localChartWidth]);

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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-secondary-foreground">All Events</span>
          </div>
          <DateRangeFilter />
        </div>
        <div className="flex border rounded-lg overflow-hidden" style={{ minHeight: 220, maxHeight: 300 }}>
          <div className="min-w-[200px] max-w-[280px] border-r bg-muted/60 overflow-y-auto">
            <div className="flex flex-col gap-0.5 py-2 px-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-muted animate-pulse" />
                  <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm bg-muted/50">
            Loading clusters...
          </div>
        </div>
      </div>
    );
  }

  if (rawClusters.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-lg font-semibold">Clusters</span>
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          <div className="flex flex-col gap-2 items-center max-w-md">
            <h3 className="text-base font-medium text-secondary-foreground">No clusters yet</h3>
            <p className="text-sm text-muted-foreground text-center">
              Clusters group similar events together for easier analysis and it&apos;s performed automatically in the
              background.
            </p>
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

        <div className="flex border rounded-lg overflow-hidden" style={{ maxHeight: 300 }}>
          <ClusterList
            visibleClusters={visibleClusters}
            selectedLeafId={selectedLeafId}
            drillDownDepth={drillDownDepth}
            filteredCountByCluster={filteredCountByCluster}
            slideClass={slideClass}
            onNavigateToCluster={navigateToCluster}
            onToggleLeafSelection={handleToggleLeafSelection}
          />

          <div className="flex-1 p-2 bg-muted/50" ref={chartContainerRef}>
            {isLoadingStats ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Loading chart...
              </div>
            ) : (
              <ClusterStackedChart
                clusters={selectedLeafId ? visibleClusters.filter((c) => c.id === selectedLeafId) : visibleClusters}
                statsData={selectedLeafId ? statsData.filter((d) => d.cluster_id === selectedLeafId) : statsData}
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
