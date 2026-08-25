"use client";

import { useCallback, useMemo } from "react";

import { AggregationSelect, useAggregation } from "@/components/evaluation/metrics-panel/aggregation-select";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";

import ScoreCardItem from "./score-card-item";
import ScoresVisibilityPopover from "./scores-visibility-popover";

interface RunScoreCardProps {
  projectId: string;
  evaluationId: string;
  scoreNames: string[];
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
  /** Resolved score directions (name -> isHigherBetter). Absent = higher is better. */
  scoreDirections?: Record<string, boolean>;
}

// Stable default refs so useLocalStorage's memoization doesn't churn.
const EMPTY_ORDER: string[] = [];
const EMPTY_HIDDEN: string[] = [];

// Merge the persisted order with the live score list: keep stored names that
// still exist (in their saved positions), then append any new scores (realtime)
// at the end. Mirrors the table's computeEffectiveOrder reconciliation.
function computeEffectiveOrder(storedOrder: string[], scoreNames: string[]): string[] {
  const present = new Set(scoreNames);
  const kept = storedOrder.filter((name) => present.has(name));
  const keptSet = new Set(kept);
  const appended = scoreNames.filter((name) => !keptSet.has(name));
  return [...kept, ...appended];
}

// Whole-run aggregates shown above the table: a scores popover (reorder + show/
// hide) + the aggregation picker, then one card per visible score in a
// horizontally scrollable row. Order and hidden set persist per (project, eval)
// in localStorage; newly-arriving scores default to visible + appended last.
export default function RunScoreCard({
  projectId,
  evaluationId,
  scoreNames,
  allStatistics,
  comparedAllStatistics,
  isComparison,
  scoreDirections,
}: RunScoreCardProps) {
  // allDistributions/comparedAllDistributions are still accepted (and shipped by
  // the API) for future histogram charts; the shields read exact stats now.
  const [aggregation] = useAggregation();

  const [storedOrder, setStoredOrder] = useLocalStorage<string[]>(
    `evaluation-score-cards-order:${projectId}:${evaluationId}`,
    EMPTY_ORDER
  );
  const [hiddenScores, setHiddenScores] = useLocalStorage<string[]>(
    `evaluation-score-cards-hidden:${projectId}:${evaluationId}`,
    EMPTY_HIDDEN
  );

  const scoreOrder = useMemo(() => computeEffectiveOrder(storedOrder, scoreNames), [storedOrder, scoreNames]);

  const onToggle = useCallback(
    (name: string) => {
      setHiddenScores((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
    },
    [setHiddenScores]
  );

  const visibleScores = useMemo(
    () => scoreOrder.filter((name) => !hiddenScores.includes(name)),
    [scoreOrder, hiddenScores]
  );

  return (
    <>
      <div className="flex items-center gap-1.5">
        <ScoresVisibilityPopover
          scoreOrder={scoreOrder}
          hiddenScores={hiddenScores}
          onToggle={onToggle}
          onReorder={setStoredOrder}
        />
        <AggregationSelect />
      </div>
      <div className="flex items-start overflow-x-auto scroll-fade-x px-2 overflow-y-hidden no-scrollbar gap-4 divide-x divide-foreground-600">
        {visibleScores.map((name) => (
          <ScoreCardItem
            key={name}
            name={name}
            aggregation={aggregation}
            statistics={allStatistics?.[name] ?? null}
            comparedStatistics={comparedAllStatistics?.[name] ?? null}
            isComparison={isComparison}
            isHigherBetter={scoreDirections?.[name] ?? true}
          />
        ))}
      </div>
    </>
  );
}
