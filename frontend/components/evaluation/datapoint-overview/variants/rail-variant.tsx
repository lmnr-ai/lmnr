import { useMemo } from "react";
import { Line, LineChart, ReferenceDot, ResponsiveContainer, YAxis } from "recharts";

import { cn } from "@/lib/utils";

import { type VariantProps } from "../types";
import { buildSeries, computeRanking, currentValueFor, fmtNum, isNum, type SeriesPoint } from "../utils";

interface RowProps {
  scoreName: string;
  series: SeriesPoint[];
  currentEvaluationId: string;
}

function SparklineRow({ scoreName, series, currentEvaluationId }: RowProps) {
  const ranking = computeRanking(series, currentEvaluationId);
  const cur = currentValueFor(series);
  const currentPoint = series.find((d) => d.isCurrent);

  const valuedDomain = useMemo(() => {
    const valued = series.filter((d): d is SeriesPoint & { value: number } => isNum(d.value));
    if (valued.length === 0) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const v of valued) {
      if (v.value < min) min = v.value;
      if (v.value > max) max = v.value;
    }
    if (min === max) {
      const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
      return [min - pad, max + pad];
    }
    return [min, max];
  }, [series]);

  return (
    <div className="grid grid-cols-[160px_1fr_140px_60px] items-center gap-3 px-3 py-2 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
      <div className="text-xs text-muted-foreground truncate" title={scoreName}>
        {scoreName}
      </div>
      <div className="h-8 w-full">
        <ResponsiveContainer width="100%" height={32}>
          <LineChart data={series} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <YAxis hide domain={valuedDomain} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--chart-1))"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {currentPoint && isNum(currentPoint.value) && (
              <ReferenceDot
                x={currentPoint.label}
                y={currentPoint.value}
                r={3}
                fill="hsl(var(--success))"
                stroke="hsl(var(--background))"
                strokeWidth={1.5}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-baseline gap-2 tabular-nums text-foreground">
        <span className="text-sm font-medium">{isNum(cur) ? fmtNum(cur) : "—"}</span>
        {ranking && (
          <span className="text-[10px] text-muted-foreground">vs median {fmtNum(ranking.median)}</span>
        )}
      </div>
      <div className="text-right">
        {ranking && (
          <span
            className={cn(
              "text-[11px] tabular-nums",
              ranking.betterThanMedian ? "text-success-bright" : "text-destructive"
            )}
          >
            {ranking.rank}/{ranking.total}
          </span>
        )}
      </div>
    </div>
  );
}

export default function RailVariant({ scoreNames, currentEvaluationId, evaluations, rows }: VariantProps) {
  const seriesByName = useMemo(() => {
    const m: Record<string, SeriesPoint[]> = {};
    for (const name of scoreNames) m[name] = buildSeries(name, currentEvaluationId, evaluations, rows);
    return m;
  }, [scoreNames, currentEvaluationId, evaluations, rows]);

  // Sort by rank ascending (best first); fall back to alphabetical for null ranks.
  const sorted = useMemo(
    () =>
      [...scoreNames].sort((a, b) => {
        const ra = computeRanking(seriesByName[a] ?? [], currentEvaluationId);
        const rb = computeRanking(seriesByName[b] ?? [], currentEvaluationId);
        if (ra && rb) return ra.rank - rb.rank;
        if (ra) return -1;
        if (rb) return 1;
        return a.localeCompare(b);
      }),
    [scoreNames, seriesByName, currentEvaluationId]
  );

  return (
    <div className="rounded-[4px] border border-border bg-secondary overflow-hidden">
      {sorted.map((name) => (
        <SparklineRow
          key={name}
          scoreName={name}
          series={seriesByName[name] ?? []}
          currentEvaluationId={currentEvaluationId}
        />
      ))}
    </div>
  );
}
