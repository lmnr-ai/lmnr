import React, { useMemo } from "react";
import { Bar, BarChart as RechartsBarChart, LabelList, XAxis, YAxis } from "recharts";

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { calculateChartTotals, createAxisFormatter, getChartMargins } from "./utils";

interface HorizontalBarChartProps {
  data: Record<string, any>[];
  x: string;
  y: string;
  keys: string[];
  chartConfig: ChartConfig;
  total?: boolean;
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

const HorizontalBarChart = ({ data, x, y, keys, chartConfig, total }: HorizontalBarChartProps) => {
  const valueColumn = x;
  const categoryColumn = y;

  const yAxisFormatter = useMemo(() => createAxisFormatter(data, categoryColumn), [data, categoryColumn]);
  const xAxisFormatter = useMemo(() => createAxisFormatter(data, valueColumn), [data, valueColumn]);

  const maxTextWidth = useMemo(
    () =>
      data.reduce((acc, cur) => {
        const value = cur[valueColumn];
        const width = measureText14Inter(yAxisFormatter(value));
        if (width > acc) {
          return width;
        }
        return acc;
      }, 0) + 16,
    [data, valueColumn, yAxisFormatter]
  );

  const { totalSum, totalMax } = useMemo(
    () => calculateChartTotals(data, [valueColumn], total),
    [data, valueColumn, total]
  );

  const chartHeight = useMemo(() => {
    const barSize = 32;
    const barGap = 0;
    const margins = 24;

    return data.length * (barSize + barGap) + margins;
  }, [data.length]);

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {total && <span className="font-medium text-2xl mb-2 truncate min-h-fit">{totalSum.toLocaleString()}</span>}
      <ChartContainer config={chartConfig} className="w-full" style={{ height: chartHeight }}>
        <RechartsBarChart
          barSize={32}
          barGap={0}
          barCategoryGap={0}
          layout="vertical"
          data={data}
          margin={{ ...getChartMargins(), right: maxTextWidth }}
        >
          <XAxis
            hide
            type="number"
            tickLine={false}
            tickMargin={8}
            domain={[0, totalMax]}
            tickFormatter={xAxisFormatter}
          />
          <YAxis
            type="category"
            hide
            yAxisId={0}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            dataKey={categoryColumn}
            tickFormatter={yAxisFormatter}
          />
          <YAxis
            orientation="right"
            yAxisId={1}
            dataKey={valueColumn}
            type="category"
            axisLine={false}
            tickLine={false}
            tickFormatter={xAxisFormatter}
            mirror
            style={{ fill: "#E8E3E3", fontSize: 14 }}
            tick={{
              transform: `translate(${maxTextWidth}, 0)`,
            }}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {keys.map((key) => {
            const config = chartConfig[key];
            if (!config) return null;

            return (
              <Bar key={valueColumn} dataKey={valueColumn} fill={config.color} radius={4}>
                <LabelList style={{ fill: "#E8E3E3", fontSize: 14 }} position="insideLeft" dataKey={categoryColumn} />
              </Bar>
            );
          })}
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
};

export default HorizontalBarChart;
