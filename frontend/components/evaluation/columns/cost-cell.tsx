import { formatCostIntl } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";

export const CostCell = ({ row }: { row: { original: EvalRow } }) => {
  const cost = row.original["cost"] as number | undefined;
  if (cost == null) return "-";
  return <span>{formatCostIntl(cost)}</span>;
};
