import { useMemo } from "react";

import { type BinaryStyle } from "@/components/evaluation/metrics-panel/binary-viz";
import MetricRow, { type MetricRowDensity } from "@/components/evaluation/metrics-panel/metric-row";
import { type MetricsSortDir, type MetricsSortKey, sortScoreNames } from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

interface GridViewProps {
  scoreNames: string[];
  selectedScore?: string;
  setSelectedScore: (s: string) => void;
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
  density?: MetricRowDensity;
  binaryStyle?: BinaryStyle;
  sortKey?: MetricsSortKey;
  sortDir?: MetricsSortDir;
  onExpand?: (name: string) => void;
}

export default function GridView({
  scoreNames,
  selectedScore,
  setSelectedScore,
  allStatistics,
  allDistributions,
  comparedAllStatistics,
  comparedAllDistributions,
  isComparison,
  density = "full",
  binaryStyle,
  sortKey = "name",
  sortDir = "asc",
  onExpand,
}: GridViewProps) {
  const ordered = useMemo(
    () => sortScoreNames(scoreNames, sortKey, sortDir, allStatistics, comparedAllStatistics, allDistributions),
    [scoreNames, sortKey, sortDir, allStatistics, comparedAllStatistics, allDistributions]
  );

  // In grid view, clicking a card drills in directly — selection state is unused here.
  const handleClick = (name: string) => {
    setSelectedScore(name);
    onExpand?.(name);
  };

  return (
    <div className="h-full overflow-y-auto p-3">
      <div
        className={cn(
          "grid gap-2",
          density === "compact"
            ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-6"
            : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        )}
      >
        {ordered.map((name) => (
          <MetricRow
            key={name}
            name={name}
            statistics={allStatistics?.[name] ?? null}
            comparedStatistics={comparedAllStatistics?.[name] ?? null}
            distribution={allDistributions?.[name] ?? null}
            comparedDistribution={comparedAllDistributions?.[name] ?? null}
            isComparison={isComparison}
            selected={name === selectedScore}
            onClick={() => handleClick(name)}
            density={density}
            binaryStyle={binaryStyle}
          />
        ))}
      </div>
    </div>
  );
}
