"use client";

import { useMemo } from "react";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { type TimeSeriesChartConfig, type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import ClusterIcon, { type IconVariant } from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { type ClusterStatsDataPoint, type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { UNCLUSTERED_COLOR, withOpacity } from "@/lib/clusters/colors";

interface ClusterStackedChartProps {
  clusters: EventCluster[];
  statsData: ClusterStatsDataPoint[];
  containerWidth: number | null;
  colorMap: Map<string, string>;
  showTooltip?: boolean;
}

export default function ClusterStackedChart({
  clusters,
  statsData,
  containerWidth,
  colorMap,
  showTooltip,
}: ClusterStackedChartProps) {
  const { data, chartConfig, fields } = useMemo(() => {
    const config: TimeSeriesChartConfig = {};
    const fieldKeys: string[] = [];

    clusters.forEach((cluster) => {
      const key = cluster.id;
      const baseColor = colorMap.get(key) ?? UNCLUSTERED_COLOR;
      const color = withOpacity(baseColor, 0.75);
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

    // Group stats by timestamp
    const timestampMap = new Map<string, Record<string, number>>();
    for (const row of statsData) {
      if (!timestampMap.has(row.timestamp)) {
        timestampMap.set(row.timestamp, {});
      }
      const entry = timestampMap.get(row.timestamp)!;
      entry[row.cluster_id] = typeof row.count === "number" ? row.count : parseInt(String(row.count), 10);
    }

    // Build chart data points
    const chartData: TimeSeriesDataPoint[] = Array.from(timestampMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, counts]) => {
        const point: TimeSeriesDataPoint = { timestamp } as TimeSeriesDataPoint;
        for (const key of fieldKeys) {
          (point as Record<string, unknown>)[key] = counts[key] || 0;
        }
        return point;
      });

    return { data: chartData, chartConfig: config, fields: fieldKeys };
  }, [clusters, statsData, colorMap]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data for selected time range
      </div>
    );
  }

  return (
    <TimeSeriesChart
      data={data}
      chartConfig={chartConfig}
      fields={fields}
      containerWidth={containerWidth}
      showTotal={false}
      showTooltip={showTooltip}
      hideZeroValues
      className="!h-full"
    />
  );
}
