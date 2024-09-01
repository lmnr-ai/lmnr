import { TracePreview } from "../traces/types";


export type Evaluation = {
  id: string,
  createdAt: string,
  name: string,
  status: 'Started' | 'Finished' | 'Error',
  projectId: string,
  metadata: Record<string, any> | null,
}

export type EvaluationDatapoint = {
  id: string;
  evaluationId: string;
  status: string;
  score: number | null;
  data: Record<string, any>;
  target: Record<string, any>;
  executorOutput: Record<string, any> | null;
  executorTrace: TracePreview | null;
  evaluatorTrace: TracePreview | null;
  error: EvaluationDatapointError | null;
}

export type EvaluationDatapointPreview = {
  id: string;
  evaluationId: string;
  createdAt: string;
  status: string;
  scores?: Record<string, any>;
  data: Record<string, any>;
  target: Record<string, any>;
  executorOutput: Record<string, any>;
  error?: any;
}

export type EvaluationDatapointPreviewWithCompared = {
  comparedId?: string;
  comparedEvaluationId?: string;
  comparedScores?: Record<string, any>;
} & EvaluationDatapointPreview

export type EvaluationStats = {
  averageScore?: number;
  averageExecutorTime?: number;
  averageEvaluatorTime?: number;
  executorTokens?: number;
  evaluatorTokens?: number;
  executorCost?: number;
  evaluatorCost?: number;
}

export type EvaluationResultsInfo = {
  evaluation: Evaluation;
  results: EvaluationDatapointPreview[];
}

export type EvaluationDatapointError = {
  errorType: string;
  error: string;
  executorInputNodeNames: string[] | null;
  evaluatorInputNodeNames: string[] | null;
}