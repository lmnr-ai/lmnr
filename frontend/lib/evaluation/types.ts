export type EvalRow = Record<string, unknown>;

export type Evaluation = {
  id: string;
  createdAt: string;
  groupId: string;
  name: string;
  projectId: string;
  metadata: Record<string, unknown> | null;
};

/** A dataset an evaluation's datapoints are linked to. */
export type LinkedDataset = {
  id: string;
  name: string;
};

export type EvaluationScoreStatistics = {
  averageValue: number;
  // Exact aggregates over the raw per-datapoint values so the shield respects
  // the aggregation picker. Absent when there were no scores.
  min?: number;
  max?: number;
  sum?: number;
  median?: number;
  p90?: number;
  p95?: number;
  p99?: number;
};

export type EvaluationScoreDistributionBucket = {
  lowerBound: number;
  upperBound: number;
  heights: number[];
};

export type EvaluationResultsInfo = {
  evaluation: Evaluation;
  results: Record<string, unknown>[];
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
};

export type EvaluationTimeProgression = {
  timestamp: string;
  evaluationId: string;
  names: string[];
  values: string[];
};
