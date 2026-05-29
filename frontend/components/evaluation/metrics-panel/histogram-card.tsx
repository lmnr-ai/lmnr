import { ArrowRight } from "lucide-react";

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
  onClick?: () => void;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function HistogramCard({
  name,
  statistics,
  comparedStatistics,
  distribution,
  comparedDistribution,
  isComparison,
  aggregation = DEFAULT_AGGREGATION,
  onClick,
}: HistogramCardProps) {
  const cur = aggregateScalar(aggregation, statistics, distribution);
  const cmp = aggregateScalar(aggregation, comparedStatistics, comparedDistribution);
  const validAvg = isValidNumber(cur);
  const validC = isComparison && isValidNumber(cmp);
  const change = validAvg && validC ? pctChange(cur!, cmp!) : null;
  const improved = change !== null && change >= 0;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "group h-[156px] w-full cursor-pointer transition-colors rounded-[4px] border border-border bg-secondary hover:bg-muted/40",
        "flex flex-col gap-4"
      )}
    >
      <div className="flex flex-col gap-2 pt-4 px-5">
        <p className="text-xs leading-4 text-muted-foreground truncate">{name}</p>
        <div className="flex items-baseline gap-2">
          <div className="flex items-center gap-1 tabular-nums">
            {validC && (
              <>
                <span className="text-[20px] font-medium leading-4 tracking-[-0.4px] text-muted-foreground">
                  {fmt(cmp!)}
                </span>
                <ArrowRight className="size-3 text-muted-foreground shrink-0" />
              </>
            )}
            <span className="text-[20px] font-medium leading-4 tracking-[-0.4px] text-foreground">
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
      <div className="flex-1 min-h-0 min-w-0 pr-5 pl-0 pb-0">
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
