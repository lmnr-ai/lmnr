import { ArrowLeft, ArrowRight } from "lucide-react";

import { type BinaryStyle } from "@/components/evaluation/metrics-panel/binary-viz";
import SmartViz from "@/components/evaluation/metrics-panel/smart-viz";
import { pctChange } from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

interface ExpandedDetailProps {
  name: string;
  statistics: EvaluationScoreStatistics | null;
  comparedStatistics?: EvaluationScoreStatistics | null;
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedDistribution?: EvaluationScoreDistributionBucket[] | null;
  isComparison?: boolean;
  binaryStyle?: BinaryStyle;
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
  binaryStyle,
  onBack,
}: ExpandedDetailProps) {
  const avg = statistics?.averageValue;
  const cAvg = comparedStatistics?.averageValue;
  const validAvg = isValidNumber(avg);
  const validC = isValidNumber(cAvg);
  const change = validAvg && validC ? pctChange(avg, cAvg) : null;

  return (
    <div className="h-full flex flex-col p-3 gap-2 overflow-hidden">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="p-1 -ml-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <ArrowLeft className="size-4" />
        </button>
        <p className="text-base text-foreground truncate">{name}</p>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex items-center gap-2 tabular-nums">
          {isComparison && validC && (
            <>
              <span className="text-3xl font-medium leading-7 tracking-[-0.6px] text-muted-foreground">
                {fmt(cAvg)}
              </span>
              <ArrowRight className="size-5 text-muted-foreground shrink-0" />
            </>
          )}
          <span className="text-3xl font-medium leading-7 tracking-[-0.6px] text-foreground">
            {validAvg ? fmt(avg) : "—"}
          </span>
        </div>
        {change !== null && (
          <span
            className={cn(
              "flex items-center gap-0.5 self-end pb-1 text-sm tabular-nums",
              change >= 0 ? "text-success-bright" : "text-destructive"
            )}
          >
            <DeltaTriangle direction={change >= 0 ? "up" : "down"} />
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 min-w-0">
        <SmartViz
          scoreName={name}
          distribution={distribution}
          comparedDistribution={comparedDistribution}
          isComparison={isComparison}
          binaryStyle={binaryStyle}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}

function DeltaTriangle({ direction }: { direction: "up" | "down" }) {
  const points = direction === "up" ? "4,0 8,7 0,7" : "0,0 8,0 4,7";
  return (
    <svg width="10" height="9" viewBox="0 0 8 7" className="fill-current shrink-0" aria-hidden="true">
      <polygon points={points} />
    </svg>
  );
}
