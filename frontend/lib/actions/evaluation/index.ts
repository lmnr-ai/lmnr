import { and, eq } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { EnrichedFilterSchema } from "@/lib/actions/common/filters";
import { PaginationSchema, SortSchema } from "@/lib/actions/common/types";
import { buildEvalQuery, buildEvalStatsQuery, type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";
import { getSearchTraceIds } from "@/lib/actions/evaluation/search";
import { calculateScoreDistribution, calculateScoreStatistics } from "@/lib/actions/evaluation/utils";
import { executeQuery } from "@/lib/actions/sql";
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

const EnrichedFiltersSchema = z.object({
  filter: z
    .array(z.string())
    .default([])
    .transform((filters, ctx) =>
      filters
        .map((filter) => {
          try {
            const parsed = JSON.parse(filter);
            return EnrichedFilterSchema.parse(parsed);
          } catch {
            ctx.issues.push({
              code: "custom",
              message: `Invalid enriched filter JSON: ${filter}`,
              input: filter,
            });
            return undefined;
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== undefined)
    ),
});

export const GetEvaluationDatapointsSchema = z.object({
  ...EnrichedFiltersSchema.shape,
  ...PaginationSchema.shape,
  ...SortSchema.shape,
  evaluationId: z.string(),
  projectId: z.string(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
  targetId: z.string().optional(),
  columns: z.string().optional(),
  sortSql: z.string().optional(),
});

export const GetEvaluationStatisticsSchema = z.object({
  ...EnrichedFiltersSchema.shape,
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
    sortSql,
    sortDirection,
    targetId,
    columns: columnsJson,
  } = input;

  // Auth check: verify evaluation exists and belongs to project
  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  const allFilters = compact(inputFilters);

  // Parse columns from request — FE is the source of truth
  const columns: EvalQueryColumn[] = columnsJson ? JSON.parse(columnsJson) : [];

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
  const { query, parameters } = buildEvalQuery({
    evaluationId,
    columns,
    traceIds: searchTraceIds,
    filters: allFilters,
    limit,
    offset,
    sortBy,
    sortSql,
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

