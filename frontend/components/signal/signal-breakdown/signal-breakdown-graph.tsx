"use client";

import { Circle } from "lucide-react";
import { useMemo } from "react";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { type TimeSeriesChartConfig, type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import { type BreakdownStatsPoint } from "@/lib/actions/signal-breakdown";
import { withOpacity } from "@/lib/clusters/colors";

import SignalBreakdownIcon from "./signal-breakdown-icon";
import { type BreakdownNode } from "./types";

const RUN_TOTAL_KEY = "__runTotal";
const OVERLAY_LABEL = "Signal runs";
const OVERLAY_COLOR = "var(--color-surface-300)";

interface Props {
  /** The buckets to draw as stacked series. */
  buckets: BreakdownNode[];
  statsData: BreakdownStatsPoint[];
  containerWidth: number | null;
  showTooltip?: boolean;
  runTotals?: { timestamp: string; count: number }[];
}

export default function SignalBreakdownGraph({ buckets, statsData, containerWidth, showTooltip, runTotals }: Props) {
  const hasOverlay = !!runTotals && runTotals.length > 0;

  const { data, chartConfig, fields } = useMemo(() => {
    const config: TimeSeriesChartConfig = {};
    const fieldKeys: string[] = [];

    const runTotalByTs = new Map<string, number>();
    if (runTotals) for (const t of runTotals) runTotalByTs.set(t.timestamp, t.count);
    if (hasOverlay)
      config[RUN_TOTAL_KEY] = {
        label: OVERLAY_LABEL,
        color: OVERLAY_COLOR,
        icon: () => <Circle className="size-2.5 text-muted-foreground" />,
      };

    buckets.forEach((bucket) => {
      config[bucket.id] = {
        label: bucket.name,
        color: withOpacity(bucket.color, 0.75),
        stackId: "stack",
        icon: () => <SignalBreakdownIcon icon={bucket.icon} />,
      };
      fieldKeys.push(bucket.id);
    });

    const timestampMap = new Map<string, Record<string, number>>();
    for (const row of statsData) {
      if (!timestampMap.has(row.timestamp)) timestampMap.set(row.timestamp, {});
      const entry = timestampMap.get(row.timestamp)!;
      entry[row.bucketId] = typeof row.count === "number" ? row.count : parseInt(String(row.count), 10);
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
  }, [buckets, statsData, runTotals, hasOverlay]);

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
      overlayField={hasOverlay ? RUN_TOTAL_KEY : undefined}
      overlayColor={OVERLAY_COLOR}
      className="!h-full"
    />
  );
}
