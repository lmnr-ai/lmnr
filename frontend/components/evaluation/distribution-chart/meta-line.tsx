import { type EvaluationScoreAnalysis } from "@/lib/evaluation/types";

import { formatNumber, formatPercent } from "./utils";

interface MetaLineProps {
  analysis: EvaluationScoreAnalysis;
}

/**
 * The short stats row that sits above the chart. Per task spec:
 *   - Binary: total + pass rate (pass/fail counts)
 *   - Discrete: total + median + mean
 *   - Continuous: total + median + p25-p75
 *
 * Threshold is surfaced here too (when configured) so the user can see
 * what the green/red split is based on without reading the line
 * annotation on the chart.
 */
export default function MetaLine({ analysis }: MetaLineProps) {
  const { stats, type, passThreshold } = analysis;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        <span className="text-foreground font-mono tabular-nums">{stats.count}</span> datapoints
      </span>
      {type === "binary" && (
        <>
          <span>
            pass rate <span className="text-foreground font-mono tabular-nums">{formatPercent(stats.passRate)}</span>
          </span>
          <span>
            (<span className="text-success font-mono tabular-nums">{stats.passCount ?? 0}</span>
            {" / "}
            <span className="text-destructive font-mono tabular-nums">{stats.failCount ?? 0}</span>)
          </span>
        </>
      )}
      {type === "discrete" && (
        <>
          <span>
            median <span className="text-foreground font-mono tabular-nums">{formatNumber(stats.median)}</span>
          </span>
          <span>
            mean <span className="text-foreground font-mono tabular-nums">{formatNumber(stats.mean)}</span>
          </span>
        </>
      )}
      {type === "continuous" && (
        <>
          <span>
            median <span className="text-foreground font-mono tabular-nums">{formatNumber(stats.median)}</span>
          </span>
          <span>
            p25–p75{" "}
            <span className="text-foreground font-mono tabular-nums">
              {formatNumber(stats.p25)} – {formatNumber(stats.p75)}
            </span>
          </span>
        </>
      )}
      {passThreshold != null && type !== "binary" && (
        <span>
          threshold <span className="text-foreground font-mono tabular-nums">{formatNumber(passThreshold)}</span>
        </span>
      )}
    </div>
  );
}
