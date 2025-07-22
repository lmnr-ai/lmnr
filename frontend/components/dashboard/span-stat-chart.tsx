import React, { memo, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import useSWR from "swr";

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import {
  AggregationFunction,
  aggregationLabelMap,
  MetricTimeValue,
  SpanMetric,
  SpanMetricGroupBy,
  SpanMetricType,
} from "@/lib/clickhouse/types";
import { cn, formatTimestamp, formatTimestampWithInterval, swrFetcher } from "@/lib/utils";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import LineChart, { ChartProps } from "./line-chart";

const xAxisKey = "timestamp";

interface SpanStatChartProps {
  title: string;
  projectId: string;
  metric: SpanMetric;
  groupBy: SpanMetricGroupBy;
  pastHours: string;
  startDate: string;
  endDate: string;
  groupByInterval: GroupByInterval;
  defaultAggregation: AggregationFunction;
  className?: string;
  stackChart?: boolean;
}

const SpanStatChart = memo<SpanStatChartProps>(
  ({
    className,
    metric,
    defaultAggregation,
    groupBy,
    title,
    pastHours,
    startDate,
    endDate,
    groupByInterval,
    projectId,
    stackChart,
  }) => {
    const [aggregation, setAggregation] = useState<AggregationFunction>(defaultAggregation);

    const params = useMemo(() => {
      if (!pastHours && !startDate && !endDate) {
        return null;
      }

      const queryParams: Record<string, any> = {
        metric,
        aggregation,
        groupByInterval,
        groupBy,
      };

      if (pastHours) {
        queryParams["pastHours"] = pastHours;
      } else {
        queryParams["startDate"] = startDate;
        queryParams["endDate"] = endDate;
      }

      return queryParams;
    }, [metric, aggregation, groupByInterval, groupBy, pastHours, startDate, endDate]);

    const queryString = useMemo(() => (params ? new URLSearchParams(params).toString() : null), [params]);

    const { data: rawData, isLoading } = useSWR<MetricTimeValue<SpanMetricType>[]>(
      queryString ? `/api/projects/${projectId}/spans/metrics/time?${queryString}` : null,
      swrFetcher
    );

    const { data, keys } = useMemo(() => {
      if (!rawData) {
        return { data: null, keys: new Set<string>() };
      }

      const keys = new Set(rawData.flatMap((d) => Object.keys(d.value).filter((k) => k !== "timestamp")));
      const processedData = rawData.map((d) => ({
        ...Object.fromEntries(Array.from(keys).map((k) => [k, 0])),
        ...d.value,
        [xAxisKey]: d.time,
      }));

      return { data: processedData, keys };
    }, [rawData]);

    const chartConfig = useMemo(
      () =>
        Object.fromEntries(
          Array.from(keys).map((key, index) => [
            key,
            {
              color: `hsl(var(--chart-${(index % 5) + 1}))`,
              label: key,
            },
          ])
        ) satisfies ChartConfig,
      [keys]
    );

    return (
      <div className={cn("flex flex-col space-y-2 border rounded-lg p-4 h-full border-dashed border-border")}>
        <div className="flex-none flex items-center space-x-2">
          <div className="flex space-x-2 justify-between text-sm font-medium items-center">
            <div className="flex-grow text-secondary-foreground">{title}</div>
            <div className="flex-none">
              <Select value={aggregation} onValueChange={(value) => setAggregation(value as AggregationFunction)}>
                <SelectTrigger className="flex-none text-xs px-2 h-6">
                  <SelectValue placeholder="Select aggregation" className="m-0" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.values(AggregationFunction) as AggregationFunction[]).map((agg) => (
                    <SelectItem key={agg} value={agg} className="text-xs">
                      {aggregationLabelMap[agg]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex-1">
          {isLoading || data === null ? (
            <Skeleton className="h-full w-full" />
          ) : stackChart ? (
            <StackedBarChart
              data={data}
              keys={keys}
              xAxisKey={xAxisKey}
              chartConfig={chartConfig}
              groupByInterval={groupByInterval}
            />
          ) : (
            <LineChart
              data={data}
              keys={keys}
              xAxisKey={xAxisKey}
              chartConfig={chartConfig}
              groupByInterval={groupByInterval}
            />
          )}
        </div>
      </div>
    );
  }
);

SpanStatChart.displayName = "SpanStatChart";

const StackedBarChart = memo<ChartProps>(({ data, keys, xAxisKey, chartConfig, groupByInterval }) => {
  // Ideally, we don't need to calculate this, and should be able to pass
  // `domain=['dataMin', 'dataMax']` to the YAxis, but it doesn't work.
  const dataMax = useMemo(
    () =>
      Math.max(
        ...data.map((d) =>
          Object.entries(d)
            .filter(([key]) => key !== xAxisKey)
            .map(([_, value]) => value)
            .reduce((a, b) => Math.max(a, b), 0)
        )
      ),
    [data, xAxisKey]
  );

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
      <BarChart
        accessibilityLayer
        data={data}
        margin={{
          left: 0,
          right: 0,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          type="category"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
          tickFormatter={(value) => formatTimestampWithInterval(value, groupByInterval)}
          axisLine={false}
          tickMargin={8}
          dataKey={xAxisKey}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} tickCount={3} domain={["auto", dataMax]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelKey={xAxisKey}
              labelFormatter={(_, p) => formatTimestamp(p[0].payload[xAxisKey])}
            />
          }
        />
        {Array.from(keys).map((key) => (
          <Bar dataKey={key} stroke={chartConfig[key].color} fill={chartConfig[key].color} key={key} stackId={"1"} />
        ))}
      </BarChart>
    </ChartContainer>
  );
});

StackedBarChart.displayName = "StackedBarChart";

export default SpanStatChart;
