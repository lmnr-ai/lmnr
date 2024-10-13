import { TracePreview } from '../traces/types';


export type Evaluation = {
  id: string,
  createdAt: string,
  groupId: string,
  name: string,
  projectId: string,
}

export type EvaluationDatapoint = {
  id: string;
  evaluationId: string;
  scores: Record<string, number>;
  data: Record<string, any>;
  target: Record<string, any>;
  executorOutput: Record<string, any> | null;
  executorTrace: TracePreview | null;
  evaluatorTrace: TracePreview | null;
}

export type EvaluationDatapointPreview = {
  id: string;
  evaluationId: string;
  createdAt: string;
  scores?: Record<string, any>;
  data: Record<string, any>;
  target: Record<string, any>;
  executorOutput: Record<string, any>;
  traceId: string;
}

export type EvaluationDatapointPreviewWithCompared = {
  comparedId?: string;
  comparedEvaluationId?: string;
  comparedScores?: Record<string, any>;
} & EvaluationDatapointPreview

export type EvaluationStats = {
  averageScores: Record<string, number>;
};

export type EvaluationResultsInfo = {
  evaluation: Evaluation;
  results: EvaluationDatapointPreview[];
}
