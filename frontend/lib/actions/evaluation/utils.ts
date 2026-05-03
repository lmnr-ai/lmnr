import {
  type EvaluationScoreAnalysis,
  type EvaluationScoreBin,
  type EvaluationScoreDistributionBucket,
  type EvaluationScoreStatistics,
  type ScoreType,
} from "@/lib/evaluation/types";

// Constants for distribution calculation
const DEFAULT_LOWER_BOUND = 0.0;
const DEFAULT_BUCKET_COUNT = 10;

const DISCRETE_MAX_DISTINCT = 20;
const CONTINUOUS_BINS = 10;
const CONTINUOUS_LOWER = 0;
const CONTINUOUS_UPPER = 1;

// Helper function to calculate score statistics
export function calculateScoreStatistics(
  results: { scores?: Record<string, unknown> }[],
  scoreName: string
): EvaluationScoreStatistics {
  const scores = results
    .map((result) => {
      const scoresObj = result.scores as Record<string, number> | null;
      return scoresObj?.[scoreName];
    })
    .filter((score): score is number => typeof score === "number" && !isNaN(score));

  if (scores.length === 0) {
    return { averageValue: 0 };
  }

  const sum = scores.reduce((acc, score) => acc + score, 0);
  const averageValue = sum / scores.length;

  return { averageValue };
}

// Helper function to calculate score distribution
export function calculateScoreDistribution(
  results: { scores?: Record<string, unknown> }[],
  scoreName: string
): EvaluationScoreDistributionBucket[] {
  const scores = results
    .map((result) => {
      const scoresObj = result.scores as Record<string, number> | null;
      return scoresObj?.[scoreName];
    })
    .filter((score): score is number => typeof score === "number" && !isNaN(score));

  if (scores.length === 0) {
    // Return empty buckets
    return Array.from({ length: DEFAULT_BUCKET_COUNT }, (_, i) => ({
      lowerBound: (i * 1) / DEFAULT_BUCKET_COUNT,
      upperBound: ((i + 1) * 1) / DEFAULT_BUCKET_COUNT,
      heights: [0],
    }));
  }

  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  // Use default lower bound if min is higher
  const lowerBound = Math.min(minScore, DEFAULT_LOWER_BOUND);
  const upperBound = maxScore;

  // If all scores are the same, put everything in the last bucket
  if (lowerBound === upperBound) {
    const buckets: EvaluationScoreDistributionBucket[] = Array.from({ length: DEFAULT_BUCKET_COUNT }, () => ({
      lowerBound,
      upperBound,
      heights: [0],
    }));
    buckets[DEFAULT_BUCKET_COUNT - 1].heights = [scores.length];
    return buckets;
  }

  const stepSize = (upperBound - lowerBound) / DEFAULT_BUCKET_COUNT;
  const buckets: EvaluationScoreDistributionBucket[] = [];

  for (let i = 0; i < DEFAULT_BUCKET_COUNT; i++) {
    const bucketLowerBound = lowerBound + i * stepSize;
    const bucketUpperBound = i === DEFAULT_BUCKET_COUNT - 1 ? upperBound : lowerBound + (i + 1) * stepSize;

    const count = scores.filter((score) => {
      if (i === DEFAULT_BUCKET_COUNT - 1) {
        // Last bucket includes upper bound
        return score >= bucketLowerBound && score <= bucketUpperBound;
      } else {
        // Other buckets exclude upper bound
        return score >= bucketLowerBound && score < bucketUpperBound;
      }
    }).length;

    buckets.push({
      lowerBound: bucketLowerBound,
      upperBound: bucketUpperBound,
      heights: [count],
    });
  }

  return buckets;
}

// ---- Score-type inference + unified analysis ----

const isInteger = (n: number) => Number.isFinite(n) && Math.floor(n) === n;

/**
 * Classify a score name as binary/discrete/continuous based on its actual
 * values. Heuristic:
 *
 * - binary: all values are in {0, 1}
 * - discrete: all values are integers AND distinct-value count <= 20
 * - continuous: everything else
 *
 * Empty or all-same-value inputs fall back to `continuous` because the
 * chart renders continuous bins over the default [0, 1] range, which is a
 * safe default when there's nothing to go on.
 */
export function inferScoreType(scores: number[]): ScoreType {
  if (scores.length === 0) return "continuous";
  const allBinary = scores.every((s) => s === 0 || s === 1);
  if (allBinary) return "binary";
  const allInt = scores.every(isInteger);
  if (allInt) {
    const distinct = new Set(scores);
    if (distinct.size <= DISCRETE_MAX_DISTINCT) return "discrete";
  }
  return "continuous";
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function mean(scores: number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function binaryBins(scores: number[], passThreshold: number | null): EvaluationScoreBin[] {
  const failCount = scores.filter((s) => s === 0).length;
  const passCount = scores.filter((s) => s === 1).length;
  // Binary has an implicit threshold of 1; if caller didn't set one, still
  // apply pass/fail coloring.
  const effective = passThreshold ?? 1;
  return [
    {
      label: "0",
      count: failCount,
      lowerBound: 0,
      upperBound: 0,
      isPass: 0 >= effective,
    },
    {
      label: "1",
      count: passCount,
      lowerBound: 1,
      upperBound: 1,
      isPass: 1 >= effective,
    },
  ];
}

function discreteBins(scores: number[], passThreshold: number | null): EvaluationScoreBin[] {
  const distinct = Array.from(new Set(scores)).sort((a, b) => a - b);
  if (distinct.length === 0) return [];
  // Fill in integer gaps between min and max so a likert 1..5 shows all 5
  // bins even when no data for an intermediate value.
  const lo = Math.min(...distinct);
  const hi = Math.max(...distinct);
  const values: number[] = [];
  if (isInteger(lo) && isInteger(hi) && hi - lo <= DISCRETE_MAX_DISTINCT) {
    for (let v = lo; v <= hi; v++) values.push(v);
  } else {
    values.push(...distinct);
  }
  return values.map((value) => ({
    label: String(value),
    count: scores.filter((s) => s === value).length,
    lowerBound: value,
    upperBound: value,
    isPass: passThreshold == null ? null : value >= passThreshold,
  }));
}

function continuousBins(scores: number[], passThreshold: number | null): EvaluationScoreBin[] {
  // Default range is [0, 1], but expand it to include any out-of-range
  // scores so no datapoints are silently dropped from the histogram.
  // Without this expansion, `stats.count` would include values that have
  // no corresponding bin, causing the MetaLine total to exceed the sum of
  // the bar heights.
  let lower = CONTINUOUS_LOWER;
  let upper = CONTINUOUS_UPPER;
  for (const s of scores) {
    if (s < lower) lower = s;
    if (s > upper) upper = s;
  }
  // Guard against a degenerate zero-width range (shouldn't happen with
  // the defaults, but keeps the math safe if constants ever change).
  if (lower === upper) upper = lower + 1;

  const step = (upper - lower) / CONTINUOUS_BINS;
  // Pick enough decimals so adjacent bin edges don't collapse to the same
  // label string (e.g. a step of 1.5 needs 1 decimal, a step of 0.1 needs
  // 1 decimal, and a step of 10 can stay at 0).
  const decimals = step >= 1 && Number.isInteger(step) ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const bins: EvaluationScoreBin[] = [];
  for (let i = 0; i < CONTINUOUS_BINS; i++) {
    const lo = lower + i * step;
    const hi = i === CONTINUOUS_BINS - 1 ? upper : lower + (i + 1) * step;
    const mid = (lo + hi) / 2;
    const count = scores.filter((s) => {
      if (i === CONTINUOUS_BINS - 1) return s >= lo && s <= hi;
      return s >= lo && s < hi;
    }).length;
    bins.push({
      label: `${lo.toFixed(decimals)}–${hi.toFixed(decimals)}`,
      count,
      lowerBound: lo,
      upperBound: hi,
      isPass: passThreshold == null ? null : mid >= passThreshold,
    });
  }
  return bins;
}

export function analyzeScore(
  results: { scores?: Record<string, unknown> }[],
  scoreName: string,
  passThresholds: Record<string, number | null>
): EvaluationScoreAnalysis {
  const scores = results
    .map((result) => {
      const scoresObj = result.scores as Record<string, number> | null;
      return scoresObj?.[scoreName];
    })
    .filter((score): score is number => typeof score === "number" && !isNaN(score));

  const type = inferScoreType(scores);
  const passThreshold = passThresholds[scoreName] ?? null;

  const sorted = [...scores].sort((a, b) => a - b);
  const count = scores.length;
  const stats: EvaluationScoreAnalysis["stats"] = {
    count,
    mean: mean(scores),
    median: quantile(sorted, 0.5),
    min: count > 0 ? sorted[0] : 0,
    max: count > 0 ? sorted[sorted.length - 1] : 0,
  };

  if (type === "binary") {
    const passCount = scores.filter((s) => s === 1).length;
    stats.passCount = passCount;
    stats.failCount = count - passCount;
    stats.passRate = count > 0 ? passCount / count : 0;
  } else if (type === "continuous") {
    stats.p25 = quantile(sorted, 0.25);
    stats.p75 = quantile(sorted, 0.75);
  }

  let bins: EvaluationScoreBin[];
  if (type === "binary") bins = binaryBins(scores, passThreshold);
  else if (type === "discrete") bins = discreteBins(scores, passThreshold);
  else bins = continuousBins(scores, passThreshold);

  return { type, passThreshold, bins, stats };
}
