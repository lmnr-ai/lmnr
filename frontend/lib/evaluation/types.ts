import { TracePreview } from "../traces/types";

export type Evaluation = {
  id: string;
  createdAt: string;
  groupId: string;
  name: string;
  projectId: string;
  metadata: Record<string, unknown> | null;
};

export type EvaluationDatapoint = {
  id: string;
  evaluationId: string;
  scores: Record<string, number>;
  data: Record<string, any>;
  target: Record<string, any>;
  executorOutput: Record<string, any> | null;
  executorTrace: TracePreview | null;
  evaluatorTrace: TracePreview | null;
};

export type EvaluationDatapointPreview = {
  id: string;
  evaluationId: string;
  createdAt: string;
  scores?: Record<string, any>;
  data: any;
  target: any;
  metadata?: Record<string, any>;
  executorOutput: any;
  status: string | null;
  traceId: string;
  index: number;
  startTime: string;
  endTime: string;
  inputCost: number;
  outputCost: number;
};

export type EvaluationDatapointPreviewWithCompared = {
  comparedId?: string;
  comparedEvaluationId?: string;
  comparedScores?: Record<string, any>;
  comparedStartTime?: string;
  comparedEndTime?: string;
  comparedInputCost?: number;
  comparedOutputCost?: number;
  comparedTraceId?: string;
} & EvaluationDatapointPreview;

export type EvaluationStats = {
  averageScores: Record<string, number>;
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
  results: EvaluationDatapointPreview[];
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
};

export type EvaluationTimeProgression = {
  timestamp: string;
  evaluationId: string;
  names: string[];
  values: string[];
};

// Type for the evaluation result with scores
export type EvaluationResultWithScores = {
  id: string;
  createdAt: string;
  evaluationId: string;
  data: unknown;
  target: unknown;
  executorOutput: unknown;
  scores: unknown;
  index: number;
  traceId: string;
  startTime: string | null;
  endTime: string | null;
  inputCost: number | null;
  outputCost: number | null;
};
