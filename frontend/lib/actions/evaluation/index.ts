import { and, eq } from "drizzle-orm";
import { compact, groupBy } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { FiltersSchema, PaginationFiltersSchema } from "@/lib/actions/common/types";
import {
  buildEvaluationDatapointsQueryWithParams,
  buildEvaluationStatisticsQueryWithParams,
  buildTracesForEvaluationQueryWithParams,
  calculateScoreDistribution,
  calculateScoreStatistics,
  separateFilters,
} from "@/lib/actions/evaluation/utils";
import { executeQuery } from "@/lib/actions/sql";
import { getTracesByIds } from "@/lib/actions/traces";
import { searchSpans } from "@/lib/actions/traces/search";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { type TimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";
import {
  type Evaluation,
  type EvaluationDatapointPreview,
  type EvaluationDatapointRow,
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

export const getEvaluationDatapoints = async (
  input: z.infer<typeof GetEvaluationDatapointsSchema>
): Promise<EvaluationResultsInfo> => {
  const { projectId, evaluationId, pageNumber, pageSize, search, searchIn, filter: inputFilters } = input;

  // First, get the evaluation
  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  const allFilters = compact(inputFilters);

  let limit = pageSize;
  let offset = Math.max(0, pageNumber * pageSize);

  // Separate filters into trace and datapoint filters
  const { traceFilters, datapointFilters } = separateFilters(allFilters);

  // Step 1: Get trace IDs from search if provided
  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
      projectId,
      traceId: undefined,
      searchQuery: search,
      timeRange: getTimeRangeForEvaluation(evaluation.createdAt),
      searchType: searchIn as SpanSearchType[],
    })
    : [];
  const searchTraceIds = [...new Set(spanHits.map((span) => span.trace_id))];

  if (search) {
    if (searchTraceIds.length === 0) {
      return {
        evaluation: evaluation as Evaluation,
        results: [],
        allStatistics: {},
        allDistributions: {},
      };
    } else {
      // no pagination for search results, use default limit
      limit = DEFAULT_SEARCH_MAX_HITS;
      offset = 0;
    }
  }

  // Step 2: Apply trace-specific filters if any exist
  let filteredTraceIds: string[] = [];
  if (traceFilters.length > 0) {
    const { query: tracesQuery, parameters: tracesParams } = buildTracesForEvaluationQueryWithParams({
      evaluationId,
      traceIds: searchTraceIds, // Pass search results if any
      filters: traceFilters,
    });

    const traceResults = await executeQuery<{ id: string }>({
      query: tracesQuery,
      parameters: tracesParams,
      projectId,
    });

    filteredTraceIds = traceResults.map((r) => r.id);

    // If trace filters resulted in no matches, return empty
    if (filteredTraceIds.length === 0) {
      return {
        evaluation: evaluation as Evaluation,
        results: [],
        allStatistics: {},
        allDistributions: {},
      };
    }
  } else {
    // No trace filters, use search results if any
    filteredTraceIds = searchTraceIds;
  }

  // Step 3: Query evaluation datapoints with datapoint filters and filtered trace IDs
  const { query: mainQuery, parameters: mainParams } = buildEvaluationDatapointsQueryWithParams({
    evaluationId,
    traceIds: filteredTraceIds,
    filters: datapointFilters,
    limit,
    offset,
  });

  console.log("mainQuery", mainQuery);
  console.log("mainParams", mainParams);
  const rawResults = await executeQuery<EvaluationDatapointRow>({
    query: mainQuery,
    parameters: mainParams,
    projectId,
  });

  console.log("rawResults", rawResults);

  // Step 4: Fetch full trace data for all trace_ids in the results
  const uniqueTraceIds = [...new Set(rawResults.map((item) => item.traceId).filter(Boolean))];
  const traces = uniqueTraceIds.length > 0 ? await getTracesByIds({ projectId, traceIds: uniqueTraceIds }) : [];

  // Step 5: Transform and join data
  const tracesMap = groupBy(traces, "id");

  const results: EvaluationDatapointPreview[] = rawResults.map((row) => {
    let scores: Record<string, any> | undefined;
    try {
      const parsed = row.scores ? JSON.parse(row.scores) : {};
      scores = Object.keys(parsed).length > 0 ? parsed : undefined;
    } catch (e) {
      console.error("Error parsing scores:", e);
      scores = undefined;
    }

    let metadata: Record<string, any> | undefined;
    try {
      const parsed = row.metadata ? JSON.parse(row.metadata) : {};
      metadata = Object.keys(parsed).length > 0 ? parsed : undefined;
    } catch (e) {
      console.error("Error parsing metadata:", e);
      metadata = undefined;
    }

    // Get trace data if available
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

  // Step 6: Calculate statistics and distributions
  const allScoreNames = [...new Set(results.flatMap((result) => (result.scores ? Object.keys(result.scores) : [])))];

  const allStatistics: Record<string, EvaluationScoreStatistics> = {};
  const allDistributions: Record<string, EvaluationScoreDistributionBucket[]> = {};

  allScoreNames.forEach((scoreName) => {
    allStatistics[scoreName] = calculateScoreStatistics(results as any, scoreName);
    allDistributions[scoreName] = calculateScoreDistribution(results as any, scoreName);
  });

  return {
    evaluation: evaluation as Evaluation,
    results,
    allStatistics,
    allDistributions,
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

  // First, get the evaluation
  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  const allFilters: Filter[] = compact(inputFilters);

  // Separate filters into trace and datapoint filters
  const { traceFilters, datapointFilters } = separateFilters(allFilters);

  // Step 1: Get trace IDs from search if provided
  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
      projectId,
      traceId: undefined,
      searchQuery: search,
      timeRange: getTimeRangeForEvaluation(evaluation.createdAt),
      searchType: searchIn as SpanSearchType[],
    })
    : [];
  const searchTraceIds = [...new Set(spanHits.map((span) => span.trace_id))];

  if (search && searchTraceIds.length === 0) {
    return {
      evaluation: evaluation as Evaluation,
      allStatistics: {},
      allDistributions: {},
      scores: [],
    };
  }

  // Step 2: Apply trace-specific filters if any exist
  let filteredTraceIds: string[] = [];
  if (traceFilters.length > 0) {
    const { query: tracesQuery, parameters: tracesParams } = buildTracesForEvaluationQueryWithParams({
      evaluationId,
      traceIds: searchTraceIds,
      filters: traceFilters,
    });

    const traceResults = await executeQuery<{ id: string }>({
      query: tracesQuery,
      parameters: tracesParams,
      projectId,
    });

    filteredTraceIds = traceResults.map((r) => r.id);

    if (filteredTraceIds.length === 0) {
      return {
        evaluation: evaluation as Evaluation,
        allStatistics: {},
        allDistributions: {},
        scores: [],
      };
    }
  } else {
    filteredTraceIds = searchTraceIds;
  }

  // Step 3: Query only scores from evaluation datapoints
  const { query: statsQuery, parameters: statsParams } = buildEvaluationStatisticsQueryWithParams({
    evaluationId,
    traceIds: filteredTraceIds,
    filters: datapointFilters,
  });

  const rawResults = await executeQuery<{ scores: string }>({
    query: statsQuery,
    parameters: statsParams,
    projectId,
  });

  // Step 4: Parse scores and calculate statistics
  const parsedResults = rawResults.map((row) => {
    let scores: Record<string, any> | undefined;
    try {
      const parsed = row.scores ? JSON.parse(row.scores) : {};
      scores = Object.keys(parsed).length > 0 ? parsed : undefined;
    } catch (e) {
      console.error("Error parsing scores:", e);
      scores = undefined;
    }
    return { scores };
  });

  // Step 5: Calculate statistics and distributions
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

const getTimeRangeForEvaluation = (evaluationCreatedAt?: string): TimeRange => {
  if (!evaluationCreatedAt) {
    // Default to last 24 hours if no creation time is provided
    return {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    };
  }

  const startTime = new Date(evaluationCreatedAt);
  const endTime = new Date(evaluationCreatedAt);
  endTime.setHours(endTime.getHours() + 24); // Add 24 hours

  return {
    start: startTime,
    end: endTime,
  };
};
