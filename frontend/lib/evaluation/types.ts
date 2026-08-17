import { type EvaluationStatus } from "@/lib/evaluation/status";

export type EvalRow = Record<string, unknown>;

export type Evaluation = {
  id: string;
  createdAt: string;
  groupId: string;
  name: string;
  projectId: string;
  metadata: Record<string, unknown> | null;
  /** Datapoint count. Decorated per page by `getEvaluations`. */
  dataPointsCount?: number;
  /** Derived run status. Decorated per page by `getEvaluations`. */
  status?: EvaluationStatus;
  /** The counters `status` was derived from. */
  statusCounts?: { total: number; rooted: number; scored: number; errored: number };
};

/** A dataset an evaluation's datapoints are linked to. */
export type LinkedDataset = {
  id: string;
  name: string;
};

export type EvaluationScoreStatistics = {
  averageValue: number;
  // Exact aggregates over the raw per-datapoint values so the shield respects
  // the aggregation picker. Absent when there were no scores.
  min?: number;
  max?: number;
  sum?: number;
  median?: number;
  p90?: number;
  p95?: number;
  p99?: number;
};

/**
 * Whole-run cost / token / duration totals, summed over the eval's datapoints
 * under the active filters. `cacheReadInputTokens` is a SUBSET of
 * `inputTokens` (providers already count cached reads in the prompt total), so
 * never add the two together.
 */
export type EvaluationTotals = {
  datapointCount: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  reasoningTokens: number;
  totalDuration: number;
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
