"use client";

import { type ReactNode, useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, type TooltipProps, XAxis, YAxis } from "recharts";
import { type NameType, type ValueType } from "recharts/types/component/DefaultTooltipContent";

import { cn } from "@/lib/utils";

import { type ChartConfig, ChartContainer } from "../../ui/chart";
import { type ProgressionPoint } from "./shared";

interface CombinedChartProps {
  data: ProgressionPoint[];
  scores: string[];
  visibleScores: string[];
  chartConfig: ChartConfig;
  hoveredEvaluationId?: string;
  className?: string;
  // When true the chart fills its parent without its own horizontal scroll
  // (used in Split where the parent owns the scroll container).
  fillParent?: boolean;
  // X-tick density. Default = labelled; Split's mini chart hides them.
  showXAxisLabels?: boolean;
}

type Row = {
  evaluationId: string;
  name: string;
  timestamp: string;
  __raw: Record<string, number | null>;
} & Record<string, number | string | null | Record<string, number | null>>;

const MIN_POINT_WIDTH = 64;

export default function CombinedChart({
  data,
  scores,
  visibleScores,
  chartConfig,
  hoveredEvaluationId,
  className,
  fillParent = false,
  showXAxisLabels = true,
}: CombinedChartProps) {
  const { rows, ranges } = useMemo(() => {
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
          normalized = max === 0 ? 0 : 1;
        } else {
          normalized = (numeric - min) / (max - min);
        }
        (row as Record<string, unknown>)[score] = normalized;
      }
      return row;
    });

    return { rows, ranges };
  }, [data, scores]);

  const visible = scores.filter((s) => visibleScores.includes(s));
  const minWidth = fillParent ? undefined : Math.max(rows.length * MIN_POINT_WIDTH, 320);

  const renderTooltip = (props: TooltipProps<ValueType, NameType>): ReactNode => (
    <NormalizedTooltip {...props} ranges={ranges} chartConfig={chartConfig} />
  );

  const chart = (
    <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
      <LineChart margin={{ top: 8, right: 8, bottom: 4, left: -8 }} data={rows} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="evaluationId"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval={0}
          height={showXAxisLabels ? 28 : 4}
          tick={showXAxisLabels ? { fontSize: 11, fill: "hsl(var(--muted-foreground))" } : false}
          tickFormatter={(id: string) => rows.find((r) => r.evaluationId === id)?.name ?? ""}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          ticks={[0, 0.5, 1]}
          domain={[0, 1]}
          tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
          width={36}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        />
        <Tooltip cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.4 }} content={renderTooltip} />
        {visible.map((score) => (
          <Line
            key={score}
            dataKey={score}
            name={score}
            stroke={chartConfig[score]?.color}
            strokeWidth={1.5}
            strokeOpacity={hoveredEvaluationId ? 0.4 : 1}
            dot={(props: { cx?: number; cy?: number; payload?: Row; key?: string | number }) => {
              const { cx, cy, payload, key } = props;
              const isHovered = payload?.evaluationId === hoveredEvaluationId;
              const r = isHovered ? 5 : 2;
              const opacity = hoveredEvaluationId ? (isHovered ? 1 : 0.4) : 1;
              return (
                <circle
                  key={key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={chartConfig[score]?.color}
                  fillOpacity={opacity}
                  stroke="none"
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

  if (fillParent) {
    return <div className={cn("h-full w-full min-w-0", className)}>{chart}</div>;
  }

  return (
    <div className={cn("h-full w-full overflow-x-auto overflow-y-hidden", className)}>
      <div className="h-full" style={{ minWidth }}>
        {chart}
      </div>
    </div>
  );
}

function NormalizedTooltip({
  active,
  payload,
  ranges,
  chartConfig,
}: TooltipProps<ValueType, NameType> & {
  ranges: Record<string, { min: number; max: number }>;
  chartConfig: ChartConfig;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as Row | undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <div className="font-medium mb-1 truncate max-w-60">{row.name}</div>
      <div className="space-y-1">
        {payload.map((entry) => {
          const score = String(entry.name ?? "");
          const raw = row.__raw[score];
          const range = ranges[score];
          const color = chartConfig[score]?.color;
          return (
            <div key={score} className="flex items-center gap-2">
              <span className="size-2 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-muted-foreground">{score}</span>
              <span className="ml-auto font-mono">{raw === null || raw === undefined ? "—" : formatNumber(raw)}</span>
              {range && (
                <span className="text-muted-foreground/60 font-mono">
                  [{formatNumber(range.min)} – {formatNumber(range.max)}]
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
