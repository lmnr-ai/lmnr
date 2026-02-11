import { type EvalRow } from "@/lib/evaluation/types";

const formatDurationMs = (ms: number): string => `${(ms / 1000).toFixed(2)}s`;

export const DurationCell = ({ row }: { row: { original: EvalRow } }) => {
  const durationMs = row.original["duration"] as number | undefined;
  if (durationMs == null) return "-";
  return <span>{formatDurationMs(durationMs)}</span>;
};
