"use client";

import { useMemo } from "react";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { type TimeSeriesChartConfig, type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import { type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { type ClusterStatsDataPoint } from "@/lib/actions/clusters/stats";

import { getClusterColor, UNCLUSTERED_COLOR, withOpacity } from "./colors";

interface ClusterStackedChartProps {
  clusters: EventCluster[];
  statsData: ClusterStatsDataPoint[];
  containerWidth: number | null;
  depthLevel?: number;
  colorIndexOffset?: number;
}

export default function ClusterStackedChart({
  clusters,
  statsData,
  containerWidth,
  depthLevel = 0,
  colorIndexOffset = 0,
}: ClusterStackedChartProps) {
  const { data, chartConfig, fields } = useMemo(() => {
    const config: TimeSeriesChartConfig = {};
    const fieldKeys: string[] = [];

    clusters.forEach((cluster, index) => {
      const key = cluster.id;
      const color =
        cluster.id === UNCLUSTERED_ID
          ? withOpacity(UNCLUSTERED_COLOR, 0.5)
          : withOpacity(getClusterColor(index + colorIndexOffset, depthLevel), 0.75);
      config[key] = {
        label: cluster.name,
        color,
        stackId: "stack",
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
  }, [clusters, statsData, depthLevel, colorIndexOffset]);

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
      className="!h-full"
    />
  );
}
