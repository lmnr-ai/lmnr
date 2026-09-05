"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  BarStack,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  useYAxisScale,
  XAxis,
  YAxis,
} from "recharts";

import { type CategoricalChartFunc } from "@/components/chart-builder/charts/line-chart";
import { numberFormatter, parseUtcTimestamp, selectNiceTicksFromData } from "@/components/chart-builder/charts/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import { type TimeSeriesChartProps, type TimeSeriesDataPoint } from "./types";
import { getTickCountForWidth, isValidZoomRange, normalizeTimeRange } from "./utils";

const formatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

const countNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

/**
 * `ChartTooltipContent`, held back until the pointer has dwelled on the plot.
 *
 * The delay lives on the content because gating the `<Tooltip>` itself drops the
 * cursor highlight with it, and recharts has no delay of its own. Keyed on
 * `active` alone, not on the hovered bar, so sliding along the axis does not
 * restart it.
 *
 * `requireBar` suppresses the tooltip in the empty space above a stack. Recharts'
 * own `shared={false}` cannot do it — `ComposedChart` only honours axis-triggered
 * tooltips — so the test is geometric: put the stack total through the y scale
 * and compare with the pointer. The overlay series rides a second axis, so its
 * value is not in the bars' units and is left out of the sum.
 */
function DelayedTooltipContent({
  delayMs,
  requireBar,
  overlayField,
  ...props
}: React.ComponentProps<typeof ChartTooltipContent> & {
  delayMs: number;
  requireBar: boolean;
  overlayField?: string;
  // Injected by recharts into whatever it is handed as `content`; not on the
  // Tooltip's own prop type, which is what ChartTooltipContent mirrors.
  coordinate?: { x?: number; y?: number };
}) {
  const yScale = useYAxisScale();
  const { coordinate, payload } = props;

  let overBar = true;
  if (requireBar && yScale && coordinate?.y != null) {
    const total = (payload ?? [])
      .filter((p) => p.dataKey !== overlayField)
      .reduce((sum, p) => sum + (Number(p.value) || 0), 0);
    const top = Number(yScale(total));
    // Fall open rather than shut when the scale gives nothing back: a tooltip
    // that sometimes refuses to appear is worse than an eager one.
    overBar = !Number.isFinite(top) || coordinate.y >= top;
  }

  const open = !!props.active && overBar;
  const [ready, setReady] = useState(false);

  // The reset rides the cleanup rather than an early return, so the effect never
  // sets state synchronously on the way in.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setReady(true), delayMs);
    return () => {
      clearTimeout(timer);
      setReady(false);
    };
  }, [open, delayMs]);

  if (!open || !ready) return null;
  return <ChartTooltipContent {...props} />;
}

export default function TimeSeriesChart<T extends TimeSeriesDataPoint>({
  data,
  chartConfig,
  fields,
  containerWidth,
  onZoom,
  formatValue = numberFormatter.format,
  showTotal = true,
  showTooltip = true,
  tooltipDelay = 0,
  tooltipRequireBar = false,
  animate = true,
  hideZeroValues = false,
  overlayField,
  overlayColor = "var(--color-muted-foreground)",
  className,
}: Omit<TimeSeriesChartProps<T>, "isLoading">) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const gradientId = useId().replace(/:/g, "");
  const [refArea, setRefArea] = useState<{ left?: string; right?: string }>({});

  const targetTickCount = useMemo(() => {
    if (!containerWidth) return 8;
    return getTickCountForWidth(containerWidth);
  }, [containerWidth]);

  const smartTicksResult = useMemo(() => {
    if (!data || data.length === 0) return null;
    const timestamps = data.map((d) => d.timestamp);
    return selectNiceTicksFromData(timestamps, targetTickCount);
  }, [data, targetTickCount]);

  const totalCount = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return data.reduce(
      (sum, dataPoint) =>
        sum +
        Object.entries(dataPoint).reduce((rowSum, [key, value]) => {
          if (key === "timestamp") return rowSum;
          return rowSum + (typeof value === "number" ? value : 0);
        }, 0),
      0
    );
  }, [data]);

  const zoom = useCallback(() => {
    if (!isValidZoomRange(refArea.left, refArea.right)) {
      setRefArea({});
      return;
    }

    const normalized = normalizeTimeRange(refArea.left!, refArea.right!);

    if (onZoom) {
      onZoom(normalized.start, normalized.end);
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("pastHours");
      params.set("startDate", normalized.start);
      params.set("endDate", normalized.end);
      router.push(`${pathName}?${params.toString()}`);
    }

    setRefArea({});
  }, [refArea.left, refArea.right, onZoom, pathName, router, searchParams]);

  const onMouseDown: CategoricalChartFunc = useCallback((e) => {
    if (e?.activeLabel != null) {
      setRefArea({ left: String(e.activeLabel) });
    }
  }, []);

  const onMouseMove: CategoricalChartFunc = useCallback(
    (e) => {
      if (refArea.left && e?.activeLabel != null) {
        setRefArea({ left: refArea.left, right: String(e.activeLabel) });
      }
    },
    [refArea.left]
  );

  const ChartComp = overlayField ? ComposedChart : BarChart;

  const tooltipContentProps: React.ComponentProps<typeof ChartTooltipContent> = {
    labelKey: "timestamp",
    hideZeroValues,
    labelFormatter: (_, payload) =>
      payload && payload[0] ? formatter.format(parseUtcTimestamp(payload[0].payload.timestamp)) : "-",
  };

  return (
    <div className="flex flex-col items-start h-full">
      <ChartContainer config={chartConfig} className={cn("h-48 w-full", className)}>
        <ChartComp
          data={data}
          margin={{ left: 8, right: 8, top: 8, bottom: 4 }}
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
            tickMargin={8}
            tickFormatter={smartTicksResult?.formatter}
            allowDataOverflow
            ticks={smartTicksResult?.ticks}
          />
          <YAxis tickLine={false} axisLine={false} tickFormatter={formatValue} width="auto" />
          {overlayField && (
            <YAxis
              yAxisId="overlay"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width="auto"
              tickFormatter={formatValue}
            />
          )}
          {overlayField && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={overlayColor} stopOpacity={0.6} />
                <stop offset="100%" stopColor={overlayColor} stopOpacity={0} />
              </linearGradient>
            </defs>
          )}
          {overlayField && (
            <Area
              yAxisId="overlay"
              type="monotone"
              dataKey={overlayField}
              stroke={overlayColor}
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
                // Plain content unless one of the gates is asked for: the wrapper
                // costs a state update per hover, which a chart that wants
                // neither should not pay.
                tooltipDelay > 0 || tooltipRequireBar ? (
                  <DelayedTooltipContent
                    delayMs={tooltipDelay}
                    requireBar={tooltipRequireBar}
                    overlayField={overlayField}
                    {...tooltipContentProps}
                  />
                ) : (
                  <ChartTooltipContent {...tooltipContentProps} />
                )
              }
            />
          )}
          <BarStack radius={[4, 4, 4, 4]}>
            {fields.map((fieldKey) => {
              const config = chartConfig[fieldKey];
              if (!config) return null;
              return (
                <Bar
                  key={fieldKey}
                  dataKey={fieldKey}
                  fill={config.color}
                  stackId={config.stackId}
                  isAnimationActive={animate}
                />
              );
            })}
          </BarStack>
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
        </ChartComp>
      </ChartContainer>
      {showTotal && (
        <div className="text-xs text-muted-foreground text-center" title={String(totalCount)}>
          Total: {countNumberFormatter.format(totalCount)}
        </div>
      )}
    </div>
  );
}
