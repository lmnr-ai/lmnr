import { type ReactNode, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, type TooltipProps, XAxis, YAxis } from "recharts";
import { type NameType, type ValueType } from "recharts/types/component/DefaultTooltipContent";

import { type ChartConfig, ChartContainer } from "../../ui/chart";
import { type ProgressionPoint } from "./shared";

interface GroupedBarChartProps {
  data: ProgressionPoint[];
  scores: string[];
  visibleScores: string[];
  chartConfig: ChartConfig;
}

type Row = {
  evaluationId: string;
  name: string;
  timestamp: string;
  __raw: Record<string, number | null>;
} & Record<string, number | string | Record<string, number | null>>;

const MIN_GROUP_WIDTH = 88;

export default function GroupedBarChart({ data, scores, visibleScores, chartConfig }: GroupedBarChartProps) {
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

    const rows: Row[] = data.map((point) => {
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
        let normalized: number;
        if (numeric === null) {
          normalized = 0;
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
  const minWidth = Math.max(rows.length * MIN_GROUP_WIDTH, 320);

  const renderTooltip = (props: TooltipProps<ValueType, NameType>): ReactNode => (
    <NormalizedTooltip {...props} ranges={ranges} chartConfig={chartConfig} />
  );

  return (
    <div className="flex h-full w-full flex-col gap-1">
      <div className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
        <span className="inline-block size-1.5 rounded-full bg-muted-foreground/60" />
        <span>Each score scaled to its own min–max across runs. Hover a bar for the raw value.</span>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full" style={{ minWidth }}>
          <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
            <BarChart margin={{ top: 10, right: 10, bottom: 5, left: -8 }} data={rows} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                interval={0}
                height={28}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
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
              <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} content={renderTooltip} />
              {visible.map((score) => (
                <Bar
                  key={score}
                  dataKey={score}
                  name={score}
                  fill={chartConfig[score]?.color}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </div>
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
