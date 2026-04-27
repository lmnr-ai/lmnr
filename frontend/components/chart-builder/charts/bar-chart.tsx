import React, { useCallback, useMemo } from "react";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, ReferenceArea, XAxis, YAxis } from "recharts";

import { type ChartDragHandlers } from "@/components/chart-builder/charts/line-chart";
import { type DisplayMode } from "@/components/chart-builder/types";
import RoundedBar from "@/components/charts/time-series-chart/bar";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { formatMetricValue } from "./format-value";
import { calculateDisplayValue, createAxisFormatter, getChartMargins } from "./utils";

interface BarChartProps {
  data: Record<string, any>[];
  x: string;
  y: string;
  keys: string[];
  chartConfig: ChartConfig;
  displayMode?: DisplayMode;
  metricColumn?: string;
  syncId?: string;
  drag?: ChartDragHandlers;
}

const BarChart = ({ data, x, keys, chartConfig, displayMode = "none", metricColumn, syncId, drag }: BarChartProps) => {
  const xAxisFormatter = useMemo(() => createAxisFormatter(data, x), [data, x]);
  const yAxisFormatter = useMemo(() => createAxisFormatter(data, keys[0] || ""), [data, keys]);

  const chartMargins = useMemo(() => {
    const yValues = data.flatMap((row) => keys.map((key) => row[key])).filter((value) => value != null);
    return getChartMargins(yValues, yAxisFormatter);
  }, [data, keys, yAxisFormatter]);

  const { displayValue, totalMax } = useMemo(
    () => calculateDisplayValue(data, keys, displayMode),
    [data, keys, displayMode]
  );

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
      {displayValue !== null && (
        <span className="font-medium text-2xl mb-2 truncate min-h-fit">
          {formatMetricValue(displayValue, metricColumn)}
        </span>
      )}
      <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
        <RechartsBarChart
          data={data}
          margin={chartMargins}
          syncId={syncId}
          onMouseDown={drag?.onMouseDown}
          onMouseMove={drag?.onMouseMove}
          onMouseUp={drag?.onMouseUp}
          style={drag ? { userSelect: "none", cursor: "crosshair" } : undefined}
        >
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
          {drag?.refArea.left && drag.refArea.right && (
            <ReferenceArea
              x1={drag.refArea.left}
              x2={drag.refArea.right}
              stroke="hsl(var(--primary))"
              strokeOpacity={0.5}
              fill="hsl(var(--primary))"
              fillOpacity={0.3}
            />
          )}
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
};

export default BarChart;
