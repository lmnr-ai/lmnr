import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { isValidNumber } from "@/lib/utils";

// A distribution is "binary" when all non-zero mass sits in the first and last buckets only.
// This is the classic pass/fail / 0/1 evaluator case where a histogram looks useless
// (two skinny bars at the extremes, nothing in between).
export function isBinaryDistribution(distribution: EvaluationScoreDistributionBucket[] | null | undefined): boolean {
  if (!distribution || distribution.length < 2) return false;
  const last = distribution.length - 1;
  let anyMiddle = false;
  let anyExtreme = false;
  for (let i = 0; i < distribution.length; i++) {
    const h = distribution[i]?.heights[0] ?? 0;
    if (h <= 0) continue;
    if (i === 0 || i === last) anyExtreme = true;
    else anyMiddle = true;
  }
  return anyExtreme && !anyMiddle;
}

export function binaryCounts(distribution: EvaluationScoreDistributionBucket[] | null | undefined): {
  negative: number;
  positive: number;
  total: number;
} {
  if (!distribution || distribution.length < 2) return { negative: 0, positive: 0, total: 0 };
  const negative = distribution[0]?.heights[0] ?? 0;
  const positive = distribution[distribution.length - 1]?.heights[0] ?? 0;
  return { negative, positive, total: negative + positive };
}

export function totalCount(distribution: EvaluationScoreDistributionBucket[] | null | undefined): number {
  if (!distribution) return 0;
  return distribution.reduce((s, b) => s + (b.heights[0] ?? 0), 0);
}

export function formatAvg(stat: EvaluationScoreStatistics | null | undefined): string {
  if (!stat || !isValidNumber(stat.averageValue)) return "—";
  return stat.averageValue.toFixed(2);
}

export function pctChange(current: number, base: number): number | null {
  if (!isValidNumber(current) || !isValidNumber(base) || base === 0) return null;
  return ((current - base) / base) * 100;
}

export type MetricsSortKey = "name" | "avg" | "change" | "count";
export type MetricsSortDir = "asc" | "desc";

export function sortScoreNames(
  scoreNames: string[],
  sortKey: MetricsSortKey,
  sortDir: MetricsSortDir,
  allStatistics?: Record<string, EvaluationScoreStatistics>,
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>,
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>
): string[] {
  const mul = sortDir === "asc" ? 1 : -1;
  const sorted = [...scoreNames];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case "name":
        return a.localeCompare(b) * mul;
      case "avg": {
        const av = allStatistics?.[a]?.averageValue ?? -Infinity;
        const bv = allStatistics?.[b]?.averageValue ?? -Infinity;
        return (av - bv) * mul;
      }
      case "change": {
        const ac = pctChange(allStatistics?.[a]?.averageValue ?? NaN, comparedAllStatistics?.[a]?.averageValue ?? NaN);
        const bc = pctChange(allStatistics?.[b]?.averageValue ?? NaN, comparedAllStatistics?.[b]?.averageValue ?? NaN);
        return ((ac ?? -Infinity) - (bc ?? -Infinity)) * mul;
      }
      case "count":
        return (totalCount(allDistributions?.[a] ?? null) - totalCount(allDistributions?.[b] ?? null)) * mul;
    }
  });
  return sorted;
}
