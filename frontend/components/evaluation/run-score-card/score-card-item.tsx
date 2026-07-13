"use client";

import { ArrowRight } from "lucide-react";

import {
  aggregateScalar,
  type AggregationKind,
  binaryCounts,
  isBinaryDistribution,
  pctChange,
} from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

interface ScoreCardItemProps {
  name: string;
  aggregation: AggregationKind;
  statistics: EvaluationScoreStatistics | null;
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedStatistics: EvaluationScoreStatistics | null;
  comparedDistribution: EvaluationScoreDistributionBucket[] | null;
  isComparison?: boolean;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// Binary (pass/fail) scores read as a positive rate; the aggregation picker
// doesn't apply to them.
function scalarFor(
  isBinary: boolean,
  aggregation: AggregationKind,
  statistics: EvaluationScoreStatistics | null,
  distribution: EvaluationScoreDistributionBucket[] | null
): number | undefined {
  if (isBinary) {
    const counts = binaryCounts(distribution);
    return counts.total > 0 ? counts.positive / counts.total : statistics?.averageValue;
  }
  return aggregateScalar(aggregation, statistics, distribution);
}

// One score's whole-run aggregate rendered as a bordered card: the score name
// on top, the big aggregate number below, and (in comparison mode) the compared
// value + percent delta.
export default function ScoreCardItem({
  name,
  aggregation,
  statistics,
  distribution,
  comparedStatistics,
  comparedDistribution,
  isComparison,
}: ScoreCardItemProps) {
  const isBinary = isBinaryDistribution(distribution);

  const cur = scalarFor(isBinary, aggregation, statistics, distribution);
  const cmp = isComparison ? scalarFor(isBinary, aggregation, comparedStatistics, comparedDistribution) : undefined;

  const validCur = isValidNumber(cur);
  const validCmp = isComparison && isValidNumber(cmp);
  const change = validCur && validCmp ? pctChange(cur!, cmp!) : null;
  const improved = change !== null && change >= 0;

  return (
    <div className="flex min-w-[140px] shrink-0 flex-col gap-2 rounded-lg border bg-secondary px-4 py-3">
      <span className="truncate text-xs font-medium text-muted-foreground" title={name}>
        {name}
      </span>
      <div className="flex items-baseline gap-2">
        <div className="flex items-center gap-1 text-4xl tabular-nums">
          {validCmp && (
            <>
              <span className="font-medium leading-none tracking-[-0.4px] text-muted-foreground">{fmt(cmp!)}</span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </>
          )}
          <span className="font-medium leading-none tracking-[-0.4px] text-foreground">
            {validCur ? fmt(cur!) : "—"}
          </span>
        </div>
        {change !== null && (
          <span
            className={cn(
              "whitespace-nowrap text-[12px] leading-[10px] tabular-nums",
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
}

function DeltaTriangle({ direction }: { direction: "up" | "down" }) {
  const points = direction === "up" ? "4,0 8,7 0,7" : "0,0 8,0 4,7";
  return (
    <svg
      width="8"
      height="7"
      viewBox="0 0 8 7"
      className="mr-1 inline-block fill-current align-baseline"
      aria-hidden="true"
    >
      <polygon points={points} />
    </svg>
  );
}
