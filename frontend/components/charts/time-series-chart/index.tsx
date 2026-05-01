"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceArea, XAxis, YAxis } from "recharts";

import { type CategoricalChartFunc } from "@/components/chart-builder/charts/line-chart";
import { numberFormatter, parseUtcTimestamp, selectNiceTicksFromData } from "@/components/chart-builder/charts/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import RoundedBar from "./bar";
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

export default function TimeSeriesChart<T extends TimeSeriesDataPoint>({
  data,
  chartConfig,
  fields,
  containerWidth,
  onZoom,
  formatValue = numberFormatter.format,
  showTotal = true,
  className,
}: Omit<TimeSeriesChartProps<T>, "isLoading">) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
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

  const BarShapeWithConfig = useCallback(
    (props: any) => <RoundedBar {...props} chartConfig={chartConfig} fields={fields} />,
    [chartConfig, fields]
  );

  return (
    <div className="flex flex-col items-start h-full">
      <ChartContainer config={chartConfig} className={cn("h-48 w-full", className)}>
        <BarChart
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
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelKey="timestamp"
                labelFormatter={(_, payload) =>
                  payload && payload[0] ? formatter.format(parseUtcTimestamp(payload[0].payload.timestamp)) : "-"
                }
              />
            }
          />
          {fields.map((fieldKey) => {
            const config = chartConfig[fieldKey];
            if (!config) return null;

            return (
              <Bar
                key={fieldKey}
                dataKey={fieldKey}
                fill={config.color}
                stackId={config.stackId}
                shape={BarShapeWithConfig}
              />
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
        </BarChart>
      </ChartContainer>
      {showTotal && (
        <div className="text-xs text-muted-foreground text-center" title={String(totalCount)}>
          Total: {countNumberFormatter.format(totalCount)}
        </div>
      )}
    </div>
  );
}
