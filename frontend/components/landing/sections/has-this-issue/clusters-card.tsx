"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ClusterBreadcrumb from "@/components/signal/clusters-section/cluster-breadcrumb";
import { buildPath, type ClusterNode, findNodeById } from "@/components/signal/clusters-section/utils";
import { getClusterColorById } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import { SIGNAL_CLUSTER_EVENT_COUNT, SIGNAL_CLUSTER_ID } from "../signal-cluster";
import ClusterList from "./cluster-list";
import ClustersChart from "./clusters-chart";
import { MOCK_DATASETS } from "./clusters-mock-data";
import { useTicker } from "./use-ticker";

// Each bucket starts arriving BUCKET_MS after the one before it and then takes
// GROW_BUCKETS bucket-intervals to grow to full height, so several bars are
// always mid-growth. TICKS_PER_BUCKET sets the sampling rate — it bounds the
// render count independently of the display's refresh rate.
const BUCKET_MS = 34;
const TICKS_PER_BUCKET = 2;
const GROW_BUCKETS = 2.5;

const DATASET = MOCK_DATASETS["detect-failures"];
const BUCKET_COUNT = new Set(DATASET.stats.map((row) => row.timestamp)).size;
const TOTAL_TICKS = Math.ceil((BUCKET_COUNT + GROW_BUCKETS) * TICKS_PER_BUCKET);

/** Wall-clock length of the bar stream-in. The stage schedules around it. */
export const CLUSTER_FILL_MS = (TOTAL_TICKS * BUCKET_MS) / TICKS_PER_BUCKET;

/** Top-level clusters, which the stage reveals one at a time. */
export const CLUSTER_COUNT = DATASET.clusterTree.length;

/** Card's fixed outer width per layout. `row` is the product's proportions, for
 *  mobile; `column` exists because the desktop trace-view frame is 480 wide,
 *  where a side-by-side list and chart would both be too narrow to read. */
export const CLUSTERS_CARD_W = 720;
export const CLUSTERS_CARD_COL_W = 440;

// Column layout only, and it is the CHART SUB-CARD's height including borders.
// The list is deliberately NOT sized: it hugs its rows, so the card grows as
// clusters are revealed. The row layout uses the container's `h-[230px]`.
const COL_CHART_CARD_H = 190;

// Decelerate into the final height.
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

// Round a peak up to a readable axis bound (38 -> 40, 412 -> 450).
const niceCeil = (n: number) => {
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(n, 1)))) / 2;
  return Math.max(1, Math.ceil(n / step) * step);
};

interface Props {
  /** Gate the bar stream-in — the stage arms it as the last beat. */
  armed: boolean;
  /** The signal-event pill has landed: SIGNAL_CLUSTER_ID gains one event. */
  entered: boolean;
  /** Row currently acknowledging that landing with a pulse. */
  pulsingClusterId: string | null;
  pulseMs: number;
  /** How many clusters have been discovered so far — see ./cluster-list. */
  revealedCount: number;
  revealMs: number;
  /** List beside the chart (the product's layout) or above it. */
  layout?: "row" | "column";
  className?: string;
}

// Cluster card mirroring the production clusters section visual (bg-secondary
// inner card on a bg-background wrapper) — list + stacked chart, no
// breadcrumb/events. Drill-down works just like the real one.
const ClustersCard = ({
  armed,
  entered,
  pulsingClusterId,
  pulseMs,
  revealedCount,
  revealMs,
  layout = "row",
  className,
}: Props) => {
  const isColumn = layout === "column";
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  // `share[i]` is bucket i's fraction of the whole window's event volume, so the
  // list counts can be summed from the same per-bucket growth the chart draws.
  const { buckets, bucketIndex, share } = useMemo(() => {
    const totalByBucket = new Map<string, number>();
    for (const row of DATASET.stats) {
      const count = typeof row.count === "number" ? row.count : parseInt(String(row.count), 10);
      totalByBucket.set(row.timestamp, (totalByBucket.get(row.timestamp) ?? 0) + count);
    }
    const sorted = [...totalByBucket.keys()].sort();
    const index = new Map(sorted.map((ts, i) => [ts, i]));
    const grand = sorted.reduce((sum, ts) => sum + (totalByBucket.get(ts) ?? 0), 0);
    const shares = sorted.map((ts) => (grand > 0 ? (totalByBucket.get(ts) ?? 0) / grand : 0));
    return { buckets: sorted, bucketIndex: index, share: shares };
  }, []);

  const tick = useTicker(armed, { steps: TOTAL_TICKS, stepMs: BUCKET_MS / TICKS_PER_BUCKET });
  const isStreaming = tick < TOTAL_TICKS;

  // Leading edge of the stream, in bucket units. Bucket i grows from 0 to full
  // as the head travels from i to i + GROW_BUCKETS.
  const growthByBucket = useMemo(() => {
    if (!isStreaming) return null;
    const head = tick / TICKS_PER_BUCKET;
    return buckets.map((_, i) => easeOut(Math.min(Math.max((head - i) / GROW_BUCKETS, 0), 1)));
  }, [buckets, tick, isStreaming]);

  // Scale each bucket rather than dropping the not-yet-arrived rows, so the
  // x-axis keeps all its categories and the bars don't resize as data lands.
  const streamedStats = useMemo(() => {
    if (!growthByBucket) return DATASET.stats;
    return DATASET.stats.map((row) => {
      const grown = growthByBucket[bucketIndex.get(row.timestamp) ?? 0] ?? 1;
      const count = typeof row.count === "number" ? row.count : parseInt(String(row.count), 10);
      return { ...row, count: count * grown };
    });
  }, [bucketIndex, growthByBucket]);

  // Same curve the chart is drawing, collapsed to a single 0-1 factor.
  const fill = useMemo(() => {
    if (!growthByBucket) return 1;
    return share.reduce((sum, s, i) => sum + s * growthByBucket[i], 0);
  }, [share, growthByBucket]);

  const currentNode = useMemo(
    () => (selectedClusterId ? findNodeById(DATASET.clusterTree, selectedClusterId) : null),
    [selectedClusterId]
  );
  const isLeaf = currentNode !== null && currentNode.children.length === 0;
  const displayId = isLeaf ? (currentNode?.parentId ?? null) : selectedClusterId;
  const displayNode = useMemo(() => (displayId ? findNodeById(DATASET.clusterTree, displayId) : null), [displayId]);

  const visibleClusters: ClusterNode[] = displayNode ? displayNode.children : DATASET.clusterTree;
  const drillDownDepth = displayNode ? displayNode.level + 1 : 0;

  const filteredCountByCluster = useMemo(() => {
    const m = new Map<string, number>();
    // The landed pill brings its WHOLE cluster in, not one event — it is the
    // same count the pill's own badge shows and the same number of cards that
    // collapsed into it one section above, so a 1 here contradicts both. Only
    // the count moves; five against a few hundred is invisible in the chart.
    for (const c of visibleClusters) {
      const landed = entered && c.id === SIGNAL_CLUSTER_ID ? SIGNAL_CLUSTER_EVENT_COUNT : 0;
      m.set(c.id, Math.round(c.numEvents * fill) + landed);
    }
    return m;
  }, [visibleClusters, fill, entered]);

  const chartClusters: ClusterNode[] = useMemo(() => {
    if (currentNode && currentNode.children.length === 0) return [currentNode];
    return displayNode ? displayNode.children : DATASET.clusterTree;
  }, [currentNode, displayNode]);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    visibleClusters.forEach((c) => m.set(c.id, getClusterColorById(c.id)));
    return m;
  }, [visibleClusters]);

  const navigateToCluster = useCallback(
    (id: string) => {
      if (id === selectedClusterId && isLeaf) setSelectedClusterId(displayId);
      else setSelectedClusterId(id);
    },
    [selectedClusterId, isLeaf, displayId]
  );

  const breadcrumb = useMemo(
    () => (selectedClusterId ? buildPath(DATASET.clusterTree, selectedClusterId) : []),
    [selectedClusterId]
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (index < 0) setSelectedClusterId(null);
      else setSelectedClusterId(breadcrumb[index].id);
    },
    [breadcrumb]
  );

  // Pinned from the final data so the axis doesn't step up while bars stream in.
  const yAxisMax = useMemo(() => {
    const ids = new Set(chartClusters.map((c) => c.id));
    const totals = new Map<string, number>();
    for (const row of DATASET.stats) {
      if (!ids.has(row.cluster_id)) continue;
      const count = typeof row.count === "number" ? row.count : parseInt(String(row.count), 10);
      totals.set(row.timestamp, (totals.get(row.timestamp) ?? 0) + count);
    }
    return niceCeil(Math.max(1, ...totals.values()));
  }, [chartClusters]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    ro.observe(chartContainerRef.current);
    return () => ro.disconnect();
  }, []);

  const list = (
    <ClusterList
      // No right border in the column layout: there is nothing to its right to
      // divide it from, and it would draw a stray line down the card's edge.
      className={cn("w-full bg-transparent", isColumn ? "border-r-0" : "h-full")}
      drillDownDepth={drillDownDepth}
      filteredCountByCluster={filteredCountByCluster}
      visibleClusters={visibleClusters}
      selectedClusterId={selectedClusterId}
      onNavigateToCluster={navigateToCluster}
      rangeTotal={DATASET.totalEventCount}
      pulsingClusterId={pulsingClusterId}
      pulseMs={pulseMs}
      revealedCount={revealedCount}
      revealMs={revealMs}
    />
  );

  // No height of its own in the column layout — the sub-card below sets one and
  // flex's default stretch fills it.
  const chart = (
    <div className="flex-1 min-w-0 py-2 pr-2 pl-1 bg-secondary" ref={chartContainerRef}>
      <ClustersChart
        clusters={chartClusters}
        statsData={streamedStats}
        containerWidth={chartWidth}
        colorMap={colorMap}
        yAxisMax={yAxisMax}
      />
    </div>
  );

  // One card, two sub-cards inside it: the row layout's single bordered box
  // split into a list box above a chart box. The list box is UNCONSTRAINED — it
  // grows with each cluster the stage reveals, which is the point. Capping it
  // would put a scrollbar over a five-row list.
  if (isColumn) {
    return (
      <div
        style={{ width: CLUSTERS_CARD_COL_W }}
        className={cn("rounded-lg border bg-background p-3 flex flex-col gap-2", className)}
      >
        <ClusterBreadcrumb
          breadcrumb={breadcrumb}
          selectedClusterId={selectedClusterId}
          onNavigateToBreadcrumb={navigateToBreadcrumb}
        />
        <div className="rounded-md border bg-secondary overflow-hidden">{list}</div>
        <div style={{ height: COL_CHART_CARD_H }} className="flex rounded-md border bg-secondary overflow-hidden">
          {chart}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ width: CLUSTERS_CARD_W }}
      className={cn("rounded-lg border bg-background p-3 flex flex-col gap-2", className)}
    >
      <ClusterBreadcrumb
        breadcrumb={breadcrumb}
        selectedClusterId={selectedClusterId}
        onNavigateToBreadcrumb={navigateToBreadcrumb}
      />
      <div className="flex h-[230px] rounded-md border bg-secondary overflow-hidden">
        <div className="w-[250px] md:w-[300px] shrink-0 overflow-hidden">{list}</div>
        {chart}
      </div>
    </div>
  );
};

export default ClustersCard;
