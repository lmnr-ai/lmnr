import { and, eq, inArray } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationSchema, SortSchema } from "@/lib/actions/common/types";
import {
  buildEvalQuery,
  buildEvalStatsQuery,
  EvalFilterSchema,
  type EvalQueryColumn,
} from "@/lib/actions/evaluation/query-builder";
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

const EvalFiltersSchema = z.object({
  filter: z
    .array(z.string())
    .default([])
    .transform((filters, ctx) =>
      filters
        .map((filter) => {
          try {
            const parsed = JSON.parse(filter);
            return EvalFilterSchema.parse(parsed);
          } catch {
            ctx.issues.push({
              code: "custom",
              message: `Invalid filter JSON: ${filter}`,
              input: filter,
            });
            return undefined;
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== undefined)
    ),
});

export const GetEvaluationDatapointsSchema = z.object({
  ...EvalFiltersSchema.shape,
  ...PaginationSchema.shape,
  ...SortSchema.shape,
  evaluationId: z.guid(),
  projectId: z.guid(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
  targetId: z.guid().optional(),
  columns: z.string().optional(),
  sortSql: z.string().optional(),
});

export const GetEvaluationStatisticsSchema = z.object({
  ...EvalFiltersSchema.shape,
  evaluationId: z.guid(),
  projectId: z.guid(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
  columns: z.string().optional(),
});

export const RenameEvaluationSchema = z.object({
  evaluationId: z.guid(),
  projectId: z.guid(),
  name: z.string().min(1, "Name is required"),
});

export const getEvaluationScoreNames = async ({
  projectId,
  evaluationId,
}: {
  projectId: string;
  evaluationId: string;
}): Promise<string[]> => {
  const rows = await executeQuery<{ name: string }>({
    query: `
      SELECT DISTINCT arrayJoin(JSONExtractKeys(scores)) AS name
      FROM evaluation_datapoints
      WHERE evaluation_id = {evaluationId:UUID}
        AND length(scores) > 0
      ORDER BY name
    `,
    parameters: { evaluationId },
    projectId,
  });
  return rows.map((r) => r.name).filter(Boolean);
};

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
  let columns: EvalQueryColumn[] = [];
  if (columnsJson) {
    try {
      columns = JSON.parse(columnsJson);
    } catch {
      columns = [];
    }
  }

  if (columns.length === 0) {
    return { evaluation: evaluation as Evaluation, results: [] };
  }

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
}> => {
  const { projectId, evaluationId, search, searchIn, filter: inputFilters, columns: columnsJson } = input;

  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  const allFilters = compact(inputFilters);
  let columns: EvalQueryColumn[] = [];
  if (columnsJson) {
    try {
      columns = JSON.parse(columnsJson);
    } catch {
      columns = [];
    }
  }

  // Step 1: Get trace IDs from search if provided
  const searchTraceIds = await getSearchTraceIds(projectId, search, searchIn, evaluation.createdAt);

  if (search && searchTraceIds.length === 0) {
    return {
      evaluation: evaluation as Evaluation,
      allStatistics: {},
      allDistributions: {},
    };
  }

  // Build statistics from the filtered row set. The canonical list of
  // score names is owned by the page (`getEvaluationScoreNames`) and the
  // FE store — this endpoint only reports per-name distributions/stats
  // for the current filter. Names with zero matching rows are simply
  // absent from the response; the FE renders neutral values for them.
  const { query: statsQuery, parameters: statsParams } = buildEvalStatsQuery({
    evaluationId,
    traceIds: searchTraceIds,
    filters: allFilters,
    columns,
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

  const scoreNamesInRows = [...new Set(parsedResults.flatMap((r) => (r.scores ? Object.keys(r.scores) : [])))];

  const allStatistics: Record<string, EvaluationScoreStatistics> = {};
  const allDistributions: Record<string, EvaluationScoreDistributionBucket[]> = {};

  scoreNamesInRows.forEach((scoreName) => {
    allStatistics[scoreName] = calculateScoreStatistics(parsedResults as any, scoreName);
    allDistributions[scoreName] = calculateScoreDistribution(parsedResults as any, scoreName);
  });

  return {
    evaluation: evaluation as Evaluation,
    allStatistics,
    allDistributions,
  };
};

export const GetEvaluationCellValueSchema = z.object({
  evaluationId: z.guid(),
  projectId: z.guid(),
  datapointId: z.guid(),
  column: z.string(), // JSON-encoded { id, sql } where sql is the fullSql expression
});

export const getEvaluationCellValue = async (input: z.infer<typeof GetEvaluationCellValueSchema>): Promise<unknown> => {
  const { projectId, evaluationId, datapointId, column: columnJson } = input;

  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  let col: EvalQueryColumn;
  try {
    col = JSON.parse(columnJson);
  } catch {
    throw new Error("Invalid column JSON");
  }

  const query = `SELECT ${col.sql} as ${col.id} FROM evaluation_datapoints WHERE evaluation_id = {evaluation_id:UUID} AND id = {datapoint_id:UUID} LIMIT 1`;
  const parameters = { evaluation_id: evaluationId, datapoint_id: datapointId };

  const results = await executeQuery<Record<string, unknown>>({
    query,
    parameters,
    projectId,
  });

  if (results.length === 0) {
    return null;
  }

  return results[0][col.id] ?? null;
};

export const GetEvaluationDatapointComparisonSchema = z.object({
  projectId: z.guid(),
  evaluationIds: z.array(z.guid()).min(1),
  index: z.number().int().nonnegative(),
});

export type EvaluationDatapointComparisonRow = {
  evaluationId: string;
  index: number;
  scores: Record<string, number>;
  traceId: string;
};

export const getEvaluationDatapointComparison = async (
  input: z.infer<typeof GetEvaluationDatapointComparisonSchema>
): Promise<EvaluationDatapointComparisonRow[]> => {
  const { projectId, evaluationIds, index } = input;

  // Authz: only consider evaluations that actually belong to this project.
  // Filter at the DB instead of loading every project eval into memory.
  const owned = await db.query.evaluations.findMany({
    where: and(eq(evaluations.projectId, projectId), inArray(evaluations.id, evaluationIds)),
    columns: { id: true },
  });
  const filteredIds = owned.map((e) => e.id);
  if (filteredIds.length === 0) return [];

  // Aliases must NOT shadow a column used in WHERE: ClickHouse resolves the WHERE
  // reference to the SELECT alias, so `toString(evaluation_id) AS evaluation_id`
  // would turn `WHERE evaluation_id IN (...)` into a String-vs-UUID compare that
  // matches nothing. Use distinct alias names (`eval_id` / `tid`) instead.
  // `index` is inlined (Zod-validated non-negative int) rather than a bound param.
  // `scores` may come back as a string or an object depending on the driver.
  const rows = await executeQuery<{
    evaluationId: string;
    idx: number | string;
    scores: string | Record<string, unknown>;
    traceId: string;
  }>({
    query: `
      SELECT evaluation_id AS evaluationId, \`index\` AS idx, scores, trace_id AS traceId
      FROM evaluation_datapoints
      WHERE evaluation_id IN ({evaluationIds:Array(UUID)})
        AND \`index\` = ${index}
    `,
    parameters: { evaluationIds: filteredIds },
    projectId,
  });

  return rows.map((r) => {
    let scoresObj: Record<string, unknown> | null = null;
    if (typeof r.scores === "string") {
      try {
        scoresObj = r.scores ? (JSON.parse(r.scores) as Record<string, unknown>) : null;
      } catch {
        scoresObj = null;
      }
    } else if (r.scores && typeof r.scores === "object") {
      scoresObj = r.scores;
    }

    const scores: Record<string, number> = scoresObj
      ? Object.fromEntries(
          Object.entries(scoresObj).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])
          )
        )
      : {};
    return { evaluationId: r.evaluationId, index: Number(r.idx), scores, traceId: r.traceId };
  });
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
