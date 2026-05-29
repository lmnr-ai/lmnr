import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer } from "@/components/ui/chart";
import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

import { type ComparisonRow } from "./types";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

interface ScoreComparisonCardProps {
  scoreName: string;
  currentEvaluationId: string;
  evaluations: EvaluationType[];
  rows: ComparisonRow[];
}

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

function shortLabel(name: string, createdAt: string): string {
  if (name && name.length > 0) return name.length > 16 ? `${name.slice(0, 14)}…` : name;
  return new Date(createdAt).toLocaleDateString();
}

export default function ScoreComparisonCard({
  scoreName,
  currentEvaluationId,
  evaluations,
  rows,
}: ScoreComparisonCardProps) {
  // Build (run, value) points in chronological order (oldest -> newest, matching reading order).
  const data = useMemo(() => {
    const byEvalId = new Map<string, ComparisonRow>();
    for (const r of rows) byEvalId.set(r.evaluationId, r);
    const chronological = [...evaluations].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return chronological.map((e) => {
      const row = byEvalId.get(e.id);
      const v = row?.scores?.[scoreName];
      return {
        id: e.id,
        label: shortLabel(e.name, e.createdAt),
        createdAt: e.createdAt,
        evaluationName: e.name,
        value: isNum(v) ? v : null,
        isCurrent: e.id === currentEvaluationId,
      };
    });
  }, [evaluations, rows, scoreName, currentEvaluationId]);

  // Ranking — desc by value for rank-N/M display; median is the proper
  // interpolated middle (computed on an ascending sort so the math is
  // textbook). Only emit a ranking when there's a cohort to rank against
  // (N >= 2) — N=1 collapses to "1/1 above own median", which is meaningless.
  const ranking = useMemo(() => {
    const valued = data.filter((d): d is typeof d & { value: number } => isNum(d.value));
    if (valued.length < 2) return null;
    const desc = [...valued].sort((a, b) => b.value - a.value);
    const idx = desc.findIndex((d) => d.id === currentEvaluationId);
    if (idx === -1) return null;
    const asc = [...valued].sort((a, b) => a.value - b.value);
    const mid = (asc.length - 1) / 2;
    const lo = Math.floor(mid);
    const hi = Math.ceil(mid);
    const median = (asc[lo].value + asc[hi].value) / 2;
    const currentValue = desc[idx].value;
    return {
      rank: idx + 1,
      total: desc.length,
      currentValue,
      median,
      betterThanMedian: currentValue >= median,
    };
  }, [data, currentEvaluationId]);

  const currentPoint = data.find((d) => d.isCurrent);
  const currentValue = currentPoint?.value;

  return (
    <div className="flex flex-col gap-2 rounded-[4px] border border-border bg-secondary p-4 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs leading-4 text-muted-foreground truncate">{scoreName}</p>
        {ranking && (
          <span
            className={cn(
              "text-[11px] leading-3 tabular-nums whitespace-nowrap",
              ranking.betterThanMedian ? "text-success-bright" : "text-destructive"
            )}
          >
            rank {ranking.rank}/{ranking.total}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-[20px] font-medium leading-4 tracking-[-0.4px] text-foreground">
          {isNum(currentValue) ? fmtNum(currentValue) : "—"}
        </span>
        <span className="text-xs text-muted-foreground">in this run</span>
      </div>
      <div className="h-[120px] w-full">
        <ChartContainer config={{ value: { color: "hsl(var(--chart-1))" } }} className="h-full w-full">
          <LineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.[0]?.payload) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-md border border-border bg-background px-2 py-1 text-xs shadow-md">
                    <div className="text-foreground">{p.evaluationName || p.label}</div>
                    <div className="text-muted-foreground tabular-nums">
                      {isNum(p.value) ? fmtNum(p.value) : "no value"}
                    </div>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--chart-1))"
              strokeWidth={1.5}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
            {currentPoint && isNum(currentPoint.value) && (
              <ReferenceDot
                x={currentPoint.label}
                y={currentPoint.value}
                r={5}
                fill="hsl(var(--success))"
                stroke="hsl(var(--background))"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  );
}
