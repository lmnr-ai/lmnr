"use client";

import { type ReactNode, useMemo } from "react";

import CartesianPlot, { type PlotSeries } from "@/components/charts/cartesian-plot";
import { type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import { useChartUrlZoom } from "@/components/charts/use-chart-url-zoom";
import ClusterChartTooltip from "@/components/signal/clusters-section/cluster-chart-tooltip";
import ClusterIcon, { type IconVariant } from "@/components/signal/clusters-section/cluster-icon";
import { useSignalVersionMarkers } from "@/components/signal/hooks/use-signal-version-markers";
import SearchWiderRangeButton from "@/components/ui/date-range-filter/search-wider-range-button";
import { type DateRange } from "@/components/ui/date-range-filter/utils";
import { type ClusterStatsDataPoint } from "@/lib/actions/clusters";
import { type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters/types";
import { UNCLUSTERED_COLOR, withOpacity } from "@/lib/clusters/colors";

// How much of the cluster colour a bar keeps. The palette is built for flat
// charts and reads hot as a large filled area on a dark surface.
const BAR_OPACITY = 0.6;

interface ClusterStackedChartProps {
  clusters: EventCluster[];
  statsData: ClusterStatsDataPoint[];
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
  colorMap,
  overlay,
  pastHours,
  startDate,
  endDate,
  onSelectRange,
  showSearchWiderRange,
}: ClusterStackedChartProps) {
  const markers = useSignalVersionMarkers();
  const onRangeSelect = useChartUrlZoom();

  const { data, series } = useMemo(() => {
    const plotSeries: PlotSeries[] = [];
    const fieldKeys: string[] = [];

    clusters.forEach((cluster) => {
      const key = cluster.id;
      const baseColor = colorMap.get(key) ?? UNCLUSTERED_COLOR;
      const color = withOpacity(baseColor, BAR_OPACITY);
      const iconVariant: IconVariant =
        key === UNCLUSTERED_ID ? "circle-dashed" : cluster.numChildrenClusters > 0 ? "boxes" : "box";
      plotSeries.push({
        key,
        label: cluster.name,
        color,
        icon: <ClusterIcon iconVariant={iconVariant} color={baseColor} />,
      });
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

    return { data: chartData, series: plotSeries };
  }, [clusters, statsData, colorMap]);

  // Row count is not emptiness: the stats query fills the range, so a window with
  // no events still comes back as a full set of zero buckets and would otherwise
  // render as an axis with nothing on it.
  const isEmpty = data.every((point) => series.every((item) => !(point as Record<string, unknown>)[item.key]));

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
      <CartesianPlot
        kind="bar"
        data={data}
        x="timestamp"
        series={series}
        markers={markers}
        tooltip={ClusterChartTooltip}
        onRangeSelect={onRangeSelect}
        className="h-full"
      />
      {overlay}
    </div>
  );
}
