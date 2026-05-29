export type ComparisonRow = {
  evaluationId: string;
  index: number;
  scores: Record<string, number>;
};

export type ComparisonResponse = {
  rows: ComparisonRow[];
};
