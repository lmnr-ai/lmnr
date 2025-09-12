import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { compact, groupBy, isNil } from "lodash";
import { z } from "zod/v4";

import { FiltersSchema, PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { processSpanFilters, processTraceSpanFilters } from "@/lib/actions/spans/utils";
import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange, TimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { events, spans, traces } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { getDateRangeFilters } from "@/lib/db/utils";

export const GetSpansSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export const GetTraceSpansSchema = FiltersSchema.extend({
  projectId: z.string(),
  traceId: z.string(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export const DeleteSpansSchema = z.object({
  projectId: z.string(),
  spanIds: z.array(z.string()),
});

export async function getSpans(input: z.infer<typeof GetSpansSchema>) {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    pageNumber,
    pageSize,
    search,
    searchIn,
    filter: inputFilters,
  } = input;

  const urlParamFilters: FilterDef[] = compact(inputFilters);

  let searchSpanIds = null;
  if (search) {
    const timeRange = getTimeRange(pastHours, startTime, endTime);
    const searchResult = await searchSpans({
      projectId,
      searchQuery: search,
      timeRange,
      searchType: searchIn as SpanSearchType[],
    });
    searchSpanIds = Array.from(searchResult.spanIds);
  }

  const baseFilters = [
    inArray(
      sql`trace_id`,
      db
        .select({ id: traces.id })
        .from(traces)
        .where(and(eq(traces.traceType, "DEFAULT"), eq(traces.projectId, projectId)))
    ),
    sql`project_id = ${projectId}`,
  ];

  const textSearchFilters = searchSpanIds ? [inArray(sql`span_id`, searchSpanIds)] : [];

  const processedFilters = processSpanFilters(urlParamFilters);

  const allSqlFilters = [
    ...getDateRangeFilters(startTime || null, endTime || null, pastHours || null),
    ...processedFilters,
    ...textSearchFilters,
  ];

  const { input: spanInput, output, ...columns } = getTableColumns(spans);

  const baseQuery = db
    .select({
      ...columns,
      latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`.as("latency"),
      path: sql<string>`attributes ->> 'lmnr.span.path'`.as("path"),
      model: sql<string>`COALESCE(attributes ->> 'gen_ai.response.model', attributes ->> 'gen_ai.request.model')`.as(
        "model"
      ),
    })
    .from(spans)
    .where(and(...baseFilters.concat(allSqlFilters)))
    .orderBy(desc(spans.startTime))
    .limit(pageSize)
    .offset(pageNumber * pageSize);

  const countQuery = db
    .select({
      totalCount: sql<number>`COUNT(*)`.as("total_count"),
    })
    .from(spans)
    .where(and(...baseFilters.concat(allSqlFilters)));

  const [items, totalCount] = await Promise.all([baseQuery, countQuery]);

  return { items, totalCount: totalCount[0].totalCount };
}

export async function getTraceSpans(input: z.infer<typeof GetTraceSpansSchema>) {
  const { projectId, traceId, search, searchIn, filter: inputFilters } = input;

  const urlParamFilters: FilterDef[] = compact(inputFilters);

  let searchSpanIds: string[] = [];
  if (search) {
    const timeRange = { pastHours: "all" } as TimeRange;
    const searchResult = await searchSpans({
      projectId,
      searchQuery: search,
      timeRange,
      traceId,
      searchType: searchIn as SpanSearchType[],
    });

    searchSpanIds = Array.from(searchResult.spanIds);
  }

  const processedFilters = processTraceSpanFilters(urlParamFilters);

  const spanItems = await db
    .select({
      // inputs and outputs are ignored on purpose
      spanId: spans.spanId,
      startTime: spans.startTime,
      endTime: spans.endTime,
      traceId: spans.traceId,
      parentSpanId: spans.parentSpanId,
      name: spans.name,
      attributes: spans.attributes,
      spanType: spans.spanType,
      status: spans.status,
    })
    .from(spans)
    .where(
      and(
        eq(spans.traceId, traceId),
        eq(spans.projectId, projectId),
        ...processedFilters,
        ...(!isNil(search) ? [inArray(spans.spanId, searchSpanIds)] : [])
      )
    )
    .orderBy(asc(spans.startTime));

  if (spanItems.length === 0) {
    return [];
  }

  // Join in memory, because json aggregation and join in PostgreSQL may be too slow
  // depending on the number of spans and events, and there is no way for us
  // to force PostgreSQL to use the correct indexes always.
  const spanEvents = await db
    .query.events.findMany({
      columns: {
        id: true,
        timestamp: true,
        spanId: true,
        projectId: true,
        // we only need basic event data for trace spans overview,
        // not attributes, so we mark it as false
        name: false,
        attributes: false,
      },
      where: and(
        eq(events.projectId, projectId),
        inArray(events.spanId, spanItems.map((span) => span.spanId))
      ),
    });

  const spanEventsMap = groupBy(spanEvents, (event) => event.spanId);

  // For now, we flatten the span tree in the front-end if there is a search query,
  // so we explicitly set the parentSpanId to null
  return spanItems.map((span) => ({
    ...span,
    events: (spanEventsMap[span.spanId] || []),
    parentSpanId: searchSpanIds.length > 0 || urlParamFilters.length > 0 ? null : span.parentSpanId,
  }));
}

export async function deleteSpans(input: z.infer<typeof DeleteSpansSchema>) {
  const { projectId, spanIds } = input;

  await db.delete(spans).where(and(inArray(spans.spanId, spanIds), eq(spans.projectId, projectId)));
}
