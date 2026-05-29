import { type EvaluationScoreDistributionBucket } from "@/lib/evaluation/types";
import { isValidNumber } from "@/lib/utils";

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
