import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { compact } from "lodash";
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

  const spanEventsQuery = db.$with("span_events").as(
    db
      .select({
        eventSpanId: sql`events.span_id`.as("eventSpanId"),
        projectId: events.projectId,
        events: sql`jsonb_agg(jsonb_build_object(
        'id', events.id,
        'spanId', events.span_id,
        'timestamp', events.timestamp,
        'name', events.name,
        'attributes', events.attributes
      ))`.as("events"),
      })
      .from(events)
      .where(
        and(
          eq(events.projectId, projectId),
          // This check may seem redundant because there is a join statement below,
          // but it makes much wiser use of indexes and is much faster (up to 1000x in theory)
          inArray(
            events.spanId,
            sql`(SELECT span_id FROM spans
            WHERE project_id = ${projectId} AND trace_id = ${traceId}
            ${searchSpanIds.length > 0 ? sql`AND span_id IN ${searchSpanIds}` : sql``}
          )`
          )
        )
      )
      .groupBy(events.spanId, events.projectId)
  );

  const spanItems = await db
    .with(spanEventsQuery)
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
      events: sql`COALESCE(${spanEventsQuery.events}, '[]'::jsonb)`.as("events"),
    })
    .from(spans)
    .leftJoin(
      spanEventsQuery,
      and(eq(spans.spanId, spanEventsQuery.eventSpanId), eq(spans.projectId, spanEventsQuery.projectId))
    )
    .where(
      and(
        eq(spans.traceId, traceId),
        eq(spans.projectId, projectId),
        ...processedFilters,
        ...(search !== null ? [inArray(spans.spanId, searchSpanIds)] : [])
      )
    )
    .orderBy(asc(spans.startTime));

  // For now we flatten the span tree in the front-end if there is a search query,
  // so we explicitly set the parentSpanId to null
  return spanItems.map((span) => ({
    ...span,
    parentSpanId: searchSpanIds.length > 0 || urlParamFilters.length > 0 ? null : span.parentSpanId,
  }));
}

export async function deleteSpans(input: z.infer<typeof DeleteSpansSchema>) {
  const { projectId, spanIds } = input;

  await db.delete(spans).where(and(inArray(spans.spanId, spanIds), eq(spans.projectId, projectId)));
}
