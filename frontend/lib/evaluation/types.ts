export type EvalRow = Record<string, unknown>;

export type Evaluation = {
  id: string;
  createdAt: string;
  groupId: string;
  name: string;
  projectId: string;
  metadata: Record<string, unknown> | null;
  /**
   * What lmnr-cli recorded about the run (sent by the Laminar Harbor plugin): the task set and scripts it ran,
   * by archive hash; `runId` only for remote runs (`lmnr-cli eval run --remote`).
   */
  hostedMetadata?: {
    taskSet?: string;
    taskSetHash?: string;
    scriptsHash?: string;
    gitSha?: string;
    runId?: string;
  } | null;
  /** The pushed task-set version with the content the evaluation ran; null for a never-pushed or edited copy. */
  taskSetVersionId?: string | null;
};

/** A dataset an evaluation's Trials are linked to. */
export type LinkedDataset = {
  id: string;
  name: string;
};

export type EvaluationScoreStatistics = {
  averageValue: number;
  // Exact aggregates over the raw per-Trial values so the shield respects
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
  name?: string;
  metadata?: Record<string, unknown> | null;
};
