export type EvalRow = Record<string, unknown>;

export type EvaluationStatus = "finished" | "inProgress";

export type Evaluation = {
  id: string;
  createdAt: string;
  groupId: string;
  name: string;
  projectId: string;
  metadata: Record<string, unknown> | null;
  status?: EvaluationStatus;
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
