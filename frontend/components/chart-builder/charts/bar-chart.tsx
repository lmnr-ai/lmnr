import React, { useMemo } from "react";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { calculateDataMax, createAxisFormatter, generateChartConfig, getChartMargins } from "./utils";

interface BarChartProps {
  data: Record<string, any>[];
  x: string;
  y: string[];
  keys?: Set<string>;
  chartConfig?: ChartConfig;
  total?: boolean;
}

const BarChart = ({ data, x, y, keys, chartConfig, total }: BarChartProps) => {
  const finalChartConfig = useMemo(() => {
    if (chartConfig) return chartConfig;
    return generateChartConfig(y);
  }, [chartConfig, y]);

  const finalKeys = useMemo(() => {
    if (keys) return Array.from(keys);
    return y;
  }, [keys, y]);

  const dataMax = useMemo(() => calculateDataMax(data, y), [data, y]);
  const xAxisFormatter = useMemo(() => createAxisFormatter(data, x), [data, x]);
  const yAxisFormatter = useMemo(() => createAxisFormatter(data, y[0] || ""), [data, y]);

  const chartMargins = useMemo(() => {
    const yValues = data.flatMap((row) => finalKeys.map((key) => row[key])).filter((value) => value != null);
    return getChartMargins(yValues, yAxisFormatter);
  }, [data, finalKeys, yAxisFormatter]);

  const totalSum = useMemo(() => {
    if (!total) return 0;
    return data.reduce(
      (sum, row) =>
        sum +
        finalKeys.reduce((keySum, key) => {
          const value = Number(row[key]) || 0;
          return keySum + value;
        }, 0),
      0
    );
  }, [data, finalKeys, total]);

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {total && <span className="font-medium text-2xl mb-2 truncate">{totalSum.toLocaleString()}</span>}
      <ChartContainer config={finalChartConfig} className="aspect-auto h-full w-full">
        <RechartsBarChart data={data} margin={chartMargins}>
          <CartesianGrid vertical={false} />
          <XAxis
            type="category"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            dataKey={x}
            tickFormatter={xAxisFormatter}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickCount={5}
            domain={["auto", dataMax]}
            width={32}
            tickFormatter={yAxisFormatter}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {finalKeys.map((key) => {
            const config = finalChartConfig[key];
            if (!config) return null;

            return <Bar key={key} dataKey={key} fill={config.color} radius={4} />;
          })}
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
};

export default BarChart;
