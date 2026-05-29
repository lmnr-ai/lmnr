import { useMemo } from "react";

import { cn } from "@/lib/utils";

import { type VariantProps } from "../types";
import { buildSeries, fmtNum, isNum } from "../utils";

/**
 * Table layout: one row per run in the group, one column per score.
 * Current run highlighted. Cells colour-coded by quantile within the
 * column so the eye can quickly see where this datapoint's run sits.
 */
export default function TableVariant({ scoreNames, currentEvaluationId, evaluations, rows }: VariantProps) {
  // For each score, compute the chronological series and per-column min/max for shading.
  const seriesByName = useMemo(() => {
    const m: Record<
      string,
      {
        byEvalId: Map<string, number>;
        min: number;
        max: number;
      }
    > = {};
    for (const name of scoreNames) {
      const series = buildSeries(name, currentEvaluationId, evaluations, rows);
      const byEvalId = new Map<string, number>();
      let min = Infinity;
      let max = -Infinity;
      for (const p of series) {
        if (!isNum(p.value)) continue;
        byEvalId.set(p.id, p.value);
        if (p.value < min) min = p.value;
        if (p.value > max) max = p.value;
      }
      m[name] = {
        byEvalId,
        min: isFinite(min) ? min : 0,
        max: isFinite(max) ? max : 1,
      };
    }
    return m;
  }, [scoreNames, currentEvaluationId, evaluations, rows]);

  const sortedEvals = useMemo(
    () => [...evaluations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [evaluations]
  );

  return (
    <div className="rounded-[4px] border border-border bg-secondary overflow-auto max-h-[60vh]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-secondary border-b border-border">
          <tr>
            <th className="text-left px-3 py-2 font-normal text-muted-foreground">Run</th>
            <th className="text-left px-3 py-2 font-normal text-muted-foreground w-[140px]">Created</th>
            {scoreNames.map((name) => (
              <th key={name} className="text-right px-3 py-2 font-normal text-muted-foreground">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedEvals.map((e) => {
            const isCurrent = e.id === currentEvaluationId;
            return (
              <tr
                key={e.id}
                className={cn(
                  "border-b border-border last:border-b-0",
                  isCurrent ? "bg-muted/60" : "hover:bg-muted/20 transition-colors"
                )}
              >
                <td className={cn("px-3 py-2 truncate max-w-[220px]", isCurrent && "font-medium")}>
                  {e.name || e.id.slice(0, 8)}
                </td>
                <td className="px-3 py-2 text-muted-foreground tabular-nums">
                  {new Date(e.createdAt).toLocaleDateString()}
                </td>
                {scoreNames.map((name) => {
                  const info = seriesByName[name];
                  const v = info?.byEvalId.get(e.id);
                  const ratio =
                    isNum(v) && info && info.max > info.min ? (v - info.min) / (info.max - info.min) : null;
                  // Color intensity: 0 = neutral, 1 = strongest. Use opacity on a primary tint.
                  const bg = ratio != null ? `hsl(var(--chart-1) / ${(0.08 + ratio * 0.32).toFixed(2)})` : undefined;
                  return (
                    <td
                      key={name}
                      className="px-3 py-2 text-right tabular-nums"
                      style={bg ? { backgroundColor: bg } : undefined}
                    >
                      {isNum(v) ? fmtNum(v) : <span className="text-muted-foreground">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
