import { deriveStatus, type EvalDatapointStatus } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";

export interface Gate {
  /** Full score key without the `score:` prefix, e.g. `gate:calledTool(web_search)`. Stable id. */
  name: string;
  /** Display label with the `gate:` prefix stripped, e.g. `calledTool(web_search)`. */
  label: string;
  passing: boolean;
}

export interface RowGates {
  gates: Gate[];
  passing: number;
  total: number;
  allPassing: boolean;
  status: EvalDatapointStatus;
}

/**
 * Explode a datapoint row's flattened `score:*` keys into gate pass/fail entries.
 * A gate passes when its value is exactly 1. Comparison / custom columns are ignored.
 */
export const extractGates = (row: EvalRow): RowGates => {
  const gates: Gate[] = [];
  for (const key of Object.keys(row)) {
    if (!key.startsWith("score:")) continue;
    const value = row[key];
    if (typeof value !== "number") continue;
    const name = key.slice("score:".length);
    const label = name.startsWith("gate:") ? name.slice("gate:".length) : name;
    gates.push({ name, label, passing: value === 1 });
  }
  gates.sort((a, b) => a.label.localeCompare(b.label));

  const passing = gates.filter((g) => g.passing).length;
  const total = gates.length;
  return {
    gates,
    passing,
    total,
    allPassing: total > 0 && passing === total,
    status: deriveStatus(row),
  };
};
