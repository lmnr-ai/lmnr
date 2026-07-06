"use client";

import { useState } from "react";

import BinaryCard from "@/components/evaluation/metrics-panel/classic/binary-card";
import HistogramCard from "@/components/evaluation/metrics-panel/classic/histogram-card";
import { isBinaryDistribution } from "@/components/evaluation/metrics-panel/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";

interface RunScoreCardProps {
  scoreNames: string[];
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
}

/**
 * The whole-run aggregate for ONE score, shown above the table when a trace is
 * open (the horizontal strip collapses to this once space is tight). A score
 * picker replaces the card's name label; the body reuses the same distribution
 * card as the strip — BinaryCard (pass-rate bar) for boolean, HistogramCard for
 * numeric — so the aggregate reads identically, just scoped to the picked score.
 */
export default function RunScoreCard({
  scoreNames,
  allStatistics,
  allDistributions,
  comparedAllStatistics,
  comparedAllDistributions,
  isComparison,
}: RunScoreCardProps) {
  const [selected, setSelected] = useState<string>(scoreNames[0]);
  const active = selected && scoreNames.includes(selected) ? selected : scoreNames[0];

  const dropdown = (
    <Select value={active} onValueChange={setSelected}>
      <SelectTrigger className="h-7 w-fit gap-1 bg-secondary text-xs font-medium text-secondary-foreground">
        <SelectValue placeholder="Select score" />
      </SelectTrigger>
      <SelectContent>
        {scoreNames.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const distribution = allDistributions?.[active] ?? null;
  const common = {
    name: active,
    statistics: allStatistics?.[active] ?? null,
    distribution,
    comparedDistribution: comparedAllDistributions?.[active] ?? null,
    isComparison,
    titleNode: dropdown,
  };

  // h-[156px]: same height as the aggregate strip cards (aggregate-score-cards.tsx)
  // so toggling boolean/numeric via the dropdown never changes the card size,
  // and tall enough that the histogram's axes leave room for the bars.
  return (
    <div className="h-[156px]">
      {isBinaryDistribution(distribution) ? (
        <BinaryCard {...common} />
      ) : (
        <HistogramCard {...common} comparedStatistics={comparedAllStatistics?.[active] ?? null} />
      )}
    </div>
  );
}
