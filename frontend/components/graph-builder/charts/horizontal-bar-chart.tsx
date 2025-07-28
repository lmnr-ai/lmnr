import React, { useMemo } from "react";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import { ColumnInfo } from "@/components/graph-builder/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { calculateDataMax, generateChartConfig, getChartMargins, numberFormatter } from "./utils";

interface HorizontalBarChartProps {
  data: Record<string, any>[];
  yAxisKey: string;
  xColumns: ColumnInfo[];
}

const HorizontalBarChart = ({ data, yAxisKey, xColumns }: HorizontalBarChartProps) => {
  const chartConfig = useMemo(() => generateChartConfig(xColumns), [xColumns]);
  const dataMax = useMemo(() => calculateDataMax(data, xColumns), [data, xColumns]);

  return (
    <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
      <RechartsBarChart layout="vertical" data={data} margin={getChartMargins()}>
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          tickMargin={8}
          domain={["auto", dataMax]}
          tickFormatter={(value) => numberFormatter.format(value)}
        />
        <YAxis type="category" hide tickLine={false} axisLine={false} tickMargin={8} dataKey={yAxisKey} width={60} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {xColumns.map((column) => {
          const config = chartConfig[column.name];
          if (!config) return null;

          return (
            <Bar key={column.name} dataKey={column.name} fill={config.color} radius={4}>
              <LabelList style={{ fill: "#E8E3E3" }} position="insideLeft" dataKey={yAxisKey} />
            </Bar>
          );
        })}
      </RechartsBarChart>
    </ChartContainer>
  );
};
export default HorizontalBarChart;
