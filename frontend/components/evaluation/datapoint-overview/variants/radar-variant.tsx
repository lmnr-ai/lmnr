import { useMemo } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, Tooltip } from "recharts";

import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import { type VariantProps } from "../types";
import { buildSeries, cohortMean, computeRanking, currentValueFor, fmtNum, isNum, type RankingInfo } from "../utils";

/**
 * Radar chart: current run vs cohort mean across all scores on a single
 * polar plot. Score values are min-max normalised per axis (using the
 * full cohort range for that score) so axes of different magnitudes are
 * comparable on the same plot — without this, a score that ranges 0..1
 * is invisible next to one that ranges 0..1000.
 */
export default function RadarVariant({ scoreNames, currentEvaluationId, evaluations, rows }: VariantProps) {
  const { chartData, legend } = useMemo(() => {
    const data: { scoreName: string; current: number; cohort: number }[] = [];
    const legendInfo: {
      name: string;
      rawCurrent: number | null;
      rawCohort: number | null;
      min: number;
      max: number;
      ranking: RankingInfo | null;
    }[] = [];
    for (const name of scoreNames) {
      const series = buildSeries(name, currentEvaluationId, evaluations, rows);
      const cur = currentValueFor(series);
      const mean = cohortMean(series);
      const ranking = computeRanking(series, currentEvaluationId);
      const valued = series.filter((p): p is (typeof series)[number] & { value: number } => isNum(p.value));
      let min = Infinity;
      let max = -Infinity;
      for (const v of valued) {
        if (v.value < min) min = v.value;
        if (v.value > max) max = v.value;
      }
      const range = isFinite(min) && isFinite(max) ? max - min : 0;
      const norm = (v: number) => (range > 0 ? (v - min) / range : 0.5);
      data.push({
        scoreName: name,
        current: isNum(cur) ? norm(cur) : 0,
        cohort: isNum(mean) ? norm(mean) : 0,
      });
      legendInfo.push({
        name,
        rawCurrent: isNum(cur) ? cur : null,
        rawCohort: isNum(mean) ? mean : null,
        min: isFinite(min) ? min : 0,
        max: isFinite(max) ? max : 0,
        ranking,
      });
    }
    return { chartData: data, legend: legendInfo };
  }, [scoreNames, currentEvaluationId, evaluations, rows]);

  if (chartData.length < 3) {
    // Radar with <3 axes degenerates to a line; fall through with a note.
    return (
      <div className="rounded-[4px] border border-border bg-secondary p-6 text-xs text-muted-foreground">
        Radar needs at least 3 scores to be meaningful; this group has {chartData.length}.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 md:col-span-8 rounded-[4px] border border-border bg-secondary p-4">
        <p className="text-xs text-muted-foreground mb-2">This run vs cohort average (per-axis min-max scaled)</p>
        <div className="h-[380px] w-full">
          <ChartContainer
            config={{
              current: { color: "hsl(var(--chart-1))" },
              cohort: { color: "hsl(var(--muted-foreground))" },
            }}
            className="aspect-auto h-full w-full"
          >
            <RadarChart data={chartData} outerRadius="72%">
              <PolarGrid strokeDasharray="3 3" />
              <PolarAngleAxis dataKey="scoreName" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
              <Radar
                name="cohort"
                dataKey="cohort"
                stroke="hsl(var(--muted-foreground))"
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.12}
                isAnimationActive={false}
              />
              <Radar
                name="current"
                dataKey="current"
                stroke="hsl(var(--chart-1))"
                fill="hsl(var(--chart-1))"
                fillOpacity={0.3}
                isAnimationActive={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0]?.payload as { scoreName: string } | undefined;
                  if (!item) return null;
                  const info = legend.find((l) => l.name === item.scoreName);
                  if (!info) return null;
                  return (
                    <div className="rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-md">
                      <div className="text-foreground">{info.name}</div>
                      <div className="text-muted-foreground tabular-nums">
                        this run: {info.rawCurrent != null ? fmtNum(info.rawCurrent) : "—"}
                      </div>
                      <div className="text-muted-foreground tabular-nums">
                        cohort avg: {info.rawCohort != null ? fmtNum(info.rawCohort) : "—"}
                      </div>
                    </div>
                  );
                }}
              />
            </RadarChart>
          </ChartContainer>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-[hsl(var(--chart-1))]" />
            this run
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-muted-foreground" />
            cohort avg
          </span>
        </div>
      </div>

      {/* Compact per-score legend with raw values, since radar normalises */}
      <div className="col-span-12 md:col-span-4 flex flex-col gap-1">
        {legend.map((l) => {
          const r = l.ranking;
          return (
            <div key={l.name} className="rounded-[3px] border border-border bg-secondary px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground truncate">{l.name}</span>
                {r && (
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      r.betterThanMedian ? "text-success-bright" : "text-destructive"
                    )}
                  >
                    {r.rank}/{r.total}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 tabular-nums">
                <span className="text-sm font-medium text-foreground">
                  {l.rawCurrent != null ? fmtNum(l.rawCurrent) : "—"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  avg {l.rawCohort != null ? fmtNum(l.rawCohort) : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
