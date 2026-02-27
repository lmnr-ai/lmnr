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
