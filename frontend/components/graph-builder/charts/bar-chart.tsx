import React, { useMemo } from "react";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ColumnInfo } from "@/components/graph-builder/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { calculateDataMax, generateChartConfig, getChartMargins, numberFormatter } from "./utils";

interface BarChartProps {
  data: Record<string, any>[];
  xAxisKey: string;
  yColumns: ColumnInfo[];
}

const BarChart = ({ data, xAxisKey, yColumns }: BarChartProps) => {
  const chartConfig = useMemo(() => generateChartConfig(yColumns), [yColumns]);
  const dataMax = useMemo(() => calculateDataMax(data, yColumns), [data, yColumns]);

  return (
    <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
      <RechartsBarChart data={data} margin={getChartMargins()}>
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
        {yColumns.map((column) => {
          const config = chartConfig[column.name];
          if (!config) return null;

          return <Bar key={column.name} dataKey={column.name} fill={config.color} radius={4} />;
        })}
      </RechartsBarChart>
    </ChartContainer>
  );
};

export default BarChart;
