import { Operator } from "@/lib/actions/common/operators";
import { type EvaluationScoreAnalysis, type EvaluationScoreBin } from "@/lib/evaluation/types";

export type BinFilter = { column: string; operator: Operator; value: number };

/**
 * Build the filter entries (already-parsed, NOT JSON-stringified) that
 * restrict the datapoints table to rows whose `scoreName` falls in this bin.
 *
 * - Binary / discrete bins are a single value (lowerBound === upperBound)
 *   → emit `= value` as a single filter.
 * - Continuous bins cover a range → emit `>= lowerBound` AND (for all bins
 *   except the top one) `< upperBound`. The top bin is inclusive on both
 *   ends (`<= upperBound`) so values exactly equal to the max are still
 *   captured.
 */
export function filtersForBin(
  scoreName: string,
  bin: EvaluationScoreBin,
  binIndex: number,
  analysis: EvaluationScoreAnalysis
): BinFilter[] {
  const column = `score:${scoreName}`;
  if (bin.lowerBound === bin.upperBound) {
    return [{ column, operator: Operator.Eq, value: bin.lowerBound }];
  }
  const isLast = binIndex === analysis.bins.length - 1;
  const filters: BinFilter[] = [{ column, operator: Operator.Gte, value: bin.lowerBound }];
  filters.push({
    column,
    operator: isLast ? Operator.Lte : Operator.Lt,
    value: bin.upperBound,
  });
  return filters;
}

const isBinFilter = (f: unknown, scoreName: string): f is BinFilter => {
  if (typeof f !== "object" || f == null) return false;
  const obj = f as Record<string, unknown>;
  return obj.column === `score:${scoreName}` && typeof obj.value === "number";
};

/**
 * Produce the next `filter` query-string list after clicking the bin for
 * `scoreName`.
 *
 * Semantics:
 * - If the exact bin filter set is already present → toggle off (clear
 *   score:scoreName entries, keep everything else).
 * - Otherwise → drop any existing score:scoreName filters and add the new
 *   ones. This guarantees only one bin can be "selected" at a time per
 *   score, which matches the chart's single-tab paradigm.
 */
export function nextFilterParams(existingFilters: string[], scoreName: string, nextForBin: BinFilter[]): string[] {
  const parsed: unknown[] = existingFilters.map((f) => {
    try {
      return JSON.parse(f);
    } catch {
      return null;
    }
  });

  const selfFilters = parsed.filter((f): f is BinFilter => isBinFilter(f, scoreName));
  const otherFilters = existingFilters.filter((f, i) => !isBinFilter(parsed[i], scoreName));

  // Toggle-off: if the current score:scoreName filter set equals the
  // requested one (same operators + values, any order), clear it.
  const sameAsExisting =
    selfFilters.length === nextForBin.length &&
    nextForBin.every((nf) => selfFilters.some((sf) => sf.operator === nf.operator && sf.value === nf.value));

  if (sameAsExisting) return otherFilters;

  return [...otherFilters, ...nextForBin.map((f) => JSON.stringify(f))];
}

/**
 * True when the current URL filters exactly match the set produced by
 * clicking this bin. Used to highlight the selected bar.
 */
export function isBinSelected(existingFilters: string[], scoreName: string, nextForBin: BinFilter[]): boolean {
  const selfFilters = existingFilters.flatMap((f) => {
    try {
      const parsed = JSON.parse(f);
      return isBinFilter(parsed, scoreName) ? [parsed as BinFilter] : [];
    } catch {
      return [];
    }
  });
  if (selfFilters.length !== nextForBin.length) return false;
  return nextForBin.every((nf) => selfFilters.some((sf) => sf.operator === nf.operator && sf.value === nf.value));
}

const FMT = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 });

export const formatNumber = (n: number | undefined): string =>
  typeof n === "number" && Number.isFinite(n) ? FMT.format(n) : "–";

export const formatPercent = (n: number | undefined): string =>
  typeof n === "number" && Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "–";

/**
 * Position (as a fraction of the x-axis domain) where a continuous
 * threshold line should render. Returns `null` when the threshold lands
 * outside the bin range — in that case we don't draw a line.
 */
export function continuousThresholdPosition(threshold: number, bins: EvaluationScoreBin[]): number | null {
  if (bins.length === 0) return null;
  const lo = bins[0].lowerBound;
  const hi = bins[bins.length - 1].upperBound;
  if (threshold < lo || threshold > hi) return null;
  return (threshold - lo) / (hi - lo);
}
