import React, { memo, useMemo } from "react";
import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis, YAxis } from "recharts";

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import {
  formatTimestamp,
  formatTimestampFromSeconds,
  formatTimestampFromSecondsWithInterval,
  formatTimestampWithInterval,
} from "@/lib/utils";

export interface ChartProps {
  data: Record<string, any>[];
  keys: Set<string>;
  xAxisKey: string;
  chartConfig: ChartConfig;
  groupByInterval: GroupByInterval;
  numericTimestamp?: boolean;
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const LineChart = memo<ChartProps>(({ data, keys, xAxisKey, chartConfig, groupByInterval, numericTimestamp }) => {
  const dataMax = useMemo(
    () =>
      data.reduce((max, d) => {
        const values = Object.entries(d)
          .filter(([key]) => key !== xAxisKey)
          .map(([_, value]) => Number(value))
          .filter((value) => !isNaN(value));
        return Math.max(max, ...values);
      }, 0),
    [data, xAxisKey]
  );

  return (
    <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
      <RechartsLineChart
        data={data}
        margin={{
          left: 8,
          right: 8,
          top: 8,
          bottom: 8,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          type="category"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
          tickFormatter={(value) => {
            if (numericTimestamp) {
              return formatTimestampFromSecondsWithInterval(value, groupByInterval);
            }
            return formatTimestampWithInterval(value, groupByInterval);
          }}
          axisLine={false}
          tickMargin={8}
          dataKey={xAxisKey}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickCount={5}
          domain={["auto", dataMax]}
          width={32}
          tickFormatter={(value) => numberFormatter.format(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelKey={xAxisKey}
              labelFormatter={(_, p) =>
                numericTimestamp
                  ? formatTimestampFromSeconds(p[0].payload[xAxisKey])
                  : formatTimestamp(`${p[0].payload[xAxisKey]}Z`)
              }
            />
          }
        />
        {Array.from(keys).map((key) => (
          <Line dataKey={key} dot={false} stroke={chartConfig[key].color} fill={chartConfig[key].color} key={key} />
        ))}
      </RechartsLineChart>
    </ChartContainer>
  );
});

LineChart.displayName = "LineChart";

export default LineChart;
