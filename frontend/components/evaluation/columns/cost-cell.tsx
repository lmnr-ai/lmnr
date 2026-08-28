import { type CellContext } from "@tanstack/react-table";

import { CostCell as TraceCostCell } from "@/components/traces/cells";
import { type EvalRow } from "@/lib/evaluation/types";
import { type CostStats } from "@/lib/traces/format";

import { ComparisonCell } from "./comparison-cell";

const num = (v: unknown): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const costStats = (row: EvalRow, prefix = ""): CostStats => ({
  inputCost: num(row[`${prefix}inputCost`]),
  outputCost: num(row[`${prefix}outputCost`]),
  totalCost: num(row[`${prefix}cost`]) ?? num(row[`${prefix}totalCost`]),
});

export const CostCell = ({ row, table }: CellContext<EvalRow, unknown>) => {
  const isComparison = table.options.meta?.evalCellMeta?.isComparison ?? false;
  const stats = costStats(row.original);
  const total = stats.totalCost;

  if (isComparison) {
    const compared = costStats(row.original, "compared:");
    return (
      <ComparisonCell
        original={<TraceCostCell stats={stats} />}
        comparison={<TraceCostCell stats={compared} />}
        originalValue={total ?? undefined}
        comparisonValue={compared.totalCost ?? undefined}
      />
    );
  }

  return <TraceCostCell stats={stats} />;
};
