"use client";

import { useAggregation } from "@/components/evaluation/metrics-panel/aggregation-select";
import BinaryCard from "@/components/evaluation/metrics-panel/binary-card";
import HistogramCard from "@/components/evaluation/metrics-panel/histogram-card";
import { isBinaryDistribution } from "@/components/evaluation/metrics-panel/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";

interface AggregateScoreCardsProps {
  scoreNames: string[];
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
  isLoading?: boolean;
}

/**
 * Horizontal strip of one distribution card per score (aggregate / whole-run
 * view, shown while no trace is open). `scroll-fade-x` (globals.css) masks the
 * left/right edges based on scroll position. Boolean scores use BinaryCard (the
 * pass-rate bar), numeric scores use HistogramCard (distribution).
 */
export default function AggregateScoreCards({
  scoreNames,
  allStatistics,
  allDistributions,
  comparedAllStatistics,
  comparedAllDistributions,
  isComparison,
  isLoading,
}: AggregateScoreCardsProps) {
  const [aggregation] = useAggregation();

  if (isLoading) {
    return <Skeleton className="h-[156px] w-full rounded-[4px]" />;
  }

  const ordered = [...scoreNames].sort((a, b) => a.localeCompare(b));

  return (
    <div className="scroll-fade-x overflow-x-auto">
      {/* SCORE_CARD_HEIGHT: keep in sync with run-score-card.tsx so the aggregate
          strip and the collapsed single card are the same height. */}
      <div className="flex gap-2">
        {ordered.map((name) => {
          const distribution = allDistributions?.[name] ?? null;
          const common = {
            name,
            statistics: allStatistics?.[name] ?? null,
            distribution,
            comparedDistribution: comparedAllDistributions?.[name] ?? null,
            isComparison,
          };
          return (
            <div key={name} className="h-[156px] w-[300px] shrink-0">
              {isBinaryDistribution(distribution) ? (
                <BinaryCard {...common} />
              ) : (
                <HistogramCard {...common} aggregation={aggregation} comparedStatistics={comparedAllStatistics?.[name] ?? null} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
