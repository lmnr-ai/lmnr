import React, { useMemo } from "react";
import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis, YAxis } from "recharts";

import { type DisplayMode } from "@/components/chart-builder/types";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { formatMetricValue } from "./format-value";
import { calculateDisplayValue, createAxisFormatter, getChartMargins } from "./utils";

interface LineChartProps {
  data: Record<string, any>[];
  x: string;
  y: string;
  breakdown?: string;
  keys: string[];
  chartConfig: ChartConfig;
  displayMode?: DisplayMode;
  metricColumn?: string;
  syncId?: string;
}

const LineChart = ({
  data,
  x,
  y,
  breakdown,
  keys,
  chartConfig,
  displayMode = "none",
  metricColumn,
  syncId,
}: LineChartProps) => {
  const xAxisFormatter = useMemo(() => createAxisFormatter(data, x), [data, x]);
  const yAxisFormatter = useMemo(() => createAxisFormatter(data, keys[0] || ""), [data, keys]);

  const chartMargins = useMemo(() => {
    const yValues = data.flatMap((row) => keys.map((key) => row[key])).filter((value) => value != null);
    return getChartMargins(yValues, yAxisFormatter);
  }, [data, keys, yAxisFormatter]);

  const { displayValue, totalMax } = useMemo(
    () => calculateDisplayValue(data, keys, displayMode),
    [data, keys, displayMode]
  );

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {displayValue !== null && (
        <span className="font-medium text-2xl mb-2 truncate min-h-fit" style={{ marginLeft: chartMargins.left }}>
          {formatMetricValue(displayValue, metricColumn)}
        </span>
      )}
      <ChartContainer config={chartConfig} className="aspect-auto flex-1 min-h-0 w-full">
        <RechartsLineChart data={data} margin={chartMargins} syncId={syncId}>
          <CartesianGrid vertical={false} />
          <XAxis
            type="category"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            dataKey={x}
            style={{ fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={xAxisFormatter}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickCount={5}
            domain={["auto", totalMax]}
            width={32}
            style={{ fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={yAxisFormatter}
          />
          <ChartTooltip
            content={<ChartTooltipContent labelKey={x} labelFormatter={(_, p) => xAxisFormatter(p[0].payload[x])} />}
          />
          {keys.map((key) => {
            const config = chartConfig[key];
            if (!config) return null;
            return <Line key={key} dataKey={key} dot={false} stroke={config.color} fill={config.color} />;
          })}
        </RechartsLineChart>
      </ChartContainer>
    </div>
  );
};

export default LineChart;
