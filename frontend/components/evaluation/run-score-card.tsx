"use client";

import { useState } from "react";

import { useAggregation } from "@/components/evaluation/metrics-panel/aggregation-select";
import BinaryCard from "@/components/evaluation/metrics-panel/binary-card";
import HistogramCard from "@/components/evaluation/metrics-panel/histogram-card";
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

// Whole-run aggregate for ONE picked score, shown above the table when a trace is open.
// A score picker replaces the name label; body reuses the strip's BinaryCard/HistogramCard.
export default function RunScoreCard({
  scoreNames,
  allStatistics,
  allDistributions,
  comparedAllStatistics,
  comparedAllDistributions,
  isComparison,
}: RunScoreCardProps) {
  const [selected, setSelected] = useState<string>(scoreNames[0]);
  const [aggregation] = useAggregation();
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
        <HistogramCard {...common} aggregation={aggregation} comparedStatistics={comparedAllStatistics?.[active] ?? null} />
      )}
    </div>
  );
}
