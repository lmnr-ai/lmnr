import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { compact, groupBy } from "lodash";
import { z } from "zod/v4";

import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { FiltersSchema, PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { tryParseJson } from "@/lib/actions/common/utils";
import { buildTraceSpansQueryWithParams } from "@/lib/actions/spans/clickhouse-utils";
import { processSpanFilters } from "@/lib/actions/spans/utils";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange, TimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { spans, traces } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { getDateRangeFilters } from "@/lib/db/utils";
import { SpanType } from "@/lib/traces/types.ts";

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

export async function getTraceSpansFromClickHouse(
  input: z.infer<typeof GetTraceSpansSchema>
): Promise<TraceViewSpan[]> {
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

  if (search && searchSpanIds.length === 0) {
    return [];
  }

  const queryResult = buildTraceSpansQueryWithParams({
    projectId,
    traceId,
    filters: urlParamFilters,
    searchSpanIds: search ? searchSpanIds : undefined,
  });

  const chResult = await clickhouseClient.query({
    query: queryResult.query,
    format: "JSONEachRow",
    query_params: queryResult.parameters,
  });

  const spanResults = (await chResult.json()) as {
    spanId: string;
    startTime: string;
    endTime: string;
    traceId: string;
    parentSpanId: string;
    name: string;
    attributes: string;
    spanType: SpanType;
    status: string;
    path: string;
  }[];

  if (spanResults.length === 0) {
    return [];
  }

  const eventsResult = await clickhouseClient.query({
    query: `
      SELECT id, timestamp, span_id spanId, name, attributes
      FROM events
      WHERE trace_id = {traceId: UUID} AND project_id = {projectId: UUID}
    `,
    format: "JSONEachRow",
    query_params: { traceId, projectId },
  });

  const spanEvents = (await eventsResult.json()) as {
    id: string;
    timestamp: string;
    spanId: string;
    name: string;
    attributes: string;
  }[];
  const spanEventsMap = groupBy(spanEvents, (event) => event.spanId);
  const shouldFlattenTree = searchSpanIds.length > 0 || urlParamFilters.length > 0;

  return spanResults.map((span) => ({
    ...span,
    parentSpanId:
      shouldFlattenTree || span.parentSpanId === "00000000-0000-0000-0000-000000000000" ? undefined : span.parentSpanId,
    name: span.name,
    attributes: tryParseJson(span.attributes) || {},
    status: span.status,
    path: span.path || "",
    events: (spanEventsMap[span.spanId] || []).map((event) => ({
      id: event.id,
      name: event.name,
      timestamp: new Date(`${event.timestamp}Z`).toISOString(),
      spanId: event.spanId,
      projectId,
      attributes: tryParseJson(event.attributes) || {},
    })),
    collapsed: false,
  }));
}

export async function deleteSpans(input: z.infer<typeof DeleteSpansSchema>) {
  const { projectId, spanIds } = input;

  await db.delete(spans).where(and(inArray(spans.spanId, spanIds), eq(spans.projectId, projectId)));
}
