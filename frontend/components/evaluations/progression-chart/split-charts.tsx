import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "../../ui/chart";
import { type ProgressionPoint } from "./shared";

interface SplitChartsProps {
  data: ProgressionPoint[];
  scores: string[];
  visibleScores: string[];
  chartConfig: ChartConfig;
}

interface ScoreRow {
  name: string;
  evaluationId: string;
  timestamp: string;
  value: number | null;
}

export default function SplitCharts({ data, scores, visibleScores, chartConfig }: SplitChartsProps) {
  const visible = scores.filter((s) => visibleScores.includes(s));
  if (visible.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Select a score to display
      </div>
    );
  }
  return (
    <div className="grid h-full auto-rows-fr gap-3 overflow-y-auto pr-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((score) => (
        <ScorePanel key={score} score={score} data={data} chartConfig={chartConfig} />
      ))}
    </div>
  );
}

function ScorePanel({
  score,
  data,
  chartConfig,
}: {
  score: string;
  data: ProgressionPoint[];
  chartConfig: ChartConfig;
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

  return (
    <div className="flex h-full min-h-[140px] flex-col rounded border bg-background p-2">
      <div className="px-1 pb-1 text-xs font-medium truncate" style={{ color }}>
        {score}
      </div>
      <div className="flex-1 min-h-0">
        <ChartContainer config={scoreConfig} className="aspect-auto h-full w-full">
          <BarChart margin={{ top: 4, right: 6, bottom: 4, left: -16 }} data={rows} accessibilityLayer barSize="60%">
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
            <Bar dataKey="value" name={score} fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
