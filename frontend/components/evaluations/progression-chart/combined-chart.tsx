"use client";

import { type Key, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { parseUtcTimestamp } from "@/components/chart-builder/charts/utils";
import { cn, formatTimestamp } from "@/lib/utils";

import { type ChartConfig, ChartContainer } from "../../ui/chart";
import { computeScoreRange, normalizeValue } from "./normalize";
import { type ProgressionPoint } from "./shared";

// Max px gap between points — caps spacing when few points (recharts has no native prop).
const MAX_POINT_GAP_PX = 120;
// LineChart margin.left + margin.right.
const HORIZONTAL_MARGIN_PX = 24;

interface CombinedChartProps {
  data: ProgressionPoint[];
  scores: string[];
  visibleScores: string[];
  chartConfig: ChartConfig;
  hoveredEvaluationId?: string;
  hoveredScore?: string | null;
  onPointClick?: (evaluationId: string) => void;
  className?: string;
  // On: every score stretched to its own min/max (fills full height). Off: 0–1
  // scores keep a fixed 0–1 range, others use their own min/max.
  fillHeight?: boolean;
  // Opacity of non-selected lines/points when a run is selected
  // (hoveredEvaluationId set). Default matches the evaluations page's hover-dim;
  // the debugger eval card overrides it lower so its selected run pops harder.
  dimmedOpacity?: number;
}

type Row = {
  evaluationId: string;
  name: string;
  timestamp: string;
  ts: number;
  // Numeric slot index (0-based) — drives the number X axis so point spacing
  // can be bounded independently of the container width.
  x: number;
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
  fillHeight = false,
  dimmedOpacity = 0.35,
}: CombinedChartProps) {
  const { rows, ranks } = useMemo(() => {
    // fillHeight off → pin 0–1 scores to a fixed 0–1 range; on → every score
    // uses its own min/max so it fills the full plot height.
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const score of scores) {
      const values: number[] = [];
      for (const point of data) {
        const v = point.values[score];
        if (typeof v === "number" && !isNaN(v)) values.push(v);
      }
      ranges[score] = computeScoreRange(values, !fillHeight);
    }

    // Sort chronologically — line segments cross over themselves otherwise.
    const sorted = data.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const rows: Row[] = sorted.map((point, index) => {
      const raw: Record<string, number | null> = {};
      const row: Row = {
        evaluationId: point.evaluationId,
        name: point.name,
        timestamp: point.timestamp,
        ts: parseUtcTimestamp(point.timestamp).getTime(),
        x: index,
        __raw: raw,
      };
      for (const score of scores) {
        const v = point.values[score];
        const numeric = typeof v === "number" && !isNaN(v) ? v : null;
        raw[score] = numeric;
        const { min, max } = ranges[score];
        (row as Record<string, unknown>)[score] = numeric === null ? null : normalizeValue(numeric, min, max);
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
  }, [data, scores, fillHeight]);

  // Day-level ticks for multi-day ranges, time-of-day otherwise; maps slot index → timestamp.
  const tickFormatter = useMemo(() => {
    if (rows.length === 0) return () => "";
    const spansDays = rows[rows.length - 1].ts - rows[0].ts > 24 * 60 * 60 * 1000;
    const fmt = new Intl.DateTimeFormat(
      "en-US",
      spansDays ? { month: "short", day: "numeric" } : { hour: "numeric", minute: "2-digit" }
    );
    return (index: number) => {
      const row = rows[index];
      // Guard NaN too: an unparseable timestamp yields NaN, and
      // `fmt.format(new Date(NaN))` THROWS (RangeError), taking down the whole
      // chart. A bad tick degrades to blank instead.
      return row && !Number.isNaN(row.ts) ? fmt.format(new Date(row.ts)) : "";
    };
  }, [rows]);

  // Measure width to turn MAX_POINT_GAP_PX into a slot budget. Measure
  // SYNCHRONOUSLY before first paint (useLayoutEffect) so the padding is right on
  // the initial render — a `useState(0)` start would paint once with pad=0
  // (points edge-to-edge / a single point on a degenerate [0,0] domain) and then
  // visibly shift when the ResizeObserver fires a frame later.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ticks = useMemo(() => rows.map((r) => r.x), [rows]);
  // Points sit at x = 0..lastIndex. With few points the budget gives more slots
  // than we need, so we split the spare slots evenly as domain padding on both
  // sides — the points stay at a bounded gap AND centered (not clustered left).
  const domain = useMemo<[number, number]>(() => {
    const lastIndex = rows.length - 1;
    if (lastIndex < 0) return [0, 1];
    const plotWidth = Math.max(0, containerWidth - HORIZONTAL_MARGIN_PX);
    const budgetSlots = plotWidth > 0 ? Math.floor(plotWidth / MAX_POINT_GAP_PX) : 0;
    const maxSlots = Math.max(lastIndex, budgetSlots);
    const pad = (maxSlots - lastIndex) / 2;
    return [-pad, lastIndex + pad];
  }, [containerWidth, rows.length]);

  const visible = scores.filter((s) => visibleScores.includes(s));

  return (
    <div ref={containerRef} className="h-full w-full">
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
          {/* Numeric slot axis; spacing is per-run, deliberately NOT proportional to elapsed time. */}
          <XAxis
            type="number"
            dataKey="x"
            domain={domain}
            allowDataOverflow
            ticks={ticks}
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
                // A hovered score wins full opacity even when a run is selected
                // (hoveredEvaluationId dims all lines to 0.35) — so hovering a
                // score below a debugger eval card lights up its line.
                strokeOpacity={
                  hoveredScore === score ? 1 : scoreDimmed ? 0.15 : hoveredEvaluationId ? dimmedOpacity : 1
                }
                dot={(props: { cx?: number | null; cy?: number | null; payload?: Row; key?: Key | null }) => {
                  const { cx, cy, payload, key } = props;
                  // Null values still get a dot callback with cy=null — an SVG circle
                  // without cy renders at 0 (pinned to the top edge). Skip them.
                  if (typeof cx !== "number" || typeof cy !== "number" || Number.isNaN(cx) || Number.isNaN(cy)) {
                    return <g key={key ?? undefined} />;
                  }
                  const isHovered = payload?.evaluationId === hoveredEvaluationId;
                  const r = isHovered ? 5 : 2.5;
                  const opacity = scoreDimmed ? 0.15 : hoveredEvaluationId ? (isHovered ? 1 : dimmedOpacity) : 1;
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
    </div>
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
