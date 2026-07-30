import { computeScoreAggregates } from "@/lib/evaluation/aggregation";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";

// Constants for distribution calculation
const DEFAULT_LOWER_BOUND = 0.0;
const DEFAULT_BUCKET_COUNT = 10;

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

  const agg = computeScoreAggregates(scores);
  if (!agg) {
    return { averageValue: 0 };
  }

  return {
    averageValue: agg.avg,
    min: agg.min,
    max: agg.max,
    sum: agg.sum,
    median: agg.median,
    p90: agg.p90,
    p95: agg.p95,
    p99: agg.p99,
  };
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

  // All scores are the same value. This branch only fires when that value sits
  // at the lower bound (<= 0, since lowerBound = min(value, 0)), e.g. a binary
  // score filtered to `= 0`. Put the mass in the FIRST bucket — the last bucket
  // is the "positive"/high end, so dumping all-zero rows there would misrepresent
  // an all-fail run as all-pass in the histogram.
  if (lowerBound === upperBound) {
    const buckets: EvaluationScoreDistributionBucket[] = Array.from({ length: DEFAULT_BUCKET_COUNT }, () => ({
      lowerBound,
      upperBound,
      heights: [0],
    }));
    buckets[0].heights = [scores.length];
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
