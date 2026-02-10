import { and, eq } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { STATIC_COLUMNS } from "@/components/evaluation/columns/index";
import { FiltersSchema, PaginationFiltersSchema } from "@/lib/actions/common/types";
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
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { type TimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";
import {
  type Evaluation,
  type EvaluationResultsInfo,
  type EvaluationScoreDistributionBucket,
  type EvaluationScoreStatistics,
} from "@/lib/evaluation/types.ts";

import { DEFAULT_SEARCH_MAX_HITS } from "../traces/utils";

export const EVALUATION_TRACE_VIEW_WIDTH = "evaluation-trace-view-width";

export const GetEvaluationDatapointsSchema = PaginationFiltersSchema.extend({
  evaluationId: z.string(),
  projectId: z.string(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
  targetId: z.string().optional(),
});

export const GetEvaluationStatisticsSchema = FiltersSchema.extend({
  evaluationId: z.string(),
  projectId: z.string(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export const RenameEvaluationSchema = z.object({
  evaluationId: z.string(),
  projectId: z.string(),
  name: z.string().min(1, "Name is required"),
});

/** Build the column list for the eval query from the static column definitions */
function getQueryColumns(): EvalQueryColumn[] {
  return STATIC_COLUMNS
    .filter((c) => c.meta?.sql)
    .map((c) => ({ id: c.id!, sql: c.meta!.sql! }));
}

export const getEvaluationDatapoints = async (
  input: z.infer<typeof GetEvaluationDatapointsSchema>
): Promise<EvaluationResultsInfo> => {
  const {
    projectId,
    evaluationId,
    pageNumber,
    pageSize,
    search,
    searchIn,
    filter: inputFilters,
    sortBy,
    sortDirection,
    targetId,
  } = input;

  // Auth check: verify evaluation exists and belongs to project
  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  const allFilters = compact(inputFilters);

  let limit = pageSize;
  let offset = Math.max(0, pageNumber * pageSize);

  // Step 1: Get trace IDs from search if provided
  const searchTraceIds = await getSearchTraceIds(projectId, search, searchIn, evaluation.createdAt);

  if (search) {
    if (searchTraceIds.length === 0) {
      return { evaluation: evaluation as Evaluation, results: [] };
    } else {
      limit = DEFAULT_SEARCH_MAX_HITS;
      offset = 0;
    }
  }

  // Step 2: Build and execute single JOIN query
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
    targetId: targetId ?? undefined,
  });

  const results = await executeQuery<Record<string, unknown>>({
    query,
    parameters,
    projectId,
  });

  return {
    evaluation: evaluation as Evaluation,
    results,
  };
};

export const getEvaluationStatistics = async (
  input: z.infer<typeof GetEvaluationStatisticsSchema>
): Promise<{
  evaluation: Evaluation;
  allStatistics: Record<string, EvaluationScoreStatistics>;
  allDistributions: Record<string, EvaluationScoreDistributionBucket[]>;
  scores: string[];
}> => {
  const { projectId, evaluationId, search, searchIn, filter: inputFilters } = input;

  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  const allFilters = compact(inputFilters);

  // Step 1: Get trace IDs from search if provided
  const searchTraceIds = await getSearchTraceIds(projectId, search, searchIn, evaluation.createdAt);

  if (search && searchTraceIds.length === 0) {
    return {
      evaluation: evaluation as Evaluation,
      allStatistics: {},
      allDistributions: {},
      scores: [],
    };
  }

  // Step 2: Build and execute stats query (single JOIN, returns only scores)
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

  // Step 3: Parse scores and calculate statistics
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
    evaluation: evaluation as Evaluation,
    allStatistics,
    allDistributions,
    scores: allScoreNames,
  };
};

export const renameEvaluation = async (input: z.infer<typeof RenameEvaluationSchema>) => {
  const { evaluationId, projectId, name } = RenameEvaluationSchema.parse(input);

  const [updated] = await db
    .update(evaluations)
    .set({ name })
    .where(and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)))
    .returning();

  if (!updated) {
    throw new Error("Evaluation not found");
  }

  return updated;
};

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
