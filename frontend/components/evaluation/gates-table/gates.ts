import { deriveStatus, type EvalDatapointStatus, flattenScores } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";

export interface Gate {
  /** Full score key without the `score:` prefix, e.g. `gate:calledTool(web_search)`. Stable id. */
  name: string;
  /** Display label with the `gate:` prefix stripped, e.g. `calledTool(web_search)`. */
  label: string;
  /** Raw score value as stored. */
  value: number;
  /**
   * Soft checks (`.soft()` in the Eve DSL) are measurements, not pass/fail
   * gates — they show their value and are excluded from the gate count.
   */
  soft: boolean;
  /** Only meaningful for hard gates (a gate passes when its value is exactly 1). */
  passing: boolean;
}

export interface RowGates {
  /** All checks — hard gates AND soft measurements — for the accordion. */
  gates: Gate[];
  /** Passing / total count over HARD gates only. */
  passing: number;
  total: number;
  allPassing: boolean;
  status: EvalDatapointStatus;
}

/**
 * A stored score is a hard pass/fail gate iff its value is exactly 0 or 1.
 * Eve applies each hard gate's threshold before storing (e.g. `.atLeast(0.6)`
 * lands as 1/0), so any other value is a soft measurement (`.soft()`) riding
 * along — e.g. a raw `similarity` of 0.87. Soft scores are shown as their value
 * and never counted as a passing/failing gate.
 */
const isHardGate = (value: number): boolean => value === 0 || value === 1;

/**
 * Explode a datapoint's checks into gate / measurement entries.
 *
 * Eve evals are sparse: each datapoint only carries the checks that actually ran.
 * We derive them from the raw `scores` JSON string (the true per-datapoint set),
 * NOT the pivoted `score:<name>` columns — those come from ClickHouse
 * `simpleJSONExtractFloat`, which returns 0 for an absent key, so a check that was
 * never present would otherwise render as failing rather than simply not shown.
 */
export const extractGates = (row: EvalRow): RowGates => {
  const gates: Gate[] = [];
  for (const [key, value] of Object.entries(flattenScores(row["scores"]))) {
    const name = key.slice("score:".length);
    const label = name.startsWith("gate:") ? name.slice("gate:".length) : name;
    const soft = !isHardGate(value);
    gates.push({ name, label, value, soft, passing: value === 1 });
  }
  gates.sort((a, b) => a.label.localeCompare(b.label));

  const hardGates = gates.filter((g) => !g.soft);
  const passing = hardGates.filter((g) => g.passing).length;
  const total = hardGates.length;
  return {
    gates,
    passing,
    total,
    allPassing: total > 0 && passing === total,
    status: deriveStatus(row),
  };
};
