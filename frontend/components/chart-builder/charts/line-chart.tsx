import React, { useMemo } from "react";
import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis, YAxis } from "recharts";

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { calculateChartTotals, createAxisFormatter, getChartMargins } from "./utils";

interface LineChartProps {
  data: Record<string, any>[];
  x: string;
  y: string;
  keys: string[];
  chartConfig: ChartConfig;
  total?: boolean;
}

const LineChart = ({ data, x, keys, chartConfig, total }: LineChartProps) => {
  const xAxisFormatter = useMemo(() => createAxisFormatter(data, x), [data, x]);
  const yAxisFormatter = useMemo(() => createAxisFormatter(data, keys[0] || ""), [data, keys]);

  const chartMargins = useMemo(() => {
    const yValues = data.flatMap((row) => keys.map((key) => row[key])).filter((value) => value != null);
    return getChartMargins(yValues, yAxisFormatter);
  }, [data, keys, yAxisFormatter]);

  const { totalSum, totalMax } = useMemo(() => calculateChartTotals(data, keys, total), [data, keys, total]);

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {total && <span className="font-medium text-2xl mb-2 truncate">{totalSum.toLocaleString()}</span>}
      <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
        <RechartsLineChart data={data} margin={chartMargins}>
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
            domain={["auto", totalMax]}
            width={32}
            tickFormatter={yAxisFormatter}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
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
