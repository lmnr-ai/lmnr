"use client";

import { isEmpty } from "lodash";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { shallow } from "zustand/shallow";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import EmergingClusterBreadcrumbs from "@/components/signal/emerging-cluster-breadcrumbs";
import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import { getChartClusters, useSignalStoreContext } from "@/components/signal/store.tsx";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProjectContext } from "@/contexts/project-context";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { getClusterColorById, UNCLUSTERED_COLOR } from "@/lib/clusters/colors";
import { getHasClusteringAccess } from "@/lib/features/clustering";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

import ClusterBreadcrumbs from "./cluster-breadcrumbs";
import ClusterIcicle from "./cluster-icicle";
import ClusterReadout from "./cluster-readout";
import ClusterStackedChart from "./cluster-stacked-chart";
import { buildClusterModel } from "./model";

interface Props {
  className?: string;
}

export default function ClustersSection({ className }: Props) {
  const { workspace, settingsHref } = useProjectContext();
  const isPaywall = !getHasClusteringAccess(workspace?.tierName);
  const billingHref = settingsHref("billing");
  const searchParams = useSearchParams();
  const [clusterId, setClusterId] = useClusterId();
  const [emergingClusterId, setEmergingClusterId] = useEmergingClusterId();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const isClustersLoading = useSignalStoreContext((state) => state.isClustersLoading);
  const clusterStatsData = useSignalStoreContext((state) => state.clusterStatsData);
  const isClusterStatsLoading = useSignalStoreContext((state) => state.isClusterStatsLoading);
  const rawClusters = useSignalStoreContext((state) => state.rawClusters);
  const signal = useSignalStoreContext((state) => state.signal);
  const fetchClusters = useSignalStoreContext((state) => state.fetchClusters);
  const fetchClusterStats = useSignalStoreContext((state) => state.fetchClusterStats);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const chartClusters = useSignalStoreContext((state) => getChartClusters(state, clusterId), shallow);

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

  // Skeleton only on first load; a refresh keeps the old chart until new data arrives.
  const showSkeleton = isClustersLoading && isEmpty(rawClusters);

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
  }, [showSkeleton]);

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${signal.projectId}/signals/${signal.id}/events/clusters/stats`,
    chartContainerWidth: localChartWidth,
    pastHours,
    startDate,
    endDate,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetchClusterStats({
      statsUrl,
      abortSignal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [statsUrl, fetchClusterStats, rawClusters]);

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

  // The one way anything in the section changes the selection. No-op when
  // paywalled — drilling is a Pro feature.
  const selectCluster = useCallback(
    (id: string) => {
      if (isPaywall) return;
      track("signals", "cluster_clicked", {
        clusterId: id === UNCLUSTERED_ID ? "-" : id,
      });
      // Picking anything in the cluster tree exits the emerging-cluster view —
      // otherwise the events fetcher would keep filtering to the L0 cluster
      // (it prioritizes emergingClusterId over clusterId/unclustered).
      setEmergingClusterId(null);
      setClusterId(clusterId === id ? null : id);
    },
    [isPaywall, setClusterId, setEmergingClusterId, clusterId]
  );

  // The card is memoised as an ELEMENT, not wrapped in `React.memo`: hover state
  // lives here, and the chart is a recharts stack of ~30 buckets × N clusters, so
  // one pointer move over a band otherwise re-commits the whole thing. An
  // identical element object is React's own bail-out signal.
  //
  // Nothing to do with hover may be in these deps.
  const card = useMemo(
    () => (
      <div className="h-full" ref={chartContainerRef}>
        {isClusterStatsLoading && (isEmpty(chartClusters) || isEmpty(clusterStatsData)) ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading chart...</div>
        ) : (
          <ClusterStackedChart
            clusters={chartClusters}
            statsData={clusterStatsData}
            containerWidth={localChartWidth}
            colorMap={colorMap}
            showTooltip={!isPaywall}
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
    ),
    [
      isClusterStatsLoading,
      chartClusters,
      clusterStatsData,
      localChartWidth,
      colorMap,
      isPaywall,
      runTotals,
      model,
      clusterId,
      selectCluster,
    ]
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("relative flex w-full min-w-0 flex-col", className)}>
        {/* The strip and the trail read as one block above the chart, which is
            why the gap between them is looser than the one under it. */}
        <div className="mb-2 flex w-full shrink-0 flex-col gap-4">
          {model && (
            <ClusterIcicle
              tree={model.tree}
              ancestors={model.ancestors}
              selectedId={clusterId}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelect={selectCluster}
            />
          )}
          {emergingClusterId ? <EmergingClusterBreadcrumbs /> : <ClusterBreadcrumbs />}
        </div>

        {/* Unwrapped: no border, no surface fill, no padding, so the chart reads
            as part of the page rather than a card sitting on it. */}
        <div className="h-[240px] min-h-[240px] max-h-[240px] w-full overflow-hidden">
          {showSkeleton ? (
            <div className="flex h-full items-center justify-center">
              <span className="shimmer text-sm text-muted-foreground duration-[2s]">Loading clusters</span>
            </div>
          ) : (
            card
          )}
        </div>

        {isPaywall && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 px-3 py-2 rounded-md border bg-background">
            <span className="text-xs text-muted-foreground flex-1 min-w-0">Event clusters for high-level insights</span>
            <Link href={billingHref}>
              <Button size="sm">Upgrade to Pro</Button>
            </Link>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
