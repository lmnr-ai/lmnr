import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer } from "../../ui/chart";
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

function ScorePanel({ score, data, chartConfig }: { score: string; data: ProgressionPoint[]; chartConfig: ChartConfig }) {
  const rows: ScoreRow[] = data.map((p) => ({
    name: p.name,
    evaluationId: p.evaluationId,
    timestamp: p.timestamp,
    value: typeof p.values[score] === "number" && !isNaN(p.values[score] as number) ? (p.values[score] as number) : null,
  }));
  const color = chartConfig[score]?.color ?? "hsl(var(--chart-1))";

  return (
    <div className="flex h-full min-h-[140px] flex-col rounded border bg-background p-2">
      <div className="px-1 pb-1 text-xs font-medium truncate" style={{ color }}>
        {score}
      </div>
      <div className="flex-1 min-h-0">
        <ChartContainer config={{ [score]: { color, label: score } }} className="aspect-auto h-full w-full">
          <LineChart margin={{ top: 4, right: 6, bottom: 4, left: -16 }} data={rows} accessibilityLayer>
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
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))" }}
              content={((props: any) => <SplitTooltip {...props} score={score} color={color} />) as any}
            />
            <Line
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              dot={{ r: 2, stroke: color, fill: color }}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  );
}

function SplitTooltip({
  active,
  payload,
  score,
  color,
}: {
  active?: boolean;
  payload?: { payload?: ScoreRow }[];
  score: string;
  color: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  if (!row) return null;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <div className="font-medium mb-1 truncate max-w-60">{row.name}</div>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-sm shrink-0" style={{ background: color }} />
        <span className="text-muted-foreground">{score}</span>
        <span className="ml-auto font-mono">{row.value === null ? "—" : formatNumber(row.value)}</span>
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
