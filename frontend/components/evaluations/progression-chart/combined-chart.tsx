"use client";

import { type Key, useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { parseUtcTimestamp } from "@/components/chart-builder/charts/utils";
import { cn, formatTimestamp } from "@/lib/utils";

import { type ChartConfig, ChartContainer } from "../../ui/chart";
import { type ProgressionPoint } from "./shared";

interface CombinedChartProps {
  data: ProgressionPoint[];
  scores: string[];
  visibleScores: string[];
  chartConfig: ChartConfig;
  hoveredEvaluationId?: string;
  hoveredScore?: string | null;
  onPointClick?: (evaluationId: string) => void;
  className?: string;
}

type Row = {
  evaluationId: string;
  name: string;
  timestamp: string;
  ts: number;
  __raw: Record<string, number | null>;
} & Record<string, number | string | null | Record<string, number | null>>;

export default function CombinedChart({
  data,
  scores,
  visibleScores,
  chartConfig,
  hoveredEvaluationId,
  hoveredScore,
  onPointClick,
  className,
}: CombinedChartProps) {
  const { rows, ranks } = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const score of scores) {
      let min = Infinity;
      let max = -Infinity;
      for (const point of data) {
        const v = point.values[score];
        if (typeof v === "number" && !isNaN(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      ranges[score] = {
        min: min === Infinity ? 0 : min,
        max: max === -Infinity ? 1 : max,
      };
    }

    // Sort chronologically — line segments cross over themselves otherwise.
    const sorted = data.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const rows: Row[] = sorted.map((point) => {
      const raw: Record<string, number | null> = {};
      const row: Row = {
        evaluationId: point.evaluationId,
        name: point.name,
        timestamp: point.timestamp,
        ts: parseUtcTimestamp(point.timestamp).getTime(),
        __raw: raw,
      };
      for (const score of scores) {
        const v = point.values[score];
        const numeric = typeof v === "number" && !isNaN(v) ? v : null;
        raw[score] = numeric;
        const { min, max } = ranges[score];
        let normalized: number | null;
        if (numeric === null) {
          normalized = null;
        } else if (max === min) {
          // A score that never changes has no range — draw it mid-chart instead
          // of pinning it to the top/bottom edge.
          normalized = 0.5;
        } else {
          normalized = (numeric - min) / (max - min);
        }
        (row as Record<string, unknown>)[score] = normalized;
      }
      return row;
    });

    // Per-score ranks: how each eval's value places vs the others (1 = best).
    const ranks: Record<string, Record<string, { position: number; total: number }>> = {};
    for (const score of scores) {
      const ranked = rows
        .map((r) => ({ evaluationId: r.evaluationId, raw: r.__raw[score] }))
        .filter((e): e is { evaluationId: string; raw: number } => e.raw !== null && e.raw !== undefined)
        .sort((a, b) => b.raw - a.raw);
      const total = ranked.length;
      const scoreRanks: Record<string, { position: number; total: number }> = {};
      ranked.forEach((entry, idx) => {
        scoreRanks[entry.evaluationId] = { position: idx + 1, total };
      });
      ranks[score] = scoreRanks;
    }

    return { rows, ranks };
  }, [data, scores]);

  // Range-aware label format for run ticks: day-level for multi-day ranges,
  // time-of-day when all runs land within a day.
  const tickFormatter = useMemo(() => {
    if (rows.length === 0) return () => "";
    const spansDays = rows[rows.length - 1].ts - rows[0].ts > 24 * 60 * 60 * 1000;
    const fmt = new Intl.DateTimeFormat(
      "en-US",
      spansDays ? { month: "short", day: "numeric" } : { hour: "numeric", minute: "2-digit" }
    );
    const byId = new Map(rows.map((r) => [r.evaluationId, r.ts]));
    return (id: string) => {
      const ts = byId.get(id);
      return ts === undefined ? "" : fmt.format(new Date(ts));
    };
  }, [rows]);

  const visible = scores.filter((s) => visibleScores.includes(s));

  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto h-full w-full", onPointClick && "cursor-pointer", className)}
    >
      <LineChart
        margin={{ top: 4, right: 12, bottom: 4, left: 12 }}
        data={rows}
        accessibilityLayer
        onClick={
          onPointClick
            ? (state: { activePayload?: Array<{ payload?: Row }> }) => {
                const id = state?.activePayload?.[0]?.payload?.evaluationId;
                if (typeof id === "string") onPointClick(id);
              }
            : undefined
        }
      >
        <CartesianGrid vertical={false} />
        {/* Category axis: one equally-spaced slot per run (spacing is per-run,
            deliberately NOT proportional to elapsed time between runs). */}
        <XAxis
          dataKey="evaluationId"
          interval="preserveStartEnd"
          minTickGap={48}
          tickFormatter={tickFormatter}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          height={20}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        />
        {/* Padding keeps min/max dots (y = 0 / 1) from being clipped at the plot edges. */}
        <YAxis hide domain={[0, 1]} padding={{ top: 10, bottom: 10 }} />
        <Tooltip
          cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.4 }}
          content={<NormalizedTooltip ranks={ranks} chartConfig={chartConfig} />}
        />
        {visible.map((score) => {
          // Legend hover spotlights one score's line; the others fade back.
          const scoreDimmed = !!hoveredScore && score !== hoveredScore;
          return (
            <Line
              key={score}
              dataKey={score}
              name={score}
              stroke={chartConfig[score]?.color}
              strokeWidth={hoveredScore === score ? 2 : 1.5}
              strokeOpacity={scoreDimmed ? 0.15 : hoveredEvaluationId ? 0.35 : 1}
              dot={(props: { cx?: number | null; cy?: number | null; payload?: Row; key?: Key | null }) => {
                const { cx, cy, payload, key } = props;
                // Null values still get a dot callback with cy=null — an SVG circle
                // without cy renders at 0 (pinned to the top edge). Skip them.
                if (typeof cx !== "number" || typeof cy !== "number" || Number.isNaN(cx) || Number.isNaN(cy)) {
                  return <g key={key ?? undefined} />;
                }
                const isHovered = payload?.evaluationId === hoveredEvaluationId;
                const r = isHovered ? 5 : 2.5;
                const opacity = scoreDimmed ? 0.15 : hoveredEvaluationId ? (isHovered ? 1 : 0.35) : 1;
                return (
                  <circle
                    key={key ?? undefined}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={chartConfig[score]?.color}
                    fillOpacity={opacity}
                    stroke={isHovered ? "hsl(var(--background))" : "none"}
                    strokeWidth={isHovered ? 1.5 : 0}
                  />
                );
              }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
              type="linear"
            />
          );
        })}
      </LineChart>
    </ChartContainer>
  );
}

function NormalizedTooltip({
  active,
  payload,
  ranks,
  chartConfig,
}: {
  active?: boolean;
  payload?: Array<{ name?: string | number; payload?: Row }>;
  ranks: Record<string, Record<string, { position: number; total: number }>>;
  chartConfig: ChartConfig;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <div className="font-medium truncate max-w-60">{row.name}</div>
      <div className="text-muted-foreground mb-1">{formatTimestamp(row.timestamp)}</div>
      <div className="space-y-1">
        {payload.map((entry) => {
          const score = String(entry.name ?? "");
          const raw = row.__raw[score];
          const rank = ranks[score]?.[row.evaluationId];
          const color = chartConfig[score]?.color;
          return (
            <div key={score} className="flex items-center gap-2">
              <span className="size-2 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-muted-foreground">{score}</span>
              <span className="ml-auto font-mono">{raw === null || raw === undefined ? "—" : formatNumber(raw)}</span>
              {rank && (
                <span className="text-muted-foreground/60 font-mono tabular-nums">
                  Rank {rank.position}/{rank.total}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(3);
}
