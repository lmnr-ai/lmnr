"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { numberFormatter, selectNiceTicksFromData } from "@/components/chart-builder/charts/utils";
import RoundedBar from "@/components/charts/time-series-chart/bar";
import { type TimeSeriesChartConfig, type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import { getTickCountForWidth } from "@/components/charts/time-series-chart/utils";
import { ChartContainer } from "@/components/ui/chart";
import { type ClusterStatsDataPoint, type EventCluster } from "@/lib/actions/clusters";
import { withOpacity } from "@/lib/clusters/colors";

// Landing copy of components/signal/clusters-section/cluster-stacked-chart and
// the TimeSeriesChart under it, condensed into one file. Duplicated rather than
// reused because this chart STREAMS ITS OWN BARS: the axis is pinned so it can't
// rescale as the counts climb, and Recharts' enter tween is off so it doesn't
// animate on top of values ../has-this-issue is already driving frame by frame.
// Zoom, tooltip, the run-total overlay and the total row are all dropped — this
// is a picture, not an instrument. Everything it imports is read-only.

/** Bars carry the cluster's colour at this alpha, as the product's do. */
const BAR_ALPHA = 0.75;

interface Props {
  clusters: EventCluster[];
  statsData: ClusterStatsDataPoint[];
  containerWidth: number | null;
  colorMap: Map<string, string>;
  /** Pins the y domain so the axis doesn't step up while bars stream in. */
  yAxisMax?: number;
}

const ClustersChart = ({ clusters, statsData, containerWidth, colorMap, yAxisMax }: Props) => {
  const { data, chartConfig, fields } = useMemo(() => {
    const config: TimeSeriesChartConfig = {};
    const fieldKeys: string[] = [];

    clusters.forEach((cluster) => {
      const base = colorMap.get(cluster.id);
      if (!base) return;
      config[cluster.id] = { label: cluster.name, color: withOpacity(base, BAR_ALPHA), stackId: "stack" };
      fieldKeys.push(cluster.id);
    });

    const byTimestamp = new Map<string, Record<string, number>>();
    for (const row of statsData) {
      if (!byTimestamp.has(row.timestamp)) byTimestamp.set(row.timestamp, {});
      const entry = byTimestamp.get(row.timestamp)!;
      entry[row.cluster_id] = typeof row.count === "number" ? row.count : parseInt(String(row.count), 10);
    }

    const chartData: TimeSeriesDataPoint[] = Array.from(byTimestamp.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, counts]) => {
        const point = { timestamp } as TimeSeriesDataPoint;
        for (const key of fieldKeys) (point as Record<string, unknown>)[key] = counts[key] || 0;
        return point;
      });

    return { data: chartData, chartConfig: config, fields: fieldKeys };
  }, [clusters, statsData, colorMap]);

  const ticks = useMemo(() => {
    if (data.length === 0) return null;
    return selectNiceTicksFromData(
      data.map((d) => d.timestamp),
      containerWidth ? getTickCountForWidth(containerWidth) : 8
    );
  }, [data, containerWidth]);

  if (data.length === 0) return null;

  return (
    <div className="flex flex-col items-start h-full">
      <ChartContainer config={chartConfig} className="h-48 w-full !h-full">
        <BarChart data={data} margin={{ left: -8, top: 8 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            tickFormatter={ticks?.formatter}
            allowDataOverflow
            ticks={ticks?.ticks}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={numberFormatter.format}
            domain={yAxisMax != null ? [0, yAxisMax] : undefined}
          />
          {fields.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              fill={chartConfig[key]?.color}
              stackId={chartConfig[key]?.stackId}
              shape={(props: object) => <RoundedBar {...props} chartConfig={chartConfig} fields={fields} />}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export default ClustersChart;
