import React, { useMemo } from "react";
import { Bar, BarChart as RechartsBarChart, LabelList, XAxis, YAxis } from "recharts";

import { ColumnInfo } from "@/components/chart-builder/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { calculateDataMax, createAxisFormatter, generateChartConfig, getChartMargins } from "./utils";

interface HorizontalBarChartProps {
  data: Record<string, any>[];
  yAxisKey: string;
  xColumns: ColumnInfo[];
}

const measureText14Inter = (text: string): number => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return 20;
  }

  ctx.font = "14px Inter";
  return ctx.measureText(text).width;
};

const HorizontalBarChart = ({ data, yAxisKey, xColumns }: HorizontalBarChartProps) => {
  const chartConfig = useMemo(() => generateChartConfig(xColumns), [xColumns]);
  const dataMax = useMemo(() => calculateDataMax(data, xColumns), [data, xColumns]);
  const yAxisFormatter = useMemo(() => createAxisFormatter(data, yAxisKey), [data, yAxisKey]);
  const xAxisFormatter = useMemo(() => createAxisFormatter(data, xColumns[0]?.name || ""), [data, xColumns]);

  const maxTextWidth = useMemo(
    () =>
      data.reduce((acc, cur) => {
        const value = cur[xColumns?.[0]?.name];
        const width = measureText14Inter(value.toLocaleString());
        if (width > acc) {
          return width;
        }
        return acc;
      }, 0) + 8,
    [data, xColumns]
  );

  return (
    <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
      <RechartsBarChart layout="vertical" data={data} margin={{ ...getChartMargins(), right: maxTextWidth }}>
        <XAxis
          hide
          type="number"
          tickLine={false}
          tickMargin={8}
          domain={["auto", dataMax]}
          tickFormatter={xAxisFormatter}
        />
        <YAxis
          type="category"
          hide
          yAxisId={0}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          dataKey={yAxisKey}
          tickFormatter={yAxisFormatter}
        />
        <YAxis
          orientation="right"
          yAxisId={1}
          dataKey={xColumns[0]?.name || ""}
          type="category"
          axisLine={false}
          tickLine={false}
          tickFormatter={(value) => value.toLocaleString()}
          mirror
          style={{ fill: "#E8E3E3", fontSize: 14 }}
          tick={{
            transform: `translate(${maxTextWidth}, 0)`,
          }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {xColumns.map((column) => {
          const config = chartConfig[column.name];
          if (!config) return null;

          return (
            <Bar key={column.name} dataKey={column.name} fill={config.color} radius={4}>
              <LabelList style={{ fill: "#E8E3E3", fontSize: 14 }} position="insideLeft" dataKey={yAxisKey} />
            </Bar>
          );
        })}
      </RechartsBarChart>
    </ChartContainer>
  );
};

export default HorizontalBarChart;
