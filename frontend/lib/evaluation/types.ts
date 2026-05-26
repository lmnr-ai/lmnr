export type EvalRow = Record<string, unknown>;

export type Evaluation = {
  id: string;
  createdAt: string;
  groupId: string;
  name: string;
  projectId: string;
  metadata: Record<string, unknown> | null;
};

export type EvaluationScoreStatistics = {
  averageValue: number;
};

export type EvaluationScoreDistributionBucket = {
  lowerBound: number;
  upperBound: number;
  heights: number[];
};

export type ScoreType = "binary" | "discrete" | "continuous";

/**
 * A single histogram bin produced by the stats endpoint. Shape is unified
 * across score types — what changes is how `bins` is produced upstream.
 *
 * - `lowerBound`/`upperBound` define the value range the bin covers
 *   (inclusive on both ends for binary/discrete single-value bins; the
 *   continuous case follows a standard `[lo, hi)` convention except for
 *   the last bin which is `[lo, hi]`).
 * - `isPass` is `true` when the bin's midpoint is at or above the
 *   configured `passThreshold`. `null` means no threshold is configured
 *   (neutral coloring).
 */
export type EvaluationScoreBin = {
  label: string;
  count: number;
  lowerBound: number;
  upperBound: number;
  isPass: boolean | null;
};

export type EvaluationScoreAnalysis = {
  type: ScoreType;
  /** Null when not configured — chart must render neutral (no pass/fail colors, no line). */
  passThreshold: number | null;
  bins: EvaluationScoreBin[];
  stats: {
    count: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    // Binary-only
    passCount?: number;
    failCount?: number;
    passRate?: number;
    // Continuous-only
    p25?: number;
    p75?: number;
  };
};

export type EvaluationResultsInfo = {
  evaluation: Evaluation;
  results: Record<string, unknown>[];
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  allScoreAnalyses?: Record<string, EvaluationScoreAnalysis>;
};

export type EvaluationTimeProgression = {
  timestamp: string;
  evaluationId: string;
  names: string[];
  values: string[];
};
