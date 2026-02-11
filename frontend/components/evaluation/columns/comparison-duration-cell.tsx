import { type EvalRow } from "@/lib/evaluation/types";

import { ComparisonCell } from "./comparison-cell";

const formatDurationMs = (ms: number): string => `${(ms / 1000).toFixed(2)}s`;

export const ComparisonDurationCell = ({ row }: { row: { original: EvalRow } }) => {
  const durationMs = row.original["duration"] as number | undefined;
  const comparedDurationMs = row.original["compared:duration"] as number | undefined;

  const format = (ms: number | undefined) => (ms != null ? formatDurationMs(ms) : "-");
  const toSeconds = (ms: number | undefined) => (ms != null ? ms / 1000 : undefined);

  return (
    <ComparisonCell
      original={format(durationMs)}
      comparison={format(comparedDurationMs)}
      originalValue={toSeconds(durationMs)}
      comparisonValue={toSeconds(comparedDurationMs)}
    />
  );
};
