import { and, eq } from "drizzle-orm";
import { compact, groupBy } from "lodash";

import { type Filter } from "@/lib/actions/common/filters";
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
import { DEFAULT_SEARCH_MAX_HITS } from "@/lib/actions/traces/utils";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { type TimeRange } from "@/lib/clickhouse/utils";
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
  search,
  searchIn,
}: {
  evaluationId: string;
  pageNumber: number;
  pageSize: number;
  filters: Filter[];
  search?: string | null;
  searchIn?: string[];
}): Promise<EvaluationResultsInfo | undefined> {
  const shared = await getSharedEvaluation({ evaluationId });
  if (!shared) {
    return undefined;
  }

  const { evaluation, projectId } = shared;
  const allFilters = compact(filters);

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
        evaluation,
        results: [],
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
        evaluation,
        results: [],
      };
    }
  } else {
    filteredTraceIds = searchTraceIds;
  }

  // Step 3: Query evaluation datapoints with datapoint filters and filtered trace IDs
  const { query: mainQuery, parameters: mainParams } = buildEvaluationDatapointsQueryWithParams({
    evaluationId,
    traceIds: filteredTraceIds,
    filters: datapointFilters,
    limit,
    offset,
    isTruncateLongColumns: true,
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
      evaluation,
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
        evaluation,
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

  return {
    start: startTime,
    end: endTime,
  };
};
