import { useRef } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import ScrollEdgeFades from "@/components/ui/scroll-edge-fades";

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "../../ui/chart";
import CombinedChart from "./combined-chart";
import CombinedLegend from "./combined-legend";
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

const COMBINED_WIDTH = 400;
const COLUMN_WIDTH = 300;
const CARDS_PER_COLUMN = 2;
const GAP = 12;
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

  // Group visible scores into pairs (each column stacks CARDS_PER_COLUMN cards).
  const columns: string[][] = [];
  for (let i = 0; i < visible.length; i += CARDS_PER_COLUMN) {
    columns.push(visible.slice(i, i + CARDS_PER_COLUMN));
  }

  const minWidth = COMBINED_WIDTH + columns.length * COLUMN_WIDTH + (columns.length + 1) * GAP;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="h-full w-full overflow-x-auto overflow-y-hidden">
          <div className="flex h-full" style={{ minWidth, gap: GAP }}>
            <div
              className="flex h-full shrink-0 gap-2 rounded-[4px] border border-border bg-secondary p-3"
              style={{ width: COMBINED_WIDTH }}
            >
              <CombinedLegend
                scores={scores}
                visibleScores={visibleScores}
                chartConfig={chartConfig}
                className="w-24 shrink-0 overflow-y-auto"
              />
              <div className="min-w-0 flex-1">
                <CombinedChart
                  data={data}
                  scores={scores}
                  visibleScores={visibleScores}
                  chartConfig={chartConfig}
                  hoveredEvaluationId={hoveredEvaluationId}
                  fillParent
                  showXAxisLabels={false}
                />
              </div>
            </div>
            {columns.map((col, idx) => (
              <div key={idx} className="flex h-full shrink-0 flex-col" style={{ width: COLUMN_WIDTH, gap: GAP }}>
                {col.map((score) => (
                  <ScoreCard
                    key={score}
                    score={score}
                    data={data}
                    chartConfig={chartConfig}
                    hoveredEvaluationId={hoveredEvaluationId}
                  />
                ))}
              </div>
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

  const rank = (() => {
    if (!hoveredEvaluationId) return null;
    const ranked = rows.filter((r) => r.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const idx = ranked.findIndex((r) => r.evaluationId === hoveredEvaluationId);
    if (idx === -1) return null;
    return { position: idx + 1, total: ranked.length };
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-[4px] border border-border bg-secondary p-3">
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
