import { ArrowRight } from "lucide-react";
import { type ReactNode } from "react";

import SmartViz from "@/components/evaluation/metrics-panel/smart-viz";
import {
  aggregateScalar,
  type AggregationKind,
  DEFAULT_AGGREGATION,
  pctChange,
} from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

interface HistogramCardProps {
  name: string;
  statistics: EvaluationScoreStatistics | null;
  comparedStatistics?: EvaluationScoreStatistics | null;
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedDistribution?: EvaluationScoreDistributionBucket[] | null;
  isComparison?: boolean;
  aggregation?: AggregationKind;
  /** Replaces the name label (e.g. a score-picker dropdown for the run card). */
  titleNode?: ReactNode;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// Recovered from git HEAD (classic/pre-session layout): 156px card, graph fills
// the remaining height below the label+value block. v0's mini card lives in
// the parent metrics-panel/ dir and is untouched by this recovery.
export default function HistogramCard({
  name,
  statistics,
  comparedStatistics,
  distribution,
  comparedDistribution,
  isComparison,
  aggregation = DEFAULT_AGGREGATION,
  titleNode,
}: HistogramCardProps) {
  const cur = aggregateScalar(aggregation, statistics, distribution);
  const cmp = aggregateScalar(aggregation, comparedStatistics, comparedDistribution);
  const validAvg = isValidNumber(cur);
  const validC = isComparison && isValidNumber(cmp);
  const change = validAvg && validC ? pctChange(cur!, cmp!) : null;
  const improved = change !== null && change >= 0;

  return (
    <div className="group flex h-full w-full flex-col gap-2 rounded-[4px] border border-border bg-secondary pt-3">
      <div className="flex flex-col gap-1 px-4">
        {titleNode ?? <p className="text-xs leading-4 text-muted-foreground truncate">{name}</p>}
        <div className="flex items-baseline gap-2">
          <div className="flex items-center gap-1 tabular-nums">
            {validC && (
              <>
                <span className="text-2xl font-medium leading-6 tracking-[-0.4px] text-muted-foreground">
                  {fmt(cmp!)}
                </span>
                <ArrowRight className="size-3 text-muted-foreground shrink-0" />
              </>
            )}
            <span className="text-2xl font-medium leading-6 tracking-[-0.4px] text-foreground">
              {validAvg ? fmt(cur!) : "—"}
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
      <div className="flex-1 min-h-0 min-w-0 pr-4">
        <SmartViz
          distribution={distribution}
          comparedDistribution={isComparison ? comparedDistribution : null}
          isComparison={isComparison}
          className="h-full w-full"
        />
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
