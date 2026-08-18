import { type CellContext } from "@tanstack/react-table";

import { DurationCell as TraceDurationCell } from "@/components/traces/cells";
import { type EvalRow } from "@/lib/evaluation/types";

import { ComparisonCell } from "./comparison-cell";

const secondsToMs = (v: unknown): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n * 1000 : undefined;
};

export const DurationCell = ({ row, table }: CellContext<EvalRow, unknown>) => {
  const isComparison = table.options.meta?.evalCellMeta?.isComparison ?? false;
  const durationMs = secondsToMs(row.original["duration"]);

  if (isComparison) {
    const comparedMs = secondsToMs(row.original["compared:duration"]);
    return (
      <ComparisonCell
        original={<TraceDurationCell durationMs={durationMs} />}
        comparison={<TraceDurationCell durationMs={comparedMs} />}
        originalValue={durationMs}
        comparisonValue={comparedMs}
      />
    );
  }

  return <TraceDurationCell durationMs={durationMs} />;
};
