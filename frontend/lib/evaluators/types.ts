export interface Evaluator {
  id: string;
  projectId: string;
  name: string;
  evaluatorType: string;
  definition: Record<string, unknown>;
  createdAt: string;
}

enum EvaluatorScoreSourceType {
  Evaluator,
  SDK,
}

export interface EvaluatorScore {
  id: string;
  evaluatorId?: string;
  name: string;
  source: EvaluatorScoreSourceType;
  metadata: Record<string, unknown>;
  spanId: string;
  score: number;
  createdAt: string;
}
