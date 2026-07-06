"use client";

import ScoreHoverChip from "@/components/evaluation/poc/score-hover-chips/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";

interface ScoreHoverChipsProps {
  scoreNames: string[];
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
  isLoading?: boolean;
  selectedScore?: string;
  onSelectScore: (name: string) => void;
}

/**
 * Compact-v1's resting score row (Round 6 addendum): chips only, no chevron
 * collapse toggle since the chips ARE the resting state now. Each chip grows
 * the classic card out of itself on hover (see ./chip.tsx).
 */
export default function ScoreHoverChips({
  scoreNames,
  allStatistics,
  allDistributions,
  comparedAllStatistics,
  comparedAllDistributions,
  isComparison,
  isLoading,
  selectedScore,
  onSelectScore,
}: ScoreHoverChipsProps) {
  if (isLoading) {
    return <Skeleton className="h-7 w-full rounded-[4px]" />;
  }

  const ordered = [...scoreNames].sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ordered.map((name) => (
        <ScoreHoverChip
          key={name}
          name={name}
          statistics={allStatistics?.[name] ?? null}
          distribution={allDistributions?.[name] ?? null}
          comparedStatistics={comparedAllStatistics?.[name] ?? null}
          comparedDistribution={comparedAllDistributions?.[name] ?? null}
          isComparison={isComparison}
          selected={name === selectedScore}
          onSelect={() => onSelectScore(name)}
        />
      ))}
    </div>
  );
}
