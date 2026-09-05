"use client";

import { Circle } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { type TimeSeriesChartConfig, type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import ClusterIcon, { type IconVariant } from "@/components/signal/clusters-section/cluster-icon";
import { type ClusterStatsDataPoint, type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { UNCLUSTERED_COLOR, withOpacity } from "@/lib/clusters/colors";

const RUN_TOTAL_KEY = "__runTotal";
const OVERLAY_LABEL = "Signal runs";
const OVERLAY_COLOR = "var(--color-surface-350)";

// How much of the cluster colour a bar keeps. The palette is built for flat
// charts and reads hot as a large filled area on a dark surface.
const BAR_OPACITY = 0.6;

// The icicle strip sits directly above the plot and is a hover target of its
// own, so crossing the chart on the way to it must not flash a tooltip.
const TOOLTIP_DELAY_MS = 300;

interface ClusterStackedChartProps {
  clusters: EventCluster[];
  statsData: ClusterStatsDataPoint[];
  containerWidth: number | null;
  colorMap: Map<string, string>;
  runTotals?: { timestamp: string; count: number }[];
  /** Absolutely-positioned content over the plot — the cluster readout. */
  overlay?: ReactNode;
}

export default function ClusterStackedChart({
  clusters,
  statsData,
  containerWidth,
  colorMap,
  runTotals,
  overlay,
}: ClusterStackedChartProps) {
  const overlayPoints = Array.isArray(runTotals) ? runTotals : undefined;
  const hasOverlay = !!overlayPoints && overlayPoints.length > 0;

  const { data, chartConfig, fields } = useMemo(() => {
    const config: TimeSeriesChartConfig = {};
    const fieldKeys: string[] = [];

    const runTotalByTs = new Map<string, number>();
    if (overlayPoints) for (const t of overlayPoints) runTotalByTs.set(t.timestamp, t.count);
    if (hasOverlay)
      config[RUN_TOTAL_KEY] = {
        label: OVERLAY_LABEL,
        color: OVERLAY_COLOR,
        icon: () => <Circle className="size-2.5 text-muted-foreground" />,
      };

    clusters.forEach((cluster) => {
      const key = cluster.id;
      const baseColor = colorMap.get(key) ?? UNCLUSTERED_COLOR;
      const color = withOpacity(baseColor, BAR_OPACITY);
      const iconVariant: IconVariant =
        key === UNCLUSTERED_ID ? "circle-dashed" : cluster.numChildrenClusters > 0 ? "boxes" : "box";
      config[key] = {
        label: cluster.name,
        color,
        stackId: "stack",
        icon: () => <ClusterIcon iconVariant={iconVariant} color={baseColor} />,
      };
      fieldKeys.push(key);
    });

    const timestampMap = new Map<string, Record<string, number>>();
    for (const row of statsData) {
      if (!timestampMap.has(row.timestamp)) timestampMap.set(row.timestamp, {});
      const entry = timestampMap.get(row.timestamp)!;
      entry[row.cluster_id] = typeof row.count === "number" ? row.count : parseInt(String(row.count), 10);
    }

    const chartData: TimeSeriesDataPoint[] = Array.from(timestampMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, counts]) => {
        const point: TimeSeriesDataPoint = { timestamp } as TimeSeriesDataPoint;
        for (const key of fieldKeys) (point as Record<string, unknown>)[key] = counts[key] || 0;
        if (hasOverlay) (point as Record<string, unknown>)[RUN_TOTAL_KEY] = runTotalByTs.get(timestamp) ?? 0;
        return point;
      });

    return { data: chartData, chartConfig: config, fields: fieldKeys };
  }, [clusters, statsData, colorMap, overlayPoints, hasOverlay]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data for selected time range
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <TimeSeriesChart
        data={data}
        chartConfig={chartConfig}
        fields={fields}
        containerWidth={containerWidth}
        showTotal={false}
        tooltipDelay={TOOLTIP_DELAY_MS}
        // Only over the stack itself: recharts' axis tooltip otherwise fires
        // anywhere in the column, including the empty space above the bars.
        tooltipRequireBar
        // On a stack of ~30 buckets × N clusters the entry transition costs more
        // main thread than the animation is worth.
        animate={false}
        hideZeroValues
        overlayField={hasOverlay ? RUN_TOTAL_KEY : undefined}
        overlayColor={OVERLAY_COLOR}
        className="!h-full"
      />
      {overlay}
    </div>
  );
}
