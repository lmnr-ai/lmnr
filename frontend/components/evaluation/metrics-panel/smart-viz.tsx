import Chart from "@/components/evaluation/chart";
import CompareChart from "@/components/evaluation/compare-chart";
import BinaryViz, { type BinaryStyle } from "@/components/evaluation/metrics-panel/binary-viz";
import { isBinaryDistribution } from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

interface SmartVizProps {
  scoreName?: string;
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedDistribution?: EvaluationScoreDistributionBucket[] | null;
  isComparison?: boolean;
  isLoading?: boolean;
  binaryStyle?: BinaryStyle;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function SmartViz({
  scoreName,
  distribution,
  comparedDistribution,
  isComparison,
  isLoading,
  binaryStyle = "dual",
  size = "lg",
  className,
}: SmartVizProps) {
  const useBinary = isBinaryDistribution(distribution) && (!isComparison || isBinaryDistribution(comparedDistribution));

  if (useBinary) {
    return (
      <BinaryViz
        distribution={distribution}
        comparedDistribution={isComparison ? comparedDistribution : null}
        size={size}
        style={binaryStyle}
        className={className}
      />
    );
  }

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
    />
  );
}
