import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import { type VariantProps } from "../types";
import { buildSeries, computeRanking, currentValueFor, fmtNum, isNum } from "../utils";

export default function HeroVariant({ scoreNames, currentEvaluationId, evaluations, rows }: VariantProps) {
  const [selected, setSelected] = useState(scoreNames[0]);
  const activeScore = scoreNames.includes(selected) ? selected : scoreNames[0];

  // Build series for every score once — reused by both the sidebar mini values and the hero chart.
  const seriesByName = useMemo(() => {
    const m: Record<string, ReturnType<typeof buildSeries>> = {};
    for (const name of scoreNames) {
      m[name] = buildSeries(name, currentEvaluationId, evaluations, rows);
    }
    return m;
  }, [scoreNames, currentEvaluationId, evaluations, rows]);

  const activeSeries = useMemo(
    () => (activeScore ? (seriesByName[activeScore] ?? []) : []),
    [activeScore, seriesByName]
  );
  const activeRanking = useMemo(
    () => computeRanking(activeSeries, currentEvaluationId),
    [activeSeries, currentEvaluationId]
  );
  const activeCurrentValue = currentValueFor(activeSeries);
  const activeCurrentPoint = activeSeries.find((d) => d.isCurrent);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Sidebar: dense list of scores, click to switch. */}
      <div className="col-span-12 md:col-span-3 flex flex-col gap-1">
        {scoreNames.map((name) => {
          const s = seriesByName[name] ?? [];
          const v = currentValueFor(s);
          const r = computeRanking(s, currentEvaluationId);
          const isActive = name === activeScore;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSelected(name)}
              className={cn(
                "flex items-baseline justify-between gap-2 px-3 py-2 rounded-[3px] text-left transition-colors",
                "border border-transparent",
                isActive
                  ? "bg-muted/60 border-border"
                  : "hover:bg-muted/30"
              )}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-muted-foreground truncate">{name}</span>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {isNum(v) ? fmtNum(v) : "—"}
                </span>
              </div>
              {r && (
                <span
                  className={cn(
                    "text-[10px] tabular-nums whitespace-nowrap",
                    r.betterThanMedian ? "text-success-bright" : "text-destructive"
                  )}
                >
                  {r.rank}/{r.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hero chart */}
      <div className="col-span-12 md:col-span-9 flex flex-col gap-3 rounded-[4px] border border-border bg-secondary p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-foreground">{activeScore ?? "—"}</p>
          {activeRanking && (
            <span
              className={cn(
                "text-xs tabular-nums",
                activeRanking.betterThanMedian ? "text-success-bright" : "text-destructive"
              )}
            >
              rank {activeRanking.rank}/{activeRanking.total} (median {fmtNum(activeRanking.median)})
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-[32px] font-medium leading-8 tracking-[-0.5px] text-foreground">
            {isNum(activeCurrentValue) ? fmtNum(activeCurrentValue) : "—"}
          </span>
          <span className="text-xs text-muted-foreground">in this run</span>
        </div>
        <div className="h-[260px] w-full">
          <ChartContainer
            config={{ value: { color: "hsl(var(--chart-1))" } }}
            className="aspect-auto h-full w-full"
          >
            <LineChart data={activeSeries} margin={{ top: 10, right: 20, bottom: 4, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]?.payload) return null;
                  const p = payload[0].payload as (typeof activeSeries)[number];
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
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
              {activeCurrentPoint && isNum(activeCurrentPoint.value) && (
                <ReferenceDot
                  x={activeCurrentPoint.label}
                  y={activeCurrentPoint.value}
                  r={6}
                  fill="hsl(var(--success))"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
}
