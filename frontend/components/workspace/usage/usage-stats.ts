import { formatCompact, formatUsdPrecise } from "@/components/workspace/usage/utils";
import { type UsageBreakdown } from "@/lib/actions/usage/types";

export interface StatRow {
  label: string;
  // null while loading, so the row still reserves its space.
  value: string | null;
}

export const dataStatRows = (
  days: { date: string; value: number }[] | undefined,
  format: (value: number) => string
): StatRow[] => {
  if (!days) return [{ label: "Average per day", value: null }];
  const total = days.reduce((sum, d) => sum + d.value, 0);
  return [{ label: "Average per day", value: days.length > 0 ? format(total / days.length) : "—" }];
};

export const signalStatRows = (breakdown: UsageBreakdown | undefined, failed: boolean): StatRow[] => {
  if (!breakdown) {
    const value = failed ? "—" : null;
    return [
      { label: "Average per run", value },
      { label: "Runs this cycle", value },
    ];
  }
  const runs = breakdown.signalRuns;
  const costUsd = breakdown.days.reduce((sum, d) => sum + d.signalCostMicroUsd, 0) / 1_000_000;
  return [
    { label: "Average per run", value: runs > 0 ? formatUsdPrecise(costUsd / runs) : "—" },
    { label: "Runs this cycle", value: formatCompact(runs) },
  ];
};
