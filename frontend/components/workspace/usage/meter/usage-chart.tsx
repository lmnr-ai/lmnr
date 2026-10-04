"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatDay } from "@/components/workspace/usage/utils";
import { type DailyPoint } from "@/lib/billing/usage-estimate";

import UsageTooltip from "./usage-tooltip";

interface UsageChartProps {
  points: DailyPoint[];
  color: string;
  format: (value: number) => string;
  formatTick: (value: number) => string;
}

export default function UsageChart({ points, color, format, formatTick }: UsageChartProps) {
  return (
    <ChartContainer config={{ value: { label: "Used", color } }} className="aspect-auto h-40 w-full">
      <BarChart data={points} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={formatDay} minTickGap={24} />
        <YAxis width="auto" tickLine={false} axisLine={false} tickFormatter={formatTick} tickCount={4} />
        <ChartTooltip cursor={{ fill: "var(--color-surface-up-2)" }} content={<UsageTooltip format={format} />} />
        <Bar dataKey="value" fill={color} radius={[3, 3, 3, 3]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
