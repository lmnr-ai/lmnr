export interface Evaluator {
  id: string;
  projectId: string;
  name: string;
  evaluatorType: string;
  definition: Record<string, unknown>;
  createdAt: string;
}

export interface EvaluatorScore {
  id: string;
  evaluatorId: string;
  spanId: string;
  score: number;
  createdAt: string;
}
