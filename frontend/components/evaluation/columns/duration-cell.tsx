import { useEvalStore } from "@/components/evaluation/store";
import { type EvalRow } from "@/lib/evaluation/types";

import { ComparisonCell } from "./comparison-cell";

const formatDuration = (seconds: number): string => `${seconds.toFixed(2)}s`;

export const DurationCell = ({ row }: { row: { original: EvalRow } }) => {
  const isComparison = useEvalStore((s) => s.isComparison);
  const duration = row.original["duration"] as number | undefined;

  if (isComparison) {
    const comparedDuration = row.original["compared:duration"] as number | undefined;
    const format = (s: number | undefined) => (s != null ? formatDuration(s) : "-");

    return (
      <ComparisonCell
        original={format(duration)}
        comparison={format(comparedDuration)}
        originalValue={duration}
        comparisonValue={comparedDuration}
      />
    );
  }

  if (duration == null) return "-";
  return <span>{formatDuration(duration)}</span>;
};
