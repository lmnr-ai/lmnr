import { RunTrace, TracePreview, TraceMessages } from "../traces/types";


export type EvaluationWithPipelineInfo = {
  id: string;
  createdAt: string;
  name: string;
  status: string;
  projectId: string;
  evaluatorPipelineVersionId: string;
  evaluatorPipelineVersionName: String;
  evaluatorPipelineId: string;
  evaluatorPipelineName: string;
  executorPipelineVersionId?: string;
  executorPipelineVersionName?: String;
  executorPipelineId?: string;
  executorPipelineName?: string;
  datasetId: string;
  matcherMetadata?: Record<string, any>;
}

export type Evaluation = {
  id: string,
  name: string,
  status: 'Started' | 'Finished' | 'Error',
  projectId: string,
  createdAt: string,
  evaluatorPipelineVersionId: string,
  executorPipelineVersionId?: string,
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
  status: string;
  score?: number;
  data: Record<string, any>;
  target: Record<string, any>;
  executorOutput: Record<string, any>;
}

export type EvaluationDatapointPreviewWithCompared = {
  comparedId?: string;
  comparedEvaluationId?: string;
  comparedScore?: number;
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
