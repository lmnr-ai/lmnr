"use client";

import { Circle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { type CategoricalChartFunc } from "recharts/types/chart/generateCategoricalChart";

import { numberFormatter, parseUtcTimestamp, selectNiceTicksFromData } from "@/components/chart-builder/charts/utils";
import RoundedBar from "@/components/charts/time-series-chart/bar";
import { type TimeSeriesChartConfig, type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import {
  getTickCountForWidth,
  isValidZoomRange,
  normalizeTimeRange,
} from "@/components/charts/time-series-chart/utils";
import ClusterIcon, { type IconVariant } from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { type ClusterStatsDataPoint, type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { UNCLUSTERED_COLOR, withOpacity } from "@/lib/clusters/colors";

// Key for the optional "signal runs" overlay line merged into each data point.
const RUN_TOTAL_KEY = "__runTotal";
const OVERLAY_LABEL = "Signal runs";
const OVERLAY_COLOR = "var(--color-surface-300)";

const labelFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

interface ClusterStackedChartProps {
  clusters: EventCluster[];
  statsData: ClusterStatsDataPoint[];
  containerWidth: number | null;
  colorMap: Map<string, string>;
  showTooltip?: boolean;
  // Signal runs per time bucket — when present, drawn as a background line + gradient.
  runTotals?: { timestamp: string; count: number }[];
}

export default function ClusterStackedChart({
  clusters,
  statsData,
  containerWidth,
  colorMap,
  showTooltip,
  runTotals,
}: ClusterStackedChartProps) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const gradientId = useId();
  const [refArea, setRefArea] = useState<{ left?: string; right?: string }>({});

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
  }, [clusters, statsData, colorMap, runTotals, hasOverlay]);

  const smartTicks = useMemo(() => {
    if (data.length === 0) return null;
    const target = containerWidth ? getTickCountForWidth(containerWidth) : 8;
    return selectNiceTicksFromData(
      data.map((d) => d.timestamp),
      target
    );
  }, [data, containerWidth]);

  // Drag-to-zoom the time range (mirrors TimeSeriesChart so the small cluster
  // chart keeps the same interaction as the rest of the platform's charts).
  const zoom = useCallback(() => {
    if (!isValidZoomRange(refArea.left, refArea.right)) {
      setRefArea({});
      return;
    }
    const normalized = normalizeTimeRange(refArea.left!, refArea.right!);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("pastHours");
    params.set("startDate", normalized.start);
    params.set("endDate", normalized.end);
    router.push(`${pathName}?${params.toString()}`);
    setRefArea({});
  }, [refArea.left, refArea.right, pathName, router, searchParams]);

  const onMouseDown: CategoricalChartFunc = useCallback((e) => {
    if (e?.activeLabel != null) setRefArea({ left: String(e.activeLabel) });
  }, []);

  const onMouseMove: CategoricalChartFunc = useCallback(
    (e) => {
      if (refArea.left && e?.activeLabel != null) setRefArea({ left: refArea.left, right: String(e.activeLabel) });
    },
    [refArea.left]
  );

  // recharts' shape prop is loosely typed — `any` mirrors TimeSeriesChart's BarShapeWithConfig.
  const BarShape = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => <RoundedBar {...props} chartConfig={chartConfig} fields={fields} />,
    [chartConfig, fields]
  );

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data for selected time range
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="!h-full w-full">
      <ComposedChart
        data={data}
        margin={{ left: -8, top: 8 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={zoom}
        barCategoryGap={2}
        style={{ userSelect: "none", cursor: "crosshair" }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickLine={false}
          axisLine={false}
          tickFormatter={smartTicks?.formatter}
          allowDataOverflow
          ticks={smartTicks?.ticks}
        />
        <YAxis tickLine={false} axisLine={false} tickFormatter={numberFormatter.format} />
        {hasOverlay && (
          <YAxis
            yAxisId="overlay"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={numberFormatter.format}
          />
        )}
        {hasOverlay && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={OVERLAY_COLOR} stopOpacity={0.6} />
              <stop offset="100%" stopColor={OVERLAY_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        {/* Rendered before the bars so the signal-runs line + gradient sit behind them. */}
        {hasOverlay && (
          <Area
            yAxisId="overlay"
            type="monotone"
            dataKey={RUN_TOTAL_KEY}
            name={OVERLAY_LABEL}
            stroke={OVERLAY_COLOR}
            strokeWidth={1}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        )}
        {showTooltip && (
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelKey="timestamp"
                hideZeroValues
                labelFormatter={(_, payload) =>
                  payload && payload[0] ? labelFormatter.format(parseUtcTimestamp(payload[0].payload.timestamp)) : "-"
                }
              />
            }
          />
        )}
        {fields.map((fieldKey) => {
          const config = chartConfig[fieldKey];
          if (!config) return null;
          return (
            <Bar key={fieldKey} dataKey={fieldKey} fill={config.color} stackId={config.stackId} shape={BarShape} />
          );
        })}
        {refArea.left && refArea.right && (
          <ReferenceArea
            x1={refArea.left}
            x2={refArea.right}
            stroke="hsl(var(--primary))"
            strokeDasharray="5 5"
            strokeOpacity={0.5}
            fill="hsl(var(--primary))"
            fillOpacity={0.3}
          />
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
