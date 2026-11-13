import { and, eq } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { getEvaluationScoreNames } from "@/lib/actions/evaluation";
import { buildEvalStatsQuery, type EvalFilter, type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";
import { getSearchTraceIds } from "@/lib/actions/evaluation/search";
import { fetchEvalTaskPage } from "@/lib/actions/evaluation/task-page";
import { calculateScoreDistribution, calculateScoreStatistics } from "@/lib/actions/evaluation/utils";
import { executeQuery, SHARED_ACTOR } from "@/lib/actions/sql";
import { DEFAULT_SEARCH_MAX_HITS } from "@/lib/actions/traces/utils";
import { db } from "@/lib/db/drizzle";
import { evaluations, sharedEvals } from "@/lib/db/migrations/schema";
import { resolveEvalColumns } from "@/lib/evaluation/columns";
import { taskMeanScores } from "@/lib/evaluation/task-groups";
import {
  type Evaluation,
  type EvaluationResultsInfo,
  type EvaluationScoreDistributionBucket,
  type EvaluationScoreStatistics,
} from "@/lib/evaluation/types";

export async function getSharedEvaluation({ evaluationId }: { evaluationId: string }) {
  // Non-UUID → not found, rather than a Postgres cast error (500) in every caller.
  if (!z.guid().safeParse(evaluationId).success) return undefined;

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

/** Column ids of a `columns` JSON param. Any SQL it carries is ignored: shared reads resolve SQL server-side. */
export const parseColumnIds = (json: string | undefined): string[] => {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c) => c?.id).filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
};

// Score names come from the evaluation, so no text from the request reaches the SQL.
const resolveSharedColumns = async (
  columnIds: string[],
  projectId: string,
  evaluationId: string
): Promise<EvalQueryColumn[]> => {
  const scoreNames = columnIds.some((id) => id.startsWith("score:"))
    ? await getEvaluationScoreNames({ projectId, evaluationId }, { actor: SHARED_ACTOR })
    : [];
  return resolveEvalColumns(columnIds, scoreNames);
};

export async function getSharedEvaluationTrials({
  evaluationId,
  pageNumber,
  pageSize,
  filters,
  search,
  searchIn,
  sortBy,
  sortDirection,
  columnIds,
}: {
  evaluationId: string;
  pageNumber: number;
  pageSize: number;
  filters: EvalFilter[];
  search?: string | null;
  searchIn?: string[];
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
  columnIds: string[];
}): Promise<EvaluationResultsInfo | undefined> {
  const shared = await getSharedEvaluation({ evaluationId });
  if (!shared) {
    return undefined;
  }

  const { evaluation, projectId } = shared;

  const columns = await resolveSharedColumns(columnIds, projectId, evaluationId);
  if (columns.length === 0) {
    return { evaluation, results: [] };
  }

  const allFilters = compact(filters);

  let limit = pageSize;
  let offset = Math.max(0, pageNumber * pageSize);

  const searchTraceIds = await getSearchTraceIds(projectId, search, searchIn ?? [], evaluation.createdAt);

  if (search) {
    if (searchTraceIds.length === 0) {
      return { evaluation, results: [] };
    } else {
      limit = DEFAULT_SEARCH_MAX_HITS;
      offset = 0;
    }
  }

  const results = await fetchEvalTaskPage((q) => executeQuery({ ...q, projectId }, { actor: SHARED_ACTOR }), {
    evaluationId,
    columns,
    traceIds: searchTraceIds,
    filters: allFilters,
    limit,
    offset,
    sortBy: sortBy === "taskId" || columns.some((c) => c.id === sortBy) ? sortBy : undefined,
    sortDirection,
  });

  return { evaluation, results };
}

export async function getSharedEvaluationStatistics({
  evaluationId,
  filters,
  search,
  searchIn,
  columnIds,
}: {
  evaluationId: string;
  filters: EvalFilter[];
  search?: string | null;
  searchIn?: string[];
  columnIds: string[];
}): Promise<
  | {
      evaluation: Evaluation;
      allStatistics: Record<string, EvaluationScoreStatistics>;
      allDistributions: Record<string, EvaluationScoreDistributionBucket[]>;
    }
  | undefined
> {
  const shared = await getSharedEvaluation({ evaluationId });
  if (!shared) {
    return undefined;
  }

  const { evaluation, projectId } = shared;
  const allFilters = compact(filters);
  const columns = await resolveSharedColumns(columnIds, projectId, evaluationId);

  const searchTraceIds = await getSearchTraceIds(projectId, search, searchIn ?? [], evaluation.createdAt);

  if (search && searchTraceIds.length === 0) {
    return {
      evaluation,
      allStatistics: {},
      allDistributions: {},
    };
  }

  const { query: statsQuery, parameters: statsParams } = buildEvalStatsQuery({
    evaluationId,
    traceIds: searchTraceIds,
    filters: allFilters,
    columns,
  });

  const rawResults = await executeQuery<{ task_id: string; scores: string }>(
    {
      query: statsQuery,
      parameters: statsParams,
      projectId,
    },
    { actor: SHARED_ACTOR }
  );

  // Mean of Task means: a Task with many Trials counts once.
  const parsedResults = taskMeanScores(rawResults);

  const scoreNamesInRows = [...new Set(parsedResults.flatMap((r) => (r.scores ? Object.keys(r.scores) : [])))];

  const allStatistics: Record<string, EvaluationScoreStatistics> = {};
  const allDistributions: Record<string, EvaluationScoreDistributionBucket[]> = {};

  scoreNamesInRows.forEach((scoreName) => {
    allStatistics[scoreName] = calculateScoreStatistics(parsedResults as any, scoreName);
    allDistributions[scoreName] = calculateScoreDistribution(parsedResults as any, scoreName);
  });

  return {
    evaluation,
    allStatistics,
    allDistributions,
  };
}
