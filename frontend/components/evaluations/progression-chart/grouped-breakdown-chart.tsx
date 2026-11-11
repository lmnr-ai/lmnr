"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ErrorBar, Tooltip, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { ElevatedSurface } from "@/components/ui/surface";

import { type GroupInfo } from "./grouping";
import { formatNumber, type ProgressionPoint } from "./shared";

interface GroupedBreakdownChartProps {
  scores: string[];
  points: ProgressionPoint[];
  groupByEvalId: Record<string, string>;
  groups: GroupInfo[];
}

type GroupStat = { mean: number; min: number; max: number; runs: number };
// Per score: one normalized height + whisker per group, raw stats kept for the tooltip.
type Row = { score: string; stats: Record<string, GroupStat> } & Record<string, unknown>;

const CHART_CONFIG: ChartConfig = {};

function groupStats(points: ProgressionPoint[], groupByEvalId: Record<string, string>, score: string) {
  const valuesByGroup = new Map<string, number[]>();
  for (const p of points) {
    const group = groupByEvalId[p.evaluationId];
    const v = p.values[score];
    if (group === undefined || typeof v !== "number") continue;
    valuesByGroup.set(group, [...(valuesByGroup.get(group) ?? []), v]);
  }
  const stats: Record<string, GroupStat> = {};
  for (const [group, values] of valuesByGroup) {
    stats[group] = {
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      runs: values.length,
    };
  }
  return stats;
}

export default function GroupedBreakdownChart({ scores, points, groupByEvalId, groups }: GroupedBreakdownChartProps) {
  const rows = useMemo<Row[]>(
    () =>
      scores.map((score) => {
        const stats = groupStats(points, groupByEvalId, score);
        const all = Object.values(stats);
        // 0–1 scores keep their scale; others are scaled so the highest whisker reaches 1.
        const top = Math.max(0, ...all.map((s) => s.max));
        const inUnitRange = all.every((s) => s.min >= 0 && s.max <= 1);
        const factor = inUnitRange || top === 0 ? 1 : 1 / top;
        const row: Row = { score, stats };
        for (const [group, s] of Object.entries(stats)) {
          row[group] = s.mean * factor;
          row[`${group}__range`] = [(s.mean - s.min) * factor, (s.max - s.mean) * factor];
        }
        return row;
      }),
    [scores, points, groupByEvalId]
  );

  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-full w-full">
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 8 }} barGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="score"
          tickLine={false}
          axisLine={false}
          interval={0}
          height={28}
          tickMargin={8}
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
          tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
        />
        {/* Heights are per-score scaled, so the axis has no shared unit; the tooltip carries real values. */}
        <YAxis hide domain={[0, 1]} />
        <Tooltip
          isAnimationActive={false}
          cursor={{ fill: "var(--color-muted)", fillOpacity: 0.4 }}
          content={<BreakdownTooltip groups={groups} />}
        />
        {groups.map((g) => (
          <Bar
            key={g.label}
            dataKey={g.label}
            fill={g.color}
            isAnimationActive={false}
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
          >
            <ErrorBar
              dataKey={`${g.label}__range`}
              isAnimationActive={false}
              width={4}
              strokeWidth={1}
              stroke="var(--color-muted-foreground)"
            />
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}

function BreakdownTooltip({
  active,
  payload,
  groups,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Row }>;
  groups: GroupInfo[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <ElevatedSurface offset={3} className="rounded-md border p-2 text-xs shadow-md space-y-1">
      <div className="font-medium">{row.score}</div>
      {groups.map((g) => {
        const s = row.stats[g.label];
        if (!s) return null;
        return (
          <div key={g.label} className="flex items-center gap-2">
            <span className="size-2 rounded-sm shrink-0" style={{ background: g.color }} />
            <span className="text-muted-foreground truncate max-w-40">{g.label}</span>
            <span className="ml-auto font-mono">{formatNumber(s.mean)}</span>
            <span className="text-muted-foreground/60 font-mono">
              {s.runs > 1 ? `${formatNumber(s.min)}–${formatNumber(s.max)}, ` : ""}
              {s.runs} {s.runs === 1 ? "run" : "runs"}
            </span>
          </div>
        );
      })}
    </ElevatedSurface>
  );
}
