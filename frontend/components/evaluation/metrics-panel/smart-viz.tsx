import Chart from "@/components/evaluation/chart";
import CompareChart from "@/components/evaluation/compare-chart";
import { type EvaluationScoreDistributionBucket } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

interface SmartVizProps {
  scoreName?: string;
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedDistribution?: EvaluationScoreDistributionBucket[] | null;
  isComparison?: boolean;
  isLoading?: boolean;
  className?: string;
  /** Bucket to spotlight (others dim). Single-distribution chart only. */
  highlightIndex?: number | null;
}

export default function SmartViz({
  scoreName,
  distribution,
  comparedDistribution,
  isComparison,
  isLoading,
  className,
  highlightIndex,
}: SmartVizProps) {
  if (isComparison) {
    return (
      <CompareChart
        distribution={distribution}
        comparedDistribution={comparedDistribution ?? null}
        isLoading={isLoading}
        className={cn("w-full", className)}
      />
    );
  }

  return (
    <Chart
      scoreName={scoreName}
      distribution={distribution}
      isLoading={isLoading}
      className={cn("w-full", className)}
      highlightIndex={highlightIndex}
    />
  );
}
