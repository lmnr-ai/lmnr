"use client";

import { type Key, useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { ElevatedSurface } from "@/components/ui/surface";
import { parseUtcTimestamp } from "@/lib/charts/time";
import { formatTimestamp } from "@/lib/utils";

import { type GroupInfo } from "./grouping";
import { formatNumber, type ProgressionPoint } from "./shared";

interface GroupedTrendChartProps {
  score: string;
  // Already sorted chronologically and limited to runs in a kept group.
  points: ProgressionPoint[];
  groupByEvalId: Record<string, string>;
  groups: GroupInfo[];
  hoveredEvaluationId?: string;
  onPointClick?: (evaluationId: string) => void;
}

// Past this many runs per chart, only the hovered run keeps a dot; the rest read as lines.
const MAX_RUNS_WITH_DOTS = 60;

type Row = { x: number; evaluationId: string; name: string; timestamp: string; group: string } & Record<
  string,
  number | string | null
>;

export default function GroupedTrendChart({
  score,
  points,
  groupByEvalId,
  groups,
  hoveredEvaluationId,
  onPointClick,
}: GroupedTrendChartProps) {
  const rows = useMemo<Row[]>(
    () =>
      points.map((p, x) => {
        const group = groupByEvalId[p.evaluationId];
        const row: Row = { x, evaluationId: p.evaluationId, name: p.name, timestamp: p.timestamp, group };
        // One column per group; only the run's own group carries its value.
        for (const g of groups) row[g.label] = g.label === group ? p.values[score] : null;
        return row;
      }),
    [points, groupByEvalId, groups, score]
  );

  const tickFormatter = useMemo(() => {
    const first = points[0] ? parseUtcTimestamp(points[0].timestamp).getTime() : 0;
    const last = points.length ? parseUtcTimestamp(points[points.length - 1].timestamp).getTime() : 0;
    const fmt = new Intl.DateTimeFormat(
      "en-US",
      last - first > 24 * 60 * 60 * 1000 ? { month: "short", day: "numeric" } : { hour: "numeric", minute: "2-digit" }
    );
    return (index: number) => {
      const ts = points[index] ? parseUtcTimestamp(points[index].timestamp).getTime() : NaN;
      return Number.isNaN(ts) ? "" : fmt.format(new Date(ts));
    };
  }, [points]);

  const chartConfig = useMemo<ChartConfig>(
    () => Object.fromEntries(groups.map((g) => [g.label, { label: g.label, color: g.color }])),
    [groups]
  );

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
      <LineChart
        data={rows}
        margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
        onClick={
          onPointClick
            ? (state) => {
                const id = rows[Number(state.activeIndex)]?.evaluationId;
                if (id) onPointClick(id);
              }
            : undefined
        }
        className={onPointClick ? "cursor-pointer" : undefined}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          type="number"
          dataKey="x"
          domain={[-0.5, Math.max(rows.length - 0.5, 0.5)]}
          ticks={rows.map((r) => r.x)}
          interval="preserveStartEnd"
          minTickGap={40}
          tickFormatter={tickFormatter}
          tickLine={false}
          axisLine={false}
          height={28}
          tickMargin={8}
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
        />
        <YAxis
          width="auto"
          domain={["auto", "auto"]}
          tickLine={false}
          axisLine={false}
          tickCount={4}
          tickFormatter={(v: number) => formatNumber(v)}
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
        />
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: "var(--color-muted-foreground)", strokeOpacity: 0.4 }}
          content={<TrendTooltip score={score} chartConfig={chartConfig} />}
        />
        {groups.map((g) => (
          <Line
            key={g.label}
            dataKey={g.label}
            stroke={g.color}
            strokeWidth={1.5}
            dot={(props: { cx?: number | null; cy?: number | null; payload?: Row; key?: Key | null }) => {
              const { cx, cy, payload, key } = props;
              if (typeof cx !== "number" || typeof cy !== "number" || Number.isNaN(cy)) {
                return <g key={key ?? undefined} />;
              }
              const isHovered = payload?.evaluationId === hoveredEvaluationId;
              if (!isHovered && rows.length > MAX_RUNS_WITH_DOTS) return <g key={key ?? undefined} />;
              return (
                <circle
                  key={key ?? undefined}
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 5 : 2.5}
                  fill={g.color}
                  stroke={isHovered ? "var(--color-background)" : "none"}
                  strokeWidth={isHovered ? 1.5 : 0}
                />
              );
            }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls
            type="linear"
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

function TrendTooltip({
  active,
  payload,
  score,
  chartConfig,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Row }>;
  score: string;
  chartConfig: ChartConfig;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const value = row[row.group];
  return (
    <ElevatedSurface offset={3} className="rounded-md border p-2 text-xs shadow-md">
      <div className="font-medium truncate max-w-60">{row.name}</div>
      <div className="text-muted-foreground mb-1">{formatTimestamp(row.timestamp)}</div>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-sm shrink-0" style={{ background: chartConfig[row.group]?.color }} />
        <span className="text-muted-foreground truncate max-w-40">{row.group}</span>
        <span className="text-muted-foreground/60">{score}</span>
        <span className="ml-auto font-mono">{typeof value === "number" ? formatNumber(value) : "-"}</span>
      </div>
    </ElevatedSurface>
  );
}
