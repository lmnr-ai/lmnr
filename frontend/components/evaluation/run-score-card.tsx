"use client";

import { ArrowRight } from "lucide-react";

import { AggregationSelect, useAggregation } from "@/components/evaluation/metrics-panel/aggregation-select";
import {
  aggregateScalar,
  binaryCounts,
  isBinaryDistribution,
  pctChange,
} from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

interface RunScoreCardProps {
  scoreNames: string[];
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// Binary (pass/fail) scores read as a positive rate; the aggregation picker
// doesn't apply to them.
function scalarFor(
  isBinary: boolean,
  aggregation: Parameters<typeof aggregateScalar>[0],
  statistics: EvaluationScoreStatistics | null,
  distribution: EvaluationScoreDistributionBucket[] | null
): number | undefined {
  if (isBinary) {
    const counts = binaryCounts(distribution);
    return counts.total > 0 ? counts.positive / counts.total : statistics?.averageValue;
  }
  return aggregateScalar(aggregation, statistics, distribution);
}

// Whole-run aggregates for EVERY score, shown above the table: one tile per
// score in a horizontally-scrollable row, plus the aggregation picker that
// controls all non-binary tiles.
export default function RunScoreCard({
  scoreNames,
  allStatistics,
  allDistributions,
  comparedAllStatistics,
  comparedAllDistributions,
  isComparison,
}: RunScoreCardProps) {
  const [aggregation] = useAggregation();

  // The picker only affects non-binary tiles; hide it when there's nothing
  // for it to control (all scores binary, or no scores at all).
  const hasAggregatableScore = scoreNames.some(
    (scoreName) => !isBinaryDistribution(allDistributions?.[scoreName] ?? null)
  );

  return (
    <div className="flex flex-col gap-1.5 pr-2">
      {hasAggregatableScore && (
        <div className="flex items-center gap-1.5">
          <AggregationSelect />
        </div>
      )}
      <div className="flex gap-8 overflow-x-auto styled-scrollbar py-4">
        {scoreNames.map((scoreName) => {
          const distribution = allDistributions?.[scoreName] ?? null;
          const comparedDistribution = comparedAllDistributions?.[scoreName] ?? null;
          const isBinary = isBinaryDistribution(distribution);

          const cur = scalarFor(isBinary, aggregation, allStatistics?.[scoreName] ?? null, distribution);
          const cmp = isComparison
            ? scalarFor(isBinary, aggregation, comparedAllStatistics?.[scoreName] ?? null, comparedDistribution)
            : undefined;

          const validCur = isValidNumber(cur);
          const validCmp = isComparison && isValidNumber(cmp);
          const change = validCur && validCmp ? pctChange(cur!, cmp!) : null;
          const improved = change !== null && change >= 0;

          return (
            <div key={scoreName} className="flex shrink-0 flex-col gap-1">
              <span className="max-w-48 truncate text-xs font-medium text-secondary-foreground" title={scoreName}>
                {scoreName}
              </span>
              <div className="flex items-baseline gap-2 text-4xl">
                <div className="flex items-center gap-1 tabular-nums">
                  {validCmp && (
                    <>
                      <span className="font-medium leading-9 tracking-[-0.4px] text-muted-foreground">{fmt(cmp!)}</span>
                      <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                    </>
                  )}
                  <span className="font-medium leading-9 tracking-[-0.4px] text-foreground">
                    {validCur ? fmt(cur!) : "—"}
                  </span>
                </div>
                {change !== null && (
                  <span
                    className={cn(
                      "text-[12px] leading-[10px] tabular-nums whitespace-nowrap",
                      improved ? "text-success-bright" : "text-destructive"
                    )}
                  >
                    <DeltaTriangle direction={improved ? "up" : "down"} />
                    {Math.abs(change).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeltaTriangle({ direction }: { direction: "up" | "down" }) {
  const points = direction === "up" ? "4,0 8,7 0,7" : "0,0 8,0 4,7";
  return (
    <svg
      width="8"
      height="7"
      viewBox="0 0 8 7"
      className="fill-current inline-block align-baseline mr-1"
      aria-hidden="true"
    >
      <polygon points={points} />
    </svg>
  );
}
