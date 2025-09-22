import { and, asc, eq, inArray } from "drizzle-orm";
import { compact, groupBy, isNil } from "lodash";
import { z } from "zod/v4";

import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { FiltersSchema, PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import {
  buildSpansCountQueryWithParams,
  buildSpansQueryWithParams,
  processTraceSpanFilters,
} from "@/lib/actions/spans/utils";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { searchSpans, searchTypeToQueryFilter } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { addTimeRangeToQuery, getTimeRange, TimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { spans } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { Span } from "@/lib/traces/types";

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
  spanIds: z.array(z.string()).min(1),
});

export async function getSpans(input: z.infer<typeof GetSpansSchema>): Promise<{ items: Span[]; count: number }> {
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

  const filters: FilterDef[] = compact(inputFilters);

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const spanIds = search
    ? await searchSpanIds({
      projectId,
      searchQuery: search,
      timeRange: getTimeRange(pastHours, startTime, endTime),
      searchType: searchIn as SpanSearchType[],
    })
    : [];

  if (search && spanIds?.length === 0) {
    return { items: [], count: 0 };
  }

  const { query: mainQuery, parameters: mainParams } = buildSpansQueryWithParams({
    projectId,
    spanIds,
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
  });

  const { query: countQuery, parameters: countParams } = buildSpansCountQueryWithParams({
    projectId,
    spanIds,
    filters,
    startTime,
    endTime,
    pastHours,
  });

  const [items, [count]] = await Promise.all([
    executeQuery<Span>({ query: mainQuery, parameters: mainParams, projectId }),
    executeQuery<{ count: number }>({ query: countQuery, parameters: countParams, projectId }),
  ]);

  return {
    items: items,
    count: count?.count || 0,
  };
}

const searchSpanIds = async ({
  projectId,
  searchQuery,
  timeRange,
  searchType,
}: {
  projectId: string;
  searchQuery: string;
  timeRange: TimeRange;
  searchType?: SpanSearchType[];
}): Promise<string[]> => {
  const baseQuery = `
      SELECT DISTINCT(span_id) spanId FROM spans
      WHERE project_id = {projectId: UUID}
  `;

  const queryWithTime = addTimeRangeToQuery(baseQuery, timeRange, "start_time");

  const finalQuery = `${queryWithTime} AND (${searchTypeToQueryFilter(searchType, "query")})`;

  const response = await clickhouseClient.query({
    query: `${finalQuery}
     ORDER BY start_time DESC
     LIMIT 1000`,
    format: "JSONEachRow",
    query_params: {
      projectId,
      query: `%${searchQuery.toLowerCase()}%`,
    },
  });

  const result = (await response.json()) as { spanId: string }[];

  return result.map((i) => i.spanId);
};

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

  const spanEvents = (await chResult.json()) as { id: string; timestamp: string; spanId: string; name: string }[];

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
  const { projectId, spanIds } = DeleteSpansSchema.parse(input);

  await clickhouseClient.command({
    query: `
        DELETE FROM spans
        WHERE project_id = {projectId: UUID} 
            AND span_id in ({spanIds: Array(UUID)})
      `,
    query_params: {
      spanIds,
      projectId,
    },
  });
}
