import { formatCostIntl } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";

import { ComparisonCell } from "./comparison-cell";

export const ComparisonCostCell = ({ row }: { row: { original: EvalRow } }) => {
  const cost = row.original["cost"] as number | undefined;
  const comparedCost = row.original["compared:cost"] as number | undefined;

  return (
    <ComparisonCell
      original={cost != null ? formatCostIntl(cost) : "-"}
      comparison={comparedCost != null ? formatCostIntl(comparedCost) : "-"}
      originalValue={cost ?? undefined}
      comparisonValue={comparedCost ?? undefined}
    />
  );
};
