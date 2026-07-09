export type EvalRow = Record<string, unknown>;

// finished: every datapoint scored (green). inProgress: some datapoints still
// loading (amber). error: all done but some traces errored (amber). stale: still
// loading with no updates for over an hour (grayed out).
export type EvaluationStatus = "finished" | "inProgress" | "error" | "stale";

export type Evaluation = {
  id: string;
  createdAt: string;
  groupId: string;
  name: string;
  projectId: string;
  metadata: Record<string, unknown> | null;
  dataPointsCount?: number;
  unfinishedCount?: number;
  errorCount?: number;
};

export type EvaluationScoreStatistics = {
  averageValue: number;
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
