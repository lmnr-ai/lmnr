import React, { useCallback, useMemo } from "react";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import RoundedBar from "@/components/charts/time-series-chart/bar";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { calculateChartTotals, createAxisFormatter, getChartMargins } from "./utils";

interface BarChartProps {
  data: Record<string, any>[];
  x: string;
  y: string;
  keys: string[];
  chartConfig: ChartConfig;
  total?: boolean;
}

const BarChart = ({ data, x, keys, chartConfig, total }: BarChartProps) => {
  const xAxisFormatter = useMemo(() => createAxisFormatter(data, x), [data, x]);
  const yAxisFormatter = useMemo(() => createAxisFormatter(data, keys[0] || ""), [data, keys]);

  const chartMargins = useMemo(() => {
    const yValues = data.flatMap((row) => keys.map((key) => row[key])).filter((value) => value != null);
    return getChartMargins(yValues, yAxisFormatter);
  }, [data, keys, yAxisFormatter]);

  const { totalSum, totalMax } = useMemo(() => calculateChartTotals(data, keys, total), [data, keys, total]);

  const sortedKeys = useMemo(() => {
    const keyTotals = keys.map((key) => ({
      key,
      total: data.reduce((sum, row) => sum + (Number(row[key]) || 0), 0),
    }));

    return keyTotals.sort((a, b) => b.total - a.total).map((item) => item.key);
  }, [data, keys]);

  const BarShapeWithConfig = useCallback(
    (props: any) => <RoundedBar {...props} chartConfig={chartConfig} fields={sortedKeys} />,
    [chartConfig, sortedKeys]
  );

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {total && <span className="font-medium text-2xl mb-2 truncate min-h-fit">{totalSum.toLocaleString()}</span>}
      <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
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
            domain={["auto", totalMax]}
            width={32}
            tickFormatter={yAxisFormatter}
          />
          <ChartTooltip
            content={<ChartTooltipContent labelKey={x} labelFormatter={(_, p) => xAxisFormatter(p[0].payload[x])} />}
          />
          {sortedKeys.map((key) => {
            const config = chartConfig[key];
            if (!config) return null;

            return <Bar key={key} dataKey={key} fill={config.color} stackId="stack" shape={BarShapeWithConfig} />;
          })}
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
};

export default BarChart;
