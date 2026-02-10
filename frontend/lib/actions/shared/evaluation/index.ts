import { and, eq } from "drizzle-orm";
import { compact } from "lodash";

import { STATIC_COLUMNS } from "@/components/evaluation/columns/index";
import { type Filter } from "@/lib/actions/common/filters";
import {
  buildEvalQuery,
  buildEvalStatsQuery,
  type EvalQueryColumn,
} from "@/lib/actions/evaluation/query-builder";
import {
  calculateScoreDistribution,
  calculateScoreStatistics,
} from "@/lib/actions/evaluation/utils";
import { executeQuery } from "@/lib/actions/sql";
import { searchSpans } from "@/lib/actions/traces/search";
import { DEFAULT_SEARCH_MAX_HITS } from "@/lib/actions/traces/utils";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { type TimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { evaluations, sharedEvals } from "@/lib/db/migrations/schema";
import {
  type Evaluation,
  type EvaluationResultsInfo,
  type EvaluationScoreDistributionBucket,
  type EvaluationScoreStatistics,
} from "@/lib/evaluation/types";

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

function getQueryColumns(): EvalQueryColumn[] {
  return STATIC_COLUMNS
    .filter((c) => c.meta?.sql)
    .map((c) => ({ id: c.id!, sql: c.meta!.sql! }));
}

export async function getSharedEvaluationDatapoints({
  evaluationId,
  pageNumber,
  pageSize,
  filters,
  search,
  searchIn,
  sortBy,
  sortDirection,
}: {
  evaluationId: string;
  pageNumber: number;
  pageSize: number;
  filters: Filter[];
  search?: string | null;
  searchIn?: string[];
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
}): Promise<EvaluationResultsInfo | undefined> {
  const shared = await getSharedEvaluation({ evaluationId });
  if (!shared) {
    return undefined;
  }

  const { evaluation, projectId } = shared;
  const allFilters = compact(filters);

  let limit = pageSize;
  let offset = Math.max(0, pageNumber * pageSize);

  const searchTraceIds = await getSearchTraceIds(
    projectId, search, searchIn ?? [], evaluation.createdAt
  );

  if (search) {
    if (searchTraceIds.length === 0) {
      return { evaluation, results: [] };
    } else {
      limit = DEFAULT_SEARCH_MAX_HITS;
      offset = 0;
    }
  }

  const columns = getQueryColumns();

  const { query, parameters } = buildEvalQuery({
    evaluationId,
    columns,
    traceIds: searchTraceIds,
    filters: allFilters,
    limit,
    offset,
    sortBy,
    sortDirection,
  });

  const results = await executeQuery<Record<string, unknown>>({
    query,
    parameters,
    projectId,
  });

  return { evaluation, results };
}

export async function getSharedEvaluationStatistics({
  evaluationId,
  filters,
  search,
  searchIn,
}: {
  evaluationId: string;
  filters: Filter[];
  search?: string | null;
  searchIn?: string[];
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

  const searchTraceIds = await getSearchTraceIds(
    projectId, search, searchIn ?? [], evaluation.createdAt
  );

  if (search && searchTraceIds.length === 0) {
    return {
      evaluation,
      allStatistics: {},
      allDistributions: {},
      scores: [],
    };
  }

  const { query: statsQuery, parameters: statsParams } = buildEvalStatsQuery({
    evaluationId,
    traceIds: searchTraceIds,
    filters: allFilters,
  });

  const rawResults = await executeQuery<{ scores: string }>({
    query: statsQuery,
    parameters: statsParams,
    projectId,
  });

  const parsedResults = rawResults.map((row) => {
    let scores: Record<string, unknown> | undefined;
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

// -- Helpers --

async function getSearchTraceIds(
  projectId: string,
  search: string | null | undefined,
  searchIn: string[],
  evaluationCreatedAt?: string,
): Promise<string[]> {
  if (!search) return [];

  const spanHits = await searchSpans({
    projectId,
    traceId: undefined,
    searchQuery: search,
    timeRange: getTimeRangeForEvaluation(evaluationCreatedAt),
    searchType: searchIn as SpanSearchType[],
  });

  return [...new Set(spanHits.map((span) => span.trace_id))];
}

const getTimeRangeForEvaluation = (evaluationCreatedAt?: string): TimeRange => {
  if (!evaluationCreatedAt) {
    return {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    };
  }

  const startTime = new Date(evaluationCreatedAt);
  const endTime = new Date(evaluationCreatedAt);
  endTime.setHours(endTime.getHours() + 24);

  return { start: startTime, end: endTime };
};
