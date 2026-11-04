"use client";

import { useMemo } from "react";

import CartesianPlot from "@/components/charts/cartesian-plot";
import { type ChartConfig } from "@/components/ui/chart";

import SelectableChart from "./selectable-chart";

interface CartesianChartProps {
  kind: "line" | "bar";
  data: Record<string, any>[];
  x: string;
  keys: string[];
  chartConfig: ChartConfig;
  selectionChartId?: string;
}

/** Chart-builder data and dashboard selection are adapters around the shared plot. */
const CartesianChart = ({ kind, data, x, keys, chartConfig, selectionChartId }: CartesianChartProps) => {
  const series = useMemo(
    () =>
      keys.map((key) => {
        const color = chartConfig[key]?.color ?? "currentColor";
        return {
          key,
          label: String(chartConfig[key]?.label ?? key),
          color: kind === "bar" ? `color-mix(in srgb, ${color} 70%, transparent)` : color,
        };
      }),
    [keys, chartConfig, kind]
  );
  const props = { kind, data, x, series };
  return selectionChartId ? <SelectableChart {...props} chartId={selectionChartId} /> : <CartesianPlot {...props} />;
};

export default CartesianChart;
