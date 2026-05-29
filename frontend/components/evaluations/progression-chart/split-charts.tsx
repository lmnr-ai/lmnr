import { useRef } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import ScrollEdgeFades from "@/components/ui/scroll-edge-fades";

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "../../ui/chart";
import { type ProgressionPoint } from "./shared";

interface SplitChartsProps {
  data: ProgressionPoint[];
  scores: string[];
  visibleScores: string[];
  chartConfig: ChartConfig;
  hoveredEvaluationId?: string;
}

interface ScoreRow {
  name: string;
  evaluationId: string;
  timestamp: string;
  value: number | null;
}

const CARD_WIDTH = 340;
const CARD_GAP = 12;
const DIMMED_OPACITY = 0.4;

export default function SplitCharts({
  data,
  scores,
  visibleScores,
  chartConfig,
  hoveredEvaluationId,
}: SplitChartsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = scores.filter((s) => visibleScores.includes(s));
  if (visible.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Select a score to display
      </div>
    );
  }
  // Same shape as GroupedBarChart: outer flex flex-col h-full + inner min-h-0 flex-1
  // overflow-x-auto scroll container + explicit minWidth on the row. The flex-1 here is
  // what gives the row definite pixel height, which then lets each card's h-full resolve.
  const minWidth = visible.length * CARD_WIDTH + (visible.length - 1) * CARD_GAP;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="h-full w-full overflow-x-auto overflow-y-hidden">
          <div className="flex h-full" style={{ minWidth, gap: CARD_GAP }}>
            {visible.map((score) => (
              <ScoreCard
                key={score}
                score={score}
                data={data}
                chartConfig={chartConfig}
                hoveredEvaluationId={hoveredEvaluationId}
              />
            ))}
          </div>
        </div>
        <ScrollEdgeFades scrollRef={scrollRef} />
      </div>
    </div>
  );
}

function ScoreCard({
  score,
  data,
  chartConfig,
  hoveredEvaluationId,
}: {
  score: string;
  data: ProgressionPoint[];
  chartConfig: ChartConfig;
  hoveredEvaluationId?: string;
}) {
  const rows: ScoreRow[] = data.map((p) => ({
    name: p.name,
    evaluationId: p.evaluationId,
    timestamp: p.timestamp,
    value:
      typeof p.values[score] === "number" && !isNaN(p.values[score] as number) ? (p.values[score] as number) : null,
  }));
  const color = chartConfig[score]?.color ?? "hsl(var(--chart-1))";
  const scoreConfig: ChartConfig = { value: { color, label: score } };

  // Rank: sort rows that have a numeric value desc; show 1-indexed rank of hovered eval.
  // Total denominator counts only rows with a value (null rows can't be ranked).
  const rank = (() => {
    if (!hoveredEvaluationId) return null;
    const ranked = rows.filter((r) => r.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const idx = ranked.findIndex((r) => r.evaluationId === hoveredEvaluationId);
    if (idx === -1) return null;
    return { position: idx + 1, total: ranked.length };
  })();

  return (
    <div
      className="flex h-full shrink-0 flex-col gap-2 rounded-[4px] border border-border bg-secondary p-3"
      style={{ width: CARD_WIDTH }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs leading-4 text-muted-foreground truncate">{score}</span>
        {rank && (
          <span className="text-xs leading-4 text-foreground tabular-nums shrink-0">
            Rank {rank.position}/{rank.total}
          </span>
        )}
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <ChartContainer config={scoreConfig} className="aspect-auto h-full w-full">
          <BarChart margin={{ top: 4, right: 4, bottom: 4, left: -16 }} data={rows} accessibilityLayer barSize="60%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="evaluationId" tick={false} tickLine={false} axisLine={false} height={4} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tickCount={4}
              width={36}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <ChartTooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_value, payload) => {
                    const row = payload?.[0]?.payload as ScoreRow | undefined;
                    return row?.name ?? "";
                  }}
                />
              }
            />
            <Bar dataKey="value" name={score} fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell
                  key={row.evaluationId}
                  fill={color}
                  fillOpacity={hoveredEvaluationId && row.evaluationId !== hoveredEvaluationId ? DIMMED_OPACITY : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
