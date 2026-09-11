"use client";

import { type ReactNode, useMemo } from "react";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { type TimeSeriesChartConfig, type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import ClusterIcon, { type IconVariant } from "@/components/signal/clusters-section/cluster-icon";
import { useSignalVersionMarkers } from "@/components/signal/hooks/use-signal-version-markers";
import SearchWiderRangeButton from "@/components/ui/date-range-filter/search-wider-range-button";
import { type DateRange } from "@/components/ui/date-range-filter/utils";
import { type ClusterStatsDataPoint, type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { UNCLUSTERED_COLOR, withOpacity } from "@/lib/clusters/colors";

// How much of the cluster colour a bar keeps. The palette is built for flat
// charts and reads hot as a large filled area on a dark surface.
const BAR_OPACITY = 0.6;

// The icicle strip sits directly above the plot and is a hover target of its
// own, so crossing the chart on the way to it must not flash a tooltip.
const TOOLTIP_DELAY_MS = 300;

// A signal can have a hundred top-level clusters, and the tooltip lists one row
// per series. Uncapped it grows taller than the window, so only the largest
// contributors to the hovered bucket are named.
const TOOLTIP_MAX_ITEMS = 12;

interface ClusterStackedChartProps {
  clusters: EventCluster[];
  statsData: ClusterStatsDataPoint[];
  containerWidth: number | null;
  colorMap: Map<string, string>;
  /** Absolutely-positioned content over the plot — the cluster readout. */
  overlay?: ReactNode;
  pastHours?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  onSelectRange: (range: DateRange) => void;
  showSearchWiderRange: boolean;
}

export default function ClusterStackedChart({
  clusters,
  statsData,
  containerWidth,
  colorMap,
  overlay,
  pastHours,
  startDate,
  endDate,
  onSelectRange,
  showSearchWiderRange,
}: ClusterStackedChartProps) {
  const markers = useSignalVersionMarkers();

  const { data, chartConfig, fields } = useMemo(() => {
    const config: TimeSeriesChartConfig = {};
    const fieldKeys: string[] = [];

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
        return point;
      });

    return { data: chartData, chartConfig: config, fields: fieldKeys };
  }, [clusters, statsData, colorMap]);

  // Row count is not emptiness: the stats query fills the range, so a window with
  // no events still comes back as a full set of zero buckets and would otherwise
  // render as an axis with nothing on it.
  const isEmpty = data.every((point) => fields.every((key) => !(point as Record<string, unknown>)[key]));

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground text-sm">
        <span>No data for selected time range</span>
        {showSearchWiderRange && (
          <SearchWiderRangeButton
            pastHours={pastHours}
            startDate={startDate}
            endDate={endDate}
            onSelect={onSelectRange}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full pt-12">
      <TimeSeriesChart
        data={data}
        chartConfig={chartConfig}
        fields={fields}
        containerWidth={containerWidth}
        markers={markers}
        showTotal={false}
        tooltipDelay={TOOLTIP_DELAY_MS}
        tooltipMaxItems={TOOLTIP_MAX_ITEMS}
        // Only over the stack itself: recharts' axis tooltip otherwise fires
        // anywhere in the column, including the empty space above the bars.
        tooltipRequireBar
        // On a stack of ~30 buckets × N clusters the entry transition costs more
        // main thread than the animation is worth.
        animate={false}
        hideZeroValues
        className="!h-full !w-full"
      />
      {overlay}
    </div>
  );
}
