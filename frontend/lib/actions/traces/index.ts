import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import {
  mergeTracesWithSpans,
  processTraceFilters,
  separateFilters,
  SpanQueryResult,
} from "@/lib/actions/traces/utils";
import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { spans, traces } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { getDateRangeFilters } from "@/lib/db/utils";

const TRACES_TRACE_VIEW_WIDTH = "traces-trace-view-width";

export const GetTracesSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  traceType: z
    .enum(["DEFAULT", "EVALUATION", "EVENT", "PLAYGROUND"])
    .nullable()
    .optional()
    .transform((val) => val || "DEFAULT"),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export const DeleteTracesSchema = z.object({
  projectId: z.string(),
  traceIds: z.array(z.string()),
});

const queryTraces = async (input: {
  projectId: string;
  startTime: string | null;
  endTime: string | null;
  pastHours: string | null;
  traceType: "DEFAULT" | "EVALUATION" | "EVENT" | "PLAYGROUND";
  traceIds?: string[];
  filters: FilterDef[];
  pageNumber: number;
  pageSize: number;
}) => {
  const { projectId, startTime, endTime, pastHours, traceType, traceIds, filters, pageNumber, pageSize } = input;

  let baseFilters = [
    eq(traces.projectId, projectId),
    eq(traces.traceType, traceType),
    isNotNull(traces.startTime),
    isNotNull(traces.endTime),
    ...getDateRangeFilters(startTime, endTime, pastHours),
  ];

  if (traceIds) {
    baseFilters.push(inArray(traces.id, traceIds));
  }

  const processedFilters = processTraceFilters(filters);

  const query = db
    .select({
      id: traces.id,
      startTime: traces.startTime,
      endTime: traces.endTime,
      sessionId: traces.sessionId,
      metadata: traces.metadata,
      projectId: traces.projectId,
      inputTokenCount: traces.inputTokenCount,
      outputTokenCount: traces.outputTokenCount,
      totalTokenCount: traces.totalTokenCount,
      hasBrowserSession: traces.hasBrowserSession,
      inputCost: traces.inputCost,
      outputCost: traces.outputCost,
      cost: traces.cost,
      traceType: traces.traceType,
      status: traces.status,
      userId: traces.userId,
      latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`.as("latency"),
    })
    .from(traces)
    .where(and(...baseFilters.concat(processedFilters)))
    .orderBy(desc(traces.startTime))
    .limit(pageSize)
    .offset(pageNumber * pageSize);

  const countQuery = db
    .select({
      totalCount: sql<number>`COUNT(*)`.as("total_count"),
    })
    .from(traces)
    .where(and(...baseFilters.concat(processedFilters)));

  const [items, totalCount] = await Promise.all([query, countQuery]);

  return { items, totalCount: totalCount[0].totalCount };
};

const queryTopLevelSpans = async (input: {
  projectId: string;
  startTime: string | null;
  endTime: string | null;
  pastHours: string | null;
  traceIds?: string[];
  filters: FilterDef[];
}) => {
  const { projectId, startTime, endTime, pastHours, traceIds, filters } = input;

  let baseFilters = [
    eq(spans.projectId, projectId),
    isNull(spans.parentSpanId),
    ...getDateRangeFilters(startTime, endTime, pastHours),
  ];

  if (traceIds) {
    baseFilters.push(inArray(spans.traceId, traceIds));
  }

  const processedFilters = processTraceFilters(filters);

  const query = db
    .select({
      inputPreview: spans.inputPreview,
      outputPreview: spans.outputPreview,
      path: sql<string>`attributes ->> 'lmnr.span.path'`.as("path"),
      name: spans.name,
      spanType: spans.spanType,
      traceId: spans.traceId,
    })
    .from(spans)
    .where(and(...baseFilters.concat(processedFilters)));

  return query;
};

const queryTracesAndSpans = async (params: {
  projectId: string;
  startTime: string | null;
  endTime: string | null;
  pastHours: string | null;
  traceType: "DEFAULT" | "EVALUATION" | "EVENT" | "PLAYGROUND";
  searchTraceIds: string[] | null;
  spansFilters: FilterDef[];
  tracesFilters: FilterDef[];
  pageNumber: number;
  pageSize: number;
}) => {
  const {
    projectId,
    startTime,
    endTime,
    pastHours,
    traceType,
    searchTraceIds,
    spansFilters,
    tracesFilters,
    pageNumber,
    pageSize,
  } = params;

  // Strategy selection: when span filters exist, query spans first to get relevant trace IDs,
  // otherwise query traces first for better performance when no span related filtering is needed.
  // This help avoiding joins on database calls that result in performance bottlenecks.
  if (spansFilters.length > 0) {
    const spansResult = await queryTopLevelSpans({
      projectId,
      startTime,
      endTime,
      pastHours,
      traceIds: searchTraceIds || undefined,
      filters: spansFilters,
    });

    const spanTraceIds = spansResult.map((span) => span.traceId);
    const combinedTraceIds = searchTraceIds ? spanTraceIds.filter((id) => searchTraceIds.includes(id)) : spanTraceIds;

    const tracesResult = await queryTraces({
      projectId,
      startTime,
      endTime,
      pastHours,
      traceType,
      traceIds: combinedTraceIds,
      filters: tracesFilters,
      pageNumber,
      pageSize,
    });

    const finalTraceIds = tracesResult.items.map((trace) => trace.id);
    const filteredSpans = spansResult.filter((span) => finalTraceIds.includes(span.traceId));

    return { tracesResult, spansResult: filteredSpans as SpanQueryResult[] };
  } else {
    const tracesResult = await queryTraces({
      projectId,
      startTime,
      endTime,
      pastHours,
      traceType,
      traceIds: searchTraceIds || undefined,
      filters: tracesFilters,
      pageNumber,
      pageSize,
    });

    const traceIds = tracesResult.items.map((trace) => trace.id);
    const spansResult = await queryTopLevelSpans({
      projectId,
      startTime,
      endTime,
      pastHours,
      traceIds,
      filters: [],
    });

    return { tracesResult, spansResult: spansResult as SpanQueryResult[] };
  }
};

export const getTraces = async (input: z.infer<typeof GetTracesSchema>) => {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    pageNumber,
    pageSize,
    traceType,
    search,
    searchIn,
    filter: inputFilters,
  } = input;

  const urlParamFilters: FilterDef[] = compact(inputFilters);

  // Breakdown filters in two categories to apply them to separate queries of spans and traces.
  const { spansFilters, tracesFilters } = separateFilters(urlParamFilters);

  const searchTraceIds = search
    ? Array.from(
      (
        await searchSpans({
          projectId,
          searchQuery: search,
          timeRange: getTimeRange(pastHours, startTime, endTime),
          searchType: searchIn as SpanSearchType[],
        })
      ).traceIds
    )
    : null;

  const baseParams = {
    projectId,
    startTime: startTime || null,
    endTime: endTime || null,
    pastHours: pastHours ? String(pastHours) : null,
    traceType,
    searchTraceIds,
    tracesFilters,
    pageNumber,
    pageSize,
  };

  const { tracesResult, spansResult } = await queryTracesAndSpans({
    ...baseParams,
    spansFilters,
  });

  return mergeTracesWithSpans(tracesResult, spansResult);
};

export async function deleteTraces(input: z.infer<typeof DeleteTracesSchema>) {
  const { projectId, traceIds } = input;

  await db.transaction(async (tx) => {
    await tx.delete(spans).where(and(inArray(spans.traceId, traceIds), eq(spans.projectId, projectId)));
    await tx.delete(traces).where(and(inArray(traces.id, traceIds), eq(traces.projectId, projectId)));
  });
}

export { TRACES_TRACE_VIEW_WIDTH };
