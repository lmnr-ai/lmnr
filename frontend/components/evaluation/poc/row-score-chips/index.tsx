"use client";

import RowScoreChip from "@/components/evaluation/poc/row-score-chips/chip";
import {
  type EvalRow,
  type EvaluationScoreDistributionBucket,
  type EvaluationScoreStatistics,
} from "@/lib/evaluation/types";

interface RowScoreChipsProps {
  scoreNames: string[];
  /** The selected datapoint whose per-row values the chips show. */
  row?: EvalRow;
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
}

/**
 * The selected row's scores, shown above the trace view when a datapoint is
 * open (compact-v1). Hovering a chip grows the full-view distribution card
 * with this row's bucket highlighted.
 */
export default function RowScoreChips({ scoreNames, row, allStatistics, allDistributions }: RowScoreChipsProps) {
  if (!row) return null;

  const ordered = [...scoreNames].sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ordered.map((name) => {
        const raw = row[`score:${name}`];
        return (
          <RowScoreChip
            key={name}
            name={name}
            value={typeof raw === "number" && !Number.isNaN(raw) ? raw : undefined}
            statistics={allStatistics?.[name] ?? null}
            distribution={allDistributions?.[name] ?? null}
          />
        );
      })}
    </div>
  );
}
