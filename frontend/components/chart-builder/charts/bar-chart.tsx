import React, { useMemo } from "react";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ColumnInfo } from "@/components/chart-builder/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { calculateDataMax, createAxisFormatter,generateChartConfig, getChartMargins } from "./utils";

interface BarChartProps {
  data: Record<string, any>[];
  xAxisKey: string;
  yColumns: ColumnInfo[];
}

const BarChart = ({ data, xAxisKey, yColumns }: BarChartProps) => {
  const chartConfig = useMemo(() => generateChartConfig(yColumns), [yColumns]);
  const dataMax = useMemo(() => calculateDataMax(data, yColumns), [data, yColumns]);
  const xAxisFormatter = useMemo(() => createAxisFormatter(data, xAxisKey), [data, xAxisKey]);
  const yAxisFormatter = useMemo(() => createAxisFormatter(data, yColumns[0]?.name || ""), [data, yColumns]);

  const chartMargins = useMemo(() => {
    // For bar chart, Y-axis shows the values from yColumns
    const yValues = data.flatMap(row => yColumns.map(col => row[col.name])).filter(value => value != null);
    return getChartMargins(yValues, yAxisFormatter);
  }, [data, yColumns, yAxisFormatter]);

  return (
    <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
      <RechartsBarChart data={data} margin={chartMargins}>
        <CartesianGrid vertical={false} />
        <XAxis
          type="category"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          dataKey={xAxisKey}
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
