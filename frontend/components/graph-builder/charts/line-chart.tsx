import React, { useMemo } from "react";
import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis, YAxis } from "recharts";

import { ColumnInfo } from "@/components/graph-builder/utils";
import { ChartConfig,ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { calculateDataMax, generateChartConfig, getChartMargins, numberFormatter } from "./utils";

interface LineChartProps {
  data: Record<string, any>[];
  xAxisKey: string;
  yColumns?: ColumnInfo[];
  keys?: Set<string>;
  chartConfig?: ChartConfig;
}

const LineChart = ({ data, xAxisKey, yColumns, keys, chartConfig }: LineChartProps) => {
  const finalChartConfig = useMemo(() => {
    if (chartConfig) return chartConfig;
    return generateChartConfig(yColumns || []);
  }, [chartConfig, yColumns]);

  const finalKeys = useMemo(() => {
    if (keys) return Array.from(keys);
    return (yColumns || []).map(col => col.name);
  }, [keys, yColumns]);

  const dataMax = useMemo(() => {
    if (yColumns) return calculateDataMax(data, yColumns);

    return Math.max(
      ...data.map((d) =>
        Object.entries(d)
          .filter(([key]) => key !== xAxisKey)
          .map(([_, value]) => Number(value) || 0)
          .reduce((a, b) => Math.max(a, b), 0)
      )
    );
  }, [data, yColumns, xAxisKey]);

  return (
    <ChartContainer config={finalChartConfig} className="aspect-auto w-full h-full">
      <RechartsLineChart data={data} margin={getChartMargins()}>
        <CartesianGrid vertical={false} />
        <XAxis type="category" tickLine={false} axisLine={false} tickMargin={8} dataKey={xAxisKey} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickCount={5}
          domain={["auto", dataMax]}
          width={32}
          tickFormatter={(value) => numberFormatter.format(value)}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {finalKeys.map((key) => {
          const config = finalChartConfig[key];
          if (!config) return null;
          return <Line key={key} dataKey={key} dot={false} stroke={config.color} fill={config.color} />;
        })}
      </RechartsLineChart>
    </ChartContainer>
  );
};

export default LineChart;
