"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceArea, XAxis, YAxis } from "recharts";
import { CategoricalChartFunc } from "recharts/types/chart/generateCategoricalChart";

import { numberFormatter, selectNiceTicksFromData } from "@/components/chart-builder/charts/utils";
import {
  chartConfig,
  getTickCountForWidth,
  isValidZoomRange,
  normalizeTimeRange,
} from "@/components/traces/traces-chart/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TracesStatsDataPoint } from "@/lib/actions/traces/stats.ts";

import RoundedBar from "./bar";

interface ChartProps {
  data: TracesStatsDataPoint[];
  containerWidth?: number | null;
}

const countNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

const createDateRangeParams = (searchParams: URLSearchParams, startDate: string, endDate: string) => {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("pastHours");
  params.set("startDate", startDate);
  params.set("endDate", endDate);
  return params;
};

const formatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

const Chart = ({ data, containerWidth }: ChartProps) => {
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

  const maxValue = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return Math.max(...data.map((d) => d.successCount + d.errorCount));
  }, [data]);

  const totalCount = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return data.reduce((sum, d) => sum + d.successCount + d.errorCount, 0);
  }, [data]);

  const zoom = useCallback(() => {
    if (!isValidZoomRange(refArea.left, refArea.right)) {
      setRefArea({});
      return;
    }

    const normalized = normalizeTimeRange(refArea.left!, refArea.right!);
    const params = createDateRangeParams(searchParams, normalized.start, normalized.end);

    router.push(`${pathName}?${params.toString()}`);
    setRefArea({});
  }, [refArea.left, refArea.right, pathName, router, searchParams]);

  const onMouseDown: CategoricalChartFunc = useCallback((e) => {
    if (e && e.activeLabel) {
      setRefArea({ left: e.activeLabel });
    }
  }, []);

  const onMouseMove: CategoricalChartFunc = useCallback(
    (e) => {
      if (refArea.left && e && e.activeLabel) {
        setRefArea({ left: refArea.left, right: e.activeLabel });
      }
    },
    [refArea.left]
  );

  return (
    <div className="flex flex-col items-start">
      <ChartContainer config={chartConfig} className="h-48 w-full">
        <BarChart
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
            tickFormatter={smartTicksResult?.formatter}
            allowDataOverflow
            ticks={smartTicksResult?.ticks}
          />
          <YAxis tickLine={false} axisLine={false} domain={[0, maxValue]} tickFormatter={numberFormatter.format} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelKey="timestamp"
                labelFormatter={(_, payload) =>
                  payload && payload[0]
                    ? formatter.format(new Date(payload[0].payload.timestamp))
                    : "-"
                }
              />
            }
          />
          <Bar dataKey="successCount" fill={chartConfig.successCount.color} stackId="stack" shape={RoundedBar} />
          <Bar dataKey="errorCount" fill={chartConfig.errorCount.color} stackId="stack" shape={RoundedBar} />
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
      <div className="text-xs text-muted-foreground text-center" title={String(totalCount)}>
        Total: {countNumberFormatter.format(totalCount)}
      </div>
    </div>
  );
};

export default Chart;
