import { ArrowLeft, ArrowRight } from "lucide-react";

import SmartViz from "@/components/evaluation/metrics-panel/smart-viz";
import {
  aggregateScalar,
  type AggregationKind,
  DEFAULT_AGGREGATION,
  pctChange,
} from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

interface ExpandedDetailProps {
  name: string;
  statistics: EvaluationScoreStatistics | null;
  comparedStatistics?: EvaluationScoreStatistics | null;
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedDistribution?: EvaluationScoreDistributionBucket[] | null;
  isComparison?: boolean;
  aggregation?: AggregationKind;
  onBack: () => void;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function ExpandedDetail({
  name,
  statistics,
  comparedStatistics,
  distribution,
  comparedDistribution,
  isComparison,
  aggregation = DEFAULT_AGGREGATION,
  onBack,
}: ExpandedDetailProps) {
  const cur = aggregateScalar(aggregation, statistics, distribution);
  const cmp = aggregateScalar(aggregation, comparedStatistics, comparedDistribution);
  const validAvg = isValidNumber(cur);
  const validC = isValidNumber(cmp);
  const change = validAvg && validC ? pctChange(cur!, cmp!) : null;
  const improved = change !== null && change >= 0;

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden pt-4 pl-5 pr-2 pb-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="p-1 -ml-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <ArrowLeft className="size-4" />
        </button>
        <p className="text-xs leading-4 text-muted-foreground truncate">{name}</p>
      </div>

      <div className="flex-1 min-h-0 flex gap-6 items-center">
        <div className="shrink-0 flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <div className="flex items-center gap-1 tabular-nums">
              {isComparison && validC && (
                <>
                  <span className="text-[28px] font-medium leading-6 tracking-[-0.6px] text-muted-foreground">
                    {fmt(cmp!)}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                </>
              )}
              <span className="text-[28px] font-medium leading-6 tracking-[-0.6px] text-foreground">
                {validAvg ? fmt(cur!) : "—"}
              </span>
            </div>
            {change !== null && (
              <span
                className={cn(
                  "text-[13px] leading-3 tabular-nums whitespace-nowrap",
                  improved ? "text-success-bright" : "text-destructive"
                )}
              >
                <DeltaTriangle direction={improved ? "up" : "down"} />
                {Math.abs(change).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0 h-full pb-2">
          <SmartViz
            scoreName={name}
            distribution={distribution}
            comparedDistribution={comparedDistribution}
            isComparison={isComparison}
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  );
}

function DeltaTriangle({ direction }: { direction: "up" | "down" }) {
  const points = direction === "up" ? "4,0 8,7 0,7" : "0,0 8,0 4,7";
  return (
    <svg
      width="10"
      height="9"
      viewBox="0 0 8 7"
      className="fill-current inline-block align-baseline mr-1"
      aria-hidden="true"
    >
      <polygon points={points} />
    </svg>
  );
}
