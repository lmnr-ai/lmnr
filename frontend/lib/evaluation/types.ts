import { TracePreview } from "../traces/types";

export type Evaluation = {
  id: string;
  createdAt: string;
  groupId: string;
  name: string;
  projectId: string;
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
  executorOutput: any;
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

export type EvaluationResultsInfo = {
  evaluation: Evaluation;
  results: EvaluationDatapointPreview[];
};

export type EvaluationTimeProgression = {
  timestamp: string;
  evaluationId: string;
  names: string[];
  values: string[];
};
