import ScoreComparisonCard from "@/components/evaluation/datapoint-overview/score-comparison-card";

import { type VariantProps } from "../types";

export default function GridVariant({ scoreNames, currentEvaluationId, evaluations, rows }: VariantProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {scoreNames.map((name) => (
        <ScoreComparisonCard
          key={name}
          scoreName={name}
          currentEvaluationId={currentEvaluationId}
          evaluations={evaluations}
          rows={rows}
        />
      ))}
    </div>
  );
}
