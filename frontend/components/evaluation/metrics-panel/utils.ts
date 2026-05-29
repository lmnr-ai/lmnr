import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { isValidNumber } from "@/lib/utils";

export type AggregationKind = "avg" | "sum" | "min" | "max" | "median" | "p90" | "p95" | "p99";

export const AGGREGATION_OPTIONS: { value: AggregationKind; label: string }[] = [
  { value: "avg", label: "Average" },
  { value: "sum", label: "Sum" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "median", label: "Median" },
  { value: "p90", label: "p90" },
  { value: "p95", label: "p95" },
  { value: "p99", label: "p99" },
];

export const DEFAULT_AGGREGATION: AggregationKind = "avg";

const QUANTILE_FOR: Record<Exclude<AggregationKind, "avg" | "sum" | "min" | "max">, number> = {
  median: 0.5,
  p90: 0.9,
  p95: 0.95,
  p99: 0.99,
};

const bucketMid = (b: EvaluationScoreDistributionBucket): number => {
  // upperBound is required by the type but defensively coerce if missing
  const lo = b.lowerBound;
  const hi = typeof b.upperBound === "number" ? b.upperBound : lo;
  return (lo + hi) / 2;
};

const bucketCount = (b: EvaluationScoreDistributionBucket): number => {
  const h = b?.heights?.[0];
  return typeof h === "number" && isFinite(h) ? h : 0;
};

// Linear-interpolate a quantile from histogram buckets. Returns null when total mass == 0.
function quantileFromBuckets(distribution: EvaluationScoreDistributionBucket[], q: number): number | null {
  if (!distribution || distribution.length === 0) return null;
  const counts = distribution.map(bucketCount);
  const total = counts.reduce((acc, c) => acc + c, 0);
  if (total <= 0) return null;
  const target = q * total;
  let cum = 0;
  for (let i = 0; i < distribution.length; i++) {
    const c = counts[i];
    if (c <= 0) continue;
    const next = cum + c;
    if (target <= next) {
      const within = c > 0 ? (target - cum) / c : 0;
      const b = distribution[i];
      const lo = b.lowerBound;
      const hi = typeof b.upperBound === "number" ? b.upperBound : lo;
      return lo + within * (hi - lo);
    }
    cum = next;
  }
  // Fallback to the last non-empty bucket midpoint.
  for (let i = distribution.length - 1; i >= 0; i--) {
    if (counts[i] > 0) return bucketMid(distribution[i]);
  }
  return null;
}

/**
 * Compute an aggregation scalar from the per-score distribution buckets.
 * `avg` is taken from server stats when available; everything else is
 * derived client-side from bucket midpoints + counts.
 */
export function aggregateScalar(
  aggregation: AggregationKind,
  statistics: EvaluationScoreStatistics | null | undefined,
  distribution: EvaluationScoreDistributionBucket[] | null | undefined
): number | undefined {
  if (aggregation === "avg") {
    return statistics?.averageValue;
  }
  if (!distribution || distribution.length === 0) return undefined;

  if (aggregation === "sum") {
    let s = 0;
    let any = false;
    for (const b of distribution) {
      const c = bucketCount(b);
      if (c <= 0) continue;
      s += bucketMid(b) * c;
      any = true;
    }
    return any ? s : undefined;
  }

  if (aggregation === "min") {
    for (const b of distribution) {
      if (bucketCount(b) > 0) return bucketMid(b);
    }
    return undefined;
  }

  if (aggregation === "max") {
    for (let i = distribution.length - 1; i >= 0; i--) {
      if (bucketCount(distribution[i]) > 0) return bucketMid(distribution[i]);
    }
    return undefined;
  }

  const q = QUANTILE_FOR[aggregation];
  const r = quantileFromBuckets(distribution, q);
  return r ?? undefined;
}

// "Binary" = all non-zero mass sits in the first and last buckets only (pass/fail evaluators).
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

export function pctChange(current: number, base: number): number | null {
  if (!isValidNumber(current) || !isValidNumber(base) || base === 0) return null;
  return ((current - base) / base) * 100;
}
