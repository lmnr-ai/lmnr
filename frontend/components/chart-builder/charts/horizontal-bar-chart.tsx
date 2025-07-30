import React, { useMemo } from "react";
import { Bar, BarChart as RechartsBarChart, LabelList, XAxis, YAxis } from "recharts";

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { calculateDataMax, createAxisFormatter, generateChartConfig, getChartMargins } from "./utils";

interface HorizontalBarChartProps {
  data: Record<string, any>[];
  x: string;
  y: string[];
  keys?: Set<string>;
  chartConfig?: ChartConfig;
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
  const categoryColumn = y[0];

  const finalChartConfig = useMemo(() => {
    if (chartConfig) return chartConfig;
    return generateChartConfig([valueColumn]);
  }, [chartConfig, valueColumn]);

  const finalKeys = useMemo(() => {
    if (keys) return Array.from(keys);
    return [valueColumn];
  }, [keys, valueColumn]);

  const dataMax = useMemo(() => calculateDataMax(data, [valueColumn]), [data, valueColumn]);
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

  const totalSum = useMemo(() => {
    if (!total) return 0;
    return data.reduce((sum, row) => {
      const value = Number(row[valueColumn]) || 0;
      return sum + value;
    }, 0);
  }, [data, valueColumn, total]);

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {total && <span className="font-medium text-2xl mb-2 truncate">{totalSum.toLocaleString()}</span>}
      <ChartContainer config={finalChartConfig} className="aspect-auto h-full w-full">
        <RechartsBarChart
          barSize={32}
          barGap={1}
          barCategoryGap={1}
          layout="vertical"
          data={data}
          margin={{ ...getChartMargins(), right: maxTextWidth }}
        >
          <XAxis
            hide
            type="number"
            tickLine={false}
            tickMargin={8}
            domain={[0, dataMax]}
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
          {finalKeys.map((key) => {
            const config = finalChartConfig[key];
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
