import { useEvalStore } from "@/components/evaluation/store";
import { formatCostIntl } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";

import { ComparisonCell } from "./comparison-cell";

export const CostCell = ({ row }: { row: { original: EvalRow } }) => {
  const isComparison = useEvalStore((s) => s.isComparison);
  const cost = row.original["cost"] as number | undefined;

  if (isComparison) {
    const comparedCost = row.original["compared:cost"] as number | undefined;

    return (
      <ComparisonCell
        original={cost != null ? formatCostIntl(cost) : "-"}
        comparison={comparedCost != null ? formatCostIntl(comparedCost) : "-"}
        originalValue={cost ?? undefined}
        comparisonValue={comparedCost ?? undefined}
      />
    );
  }

  if (cost == null) return "-";
  return <span>{formatCostIntl(cost)}</span>;
};
