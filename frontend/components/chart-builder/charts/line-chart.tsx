import React, { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  type MouseHandlerDataParam,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts";

import { type DisplayMode } from "@/components/chart-builder/types";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { formatMetricValue } from "./format-value";
import { calculateDisplayValue, createAxisFormatter } from "./utils";

export type CategoricalChartFunc = (nextState: MouseHandlerDataParam, event: React.SyntheticEvent) => void;

export interface ChartDragHandlers {
  onMouseDown: CategoricalChartFunc;
  onMouseMove: CategoricalChartFunc;
  onMouseUp: () => void;
  refArea: { left?: string; right?: string };
}

interface LineChartProps {
  data: Record<string, any>[];
  x: string;
  y: string;
  breakdown?: string;
  keys: string[];
  chartConfig: ChartConfig;
  displayMode?: DisplayMode;
  metricColumn?: string;
  syncId?: string;
  drag?: ChartDragHandlers;
}

const LineChart = ({
  data,
  x,
  y,
  breakdown,
  keys,
  chartConfig,
  displayMode = "none",
  metricColumn,
  syncId,
  drag,
}: LineChartProps) => {
  const xAxisFormatter = useMemo(() => createAxisFormatter(data, x), [data, x]);
  const yAxisFormatter = useMemo(() => createAxisFormatter(data, keys[0] || ""), [data, keys]);

  const { displayValue, totalMax } = useMemo(
    () => calculateDisplayValue(data, keys, displayMode),
    [data, keys, displayMode]
  );

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {displayValue !== null && (
        <span className="font-medium text-2xl mb-2 truncate min-h-fit">
          {formatMetricValue(displayValue, metricColumn)}
        </span>
      )}
      <ChartContainer config={chartConfig} className="aspect-auto flex-1 min-h-0 w-full">
        <RechartsLineChart
          data={data}
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
            style={{ fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={xAxisFormatter}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickCount={5}
            domain={["auto", totalMax]}
            width="auto"
            style={{ fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={yAxisFormatter}
          />
          <ChartTooltip
            content={<ChartTooltipContent labelKey={x} labelFormatter={(_, p) => xAxisFormatter(p[0].payload[x])} />}
          />
          {keys.map((key) => {
            const config = chartConfig[key];
            if (!config) return null;
            return <Line key={key} dataKey={key} dot={false} stroke={config.color} fill={config.color} />;
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
        </RechartsLineChart>
      </ChartContainer>
    </div>
  );
};

export default LineChart;
