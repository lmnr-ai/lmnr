import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { processTraceFilters } from "@/lib/actions/traces/utils";
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

export async function getTraces(input: z.infer<typeof GetTracesSchema>) {
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

  let searchTraceIds = null;
  if (search) {
    const timeRange = getTimeRange(pastHours, startTime, endTime);
    const searchResult = await searchSpans({
      projectId,
      searchQuery: search,
      timeRange,
      searchType: searchIn as SpanSearchType[],
    });
    searchTraceIds = Array.from(searchResult.traceIds);
  }

  const topLevelSpans = db
    .select({
      inputPreview: spans.inputPreview,
      outputPreview: spans.outputPreview,
      path: sql<string>`attributes ->> 'lmnr.span.path'`.as("path"),
      name: spans.name,
      spanType: spans.spanType,
      traceId: spans.traceId,
    })
    .from(spans)
    .where(
      and(
        eq(spans.projectId, projectId),
        isNull(spans.parentSpanId),
        ...getDateRangeFilters(startTime || null, endTime || null, pastHours || null)
      )
    )
    .as("top_level_spans");

  const baseQuery = db.$with("traces_info").as(
    db
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
        topSpanInputPreview: topLevelSpans.inputPreview,
        topSpanOutputPreview: topLevelSpans.outputPreview,
        topSpanPath: topLevelSpans.path,
        topSpanName: topLevelSpans.name,
        topSpanType: topLevelSpans.spanType,
        status: traces.status,
        userId: traces.userId,
        latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`.as("latency"),
      })
      .from(traces)
      .leftJoin(topLevelSpans, eq(traces.id, topLevelSpans.traceId))
      .where(
        and(
          eq(traces.projectId, projectId),
          eq(traces.traceType, traceType),
          isNotNull(traces.startTime),
          isNotNull(traces.endTime),
          ...getDateRangeFilters(startTime || null, endTime || null, pastHours || null)
        )
      )
  );

  const query = db
    .with(baseQuery)
    .selectDistinctOn([baseQuery.startTime, baseQuery.id], {
      id: baseQuery.id,
      startTime: baseQuery.startTime,
      endTime: baseQuery.endTime,
      sessionId: baseQuery.sessionId,
      metadata: baseQuery.metadata,
      projectId: baseQuery.projectId,
      inputTokenCount: baseQuery.inputTokenCount,
      outputTokenCount: baseQuery.outputTokenCount,
      totalTokenCount: baseQuery.totalTokenCount,
      inputCost: baseQuery.inputCost,
      outputCost: baseQuery.outputCost,
      cost: baseQuery.cost,
      traceType: baseQuery.traceType,
      topSpanInputPreview: baseQuery.topSpanInputPreview,
      topSpanOutputPreview: baseQuery.topSpanOutputPreview,
      topSpanPath: baseQuery.topSpanPath,
      topSpanName: baseQuery.topSpanName,
      topSpanType: baseQuery.topSpanType,
      status: baseQuery.status,
      userId: baseQuery.userId,
    })
    .from(baseQuery);

  const baseCountQuery = db
    .with(baseQuery)
    .select({
      totalCount: sql<number>`COUNT(DISTINCT(id))`.as("total_count"),
    })
    .from(baseQuery);

  let filters = [eq(baseQuery.projectId, projectId)];
  if (searchTraceIds) {
    filters.push(inArray(baseQuery.id, searchTraceIds));
  }

  const processedFilters = processTraceFilters(urlParamFilters);

  const traceQuery = query
    .where(and(...filters.concat(processedFilters)))
    .orderBy(desc(baseQuery.startTime))
    .limit(pageSize)
    .offset(pageNumber * pageSize);

  const countQuery = baseCountQuery.where(and(...filters.concat(processedFilters)));

  const [items, totalCount] = await Promise.all([traceQuery, countQuery]);

  return { items, totalCount: totalCount[0].totalCount };
}

export async function deleteTraces(input: z.infer<typeof DeleteTracesSchema>) {
  const { projectId, traceIds } = input;

  await db.transaction(async (tx) => {
    await tx.delete(spans).where(and(inArray(spans.traceId, traceIds), eq(spans.projectId, projectId)));
    await tx.delete(traces).where(and(inArray(traces.id, traceIds), eq(traces.projectId, projectId)));
  });
}

export { TRACES_TRACE_VIEW_WIDTH };
