import { and, eq } from "drizzle-orm";
import { compact } from "lodash";

import { type Filter } from "@/lib/actions/common/filters";
import {
  buildEvaluationDatapointsQueryWithParams,
  buildEvaluationStatisticsQueryWithParams,
  calculateScoreDistribution,
  calculateScoreStatistics,
} from "@/lib/actions/evaluation/utils";
import { executeQuery } from "@/lib/actions/sql";
import { getTracesByIds } from "@/lib/actions/traces";
import { db } from "@/lib/db/drizzle";
import { evaluations, sharedEvals } from "@/lib/db/migrations/schema";
import {
  type Evaluation,
  type EvaluationDatapointPreview,
  type EvaluationDatapointRow,
  type EvaluationResultsInfo,
  type EvaluationScoreDistributionBucket,
  type EvaluationScoreStatistics,
} from "@/lib/evaluation/types";
import { groupBy } from "lodash";

export async function getSharedEvaluation({ evaluationId }: { evaluationId: string }) {
  const publicEval = await db.query.sharedEvals.findFirst({
    where: eq(sharedEvals.id, evaluationId),
  });

  if (!publicEval) {
    return undefined;
  }

  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, publicEval.projectId)),
  });

  if (!evaluation) {
    return undefined;
  }

  return { evaluation: evaluation as Evaluation, projectId: publicEval.projectId };
}

export async function getSharedEvaluationDatapoints({
  evaluationId,
  pageNumber,
  pageSize,
  filters,
}: {
  evaluationId: string;
  pageNumber: number;
  pageSize: number;
  filters: Filter[];
}): Promise<EvaluationResultsInfo | undefined> {
  const shared = await getSharedEvaluation({ evaluationId });
  if (!shared) {
    return undefined;
  }

  const { evaluation, projectId } = shared;
  const allFilters = compact(filters);

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const { query: mainQuery, parameters: mainParams } = buildEvaluationDatapointsQueryWithParams({
    evaluationId,
    traceIds: [],
    filters: allFilters,
    limit,
    offset,
  });

  const rawResults = await executeQuery<EvaluationDatapointRow>({
    query: mainQuery,
    parameters: mainParams,
    projectId,
  });

  const uniqueTraceIds = [...new Set(rawResults.map((item) => item.traceId).filter(Boolean))];
  const traces = uniqueTraceIds.length > 0 ? await getTracesByIds({ projectId, traceIds: uniqueTraceIds }) : [];
  const tracesMap = groupBy(traces, "id");

  const results: EvaluationDatapointPreview[] = rawResults.map((row) => {
    let scores: Record<string, any> | undefined;
    try {
      const parsed = row.scores ? JSON.parse(row.scores) : {};
      scores = Object.keys(parsed).length > 0 ? parsed : undefined;
    } catch {
      scores = undefined;
    }

    let metadata: Record<string, any> | undefined;
    try {
      const parsed = row.metadata ? JSON.parse(row.metadata) : {};
      metadata = Object.keys(parsed).length > 0 ? parsed : undefined;
    } catch {
      metadata = undefined;
    }

    const trace = tracesMap[row.traceId]?.[0];

    return {
      id: row.id,
      createdAt: row.createdAt,
      evaluationId: row.evaluationId,
      data: row.data,
      target: row.target,
      executorOutput: row.executorOutput,
      scores,
      index: row.index,
      traceId: row.traceId,
      startTime: trace?.startTime ?? "",
      endTime: trace?.endTime ?? "",
      inputCost: trace?.inputCost ?? 0,
      outputCost: trace?.outputCost ?? 0,
      totalCost: trace?.totalCost ?? 0,
      status: trace?.status ?? null,
      metadata,
      datasetId: row.datasetId,
      datasetDatapointId: row.datasetDatapointId,
      datasetDatapointCreatedAt: row.datasetDatapointCreatedAt,
    };
  });

  return {
    evaluation,
    results,
  };
}

export async function getSharedEvaluationStatistics({
  evaluationId,
  filters,
}: {
  evaluationId: string;
  filters: Filter[];
}): Promise<
  | {
      evaluation: Evaluation;
      allStatistics: Record<string, EvaluationScoreStatistics>;
      allDistributions: Record<string, EvaluationScoreDistributionBucket[]>;
      scores: string[];
    }
  | undefined
> {
  const shared = await getSharedEvaluation({ evaluationId });
  if (!shared) {
    return undefined;
  }

  const { evaluation, projectId } = shared;
  const allFilters = compact(filters);

  const { query: statsQuery, parameters: statsParams } = buildEvaluationStatisticsQueryWithParams({
    evaluationId,
    traceIds: [],
    filters: allFilters,
  });

  const rawResults = await executeQuery<{ scores: string }>({
    query: statsQuery,
    parameters: statsParams,
    projectId,
  });

  const parsedResults = rawResults.map((row) => {
    let scores: Record<string, any> | undefined;
    try {
      const parsed = row.scores ? JSON.parse(row.scores) : {};
      scores = Object.keys(parsed).length > 0 ? parsed : undefined;
    } catch {
      scores = undefined;
    }
    return { scores };
  });

  const allScoreNames = [
    ...new Set(parsedResults.flatMap((result) => (result.scores ? Object.keys(result.scores) : []))),
  ];

  const allStatistics: Record<string, EvaluationScoreStatistics> = {};
  const allDistributions: Record<string, EvaluationScoreDistributionBucket[]> = {};

  allScoreNames.forEach((scoreName) => {
    allStatistics[scoreName] = calculateScoreStatistics(parsedResults as any, scoreName);
    allDistributions[scoreName] = calculateScoreDistribution(parsedResults as any, scoreName);
  });

  return {
    evaluation,
    allStatistics,
    allDistributions,
    scores: allScoreNames,
  };
}
