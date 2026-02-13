import { round } from "lodash";

import { useEvalStore } from "@/components/evaluation/store";
import { formatCostIntl } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";

import { ComparisonCell } from "./comparison-cell";

export const CostCell = ({ row }: { row: { original: EvalRow } }) => {
  const isComparison = useEvalStore((s) => s.isComparison);
  const rawCost = row.original["cost"] as number | undefined;
  const cost = rawCost != null ? round(rawCost, 5) : undefined;

  if (isComparison) {
    const rawComparedCost = row.original["compared:cost"] as number | undefined;
    const comparedCost = rawComparedCost != null ? round(rawComparedCost, 5) : undefined;

    return (
      <ComparisonCell
        original={cost != null ? formatCostIntl(cost) : "-"}
        comparison={comparedCost != null ? formatCostIntl(comparedCost) : "-"}
        originalValue={cost}
        comparisonValue={comparedCost}
      />
    );
  }

  if (cost == null) return "-";
  return <span>{formatCostIntl(cost)}</span>;
};
