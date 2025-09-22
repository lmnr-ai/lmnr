import { compact, groupBy } from "lodash";
import { z } from "zod/v4";

import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Operator } from "@/components/ui/datatable-filter/utils.ts";
import { FiltersSchema, PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { buildSpansCountQueryWithParams, buildSpansQueryWithParams } from "@/lib/actions/spans/utils";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { searchTypeToQueryFilter } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { addTimeRangeToQuery, getTimeRange, TimeRange } from "@/lib/clickhouse/utils";
import { FilterDef } from "@/lib/db/modifiers";
import { Span } from "@/lib/traces/types";
import { tryParseJson } from "@/lib/utils.ts";

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
  traceId,
  searchType,
}: {
  projectId: string;
  searchQuery: string;
  timeRange: TimeRange;
  traceId?: string;
  searchType?: SpanSearchType[];
}): Promise<string[]> => {
  const baseQuery = `
      SELECT DISTINCT(span_id) spanId FROM spans
      WHERE project_id = {projectId: UUID}
  `;

  let queryWithTime = addTimeRangeToQuery(baseQuery, timeRange, "start_time");

  if (traceId) {
    queryWithTime += ` AND trace_id = {traceId: UUID}`;
  }

  const finalQuery = `${queryWithTime} AND (${searchTypeToQueryFilter(searchType, "query")})`;

  const queryParams: Record<string, any> = {
    projectId,
    query: `%${searchQuery.toLowerCase()}%`,
  };

  if (traceId) {
    queryParams.traceId = traceId;
  }

  const response = await clickhouseClient.query({
    query: `${finalQuery}
     ORDER BY start_time DESC
     LIMIT 1000`,
    format: "JSONEachRow",
    query_params: queryParams,
  });

  const result = (await response.json()) as { spanId: string }[];

  return result.map((i) => i.spanId);
};

export async function getTraceSpans(input: z.infer<typeof GetTraceSpansSchema>) {
  const { projectId, search, traceId, searchIn, filter: inputFilters } = GetTraceSpansSchema.parse(input);

  const filters: FilterDef[] = compact(inputFilters);

  const spanIds = search
    ? await searchSpanIds({
      projectId,
      traceId,
      searchQuery: search,
      timeRange: { pastHours: "all" },
      searchType: searchIn as SpanSearchType[],
    })
    : [];

  if (search && spanIds?.length === 0) {
    return { items: [], count: 0 };
  }

  const { query, parameters } = buildSpansQueryWithParams({
    columns: [
      "span_id as spanId",
      "trace_id as traceId",
      "parent_span_id as parentSpanId",
      "name",
      "span_type as spanType",
      "start_time as startTime",
      "end_time as endTime",
      "attributes",
      "model",
      "status",
      "path",
    ],
    projectId,
    spanIds,
    filters: [...filters, { value: traceId, operator: Operator.Eq, column: "trace_id" }],
  });

  const spans = await executeQuery<Omit<TraceViewSpan, "attributes"> & { attributes: string }>({
    query,
    parameters,
    projectId,
  });

  if (spans.length === 0) {
    return [];
  }

  const events = await executeQuery<{
    id: string;
    timestamp: string;
    spanId: string;
    name: string;
    attributes: string;
  }>({
    query: `
        SELECT id, timestamp, span_id spanId, name, attributes
        FROM events
        WHERE trace_id = {traceId: UUID}
    `,
    parameters: { traceId },
    projectId,
  });

  const spanEventsMap = groupBy(events, (event) => event.spanId);
  const shouldFlattenTree = spanIds.length > 0 || filters.length > 0;

  return spans.map((span) => ({
    ...span,
    attributes: tryParseJson(span.attributes) || {},
    parentSpanId:
      shouldFlattenTree || span.parentSpanId === "00000000-0000-0000-0000-000000000000" ? undefined : span.parentSpanId,
    name: span.name,
    events: (spanEventsMap[span.spanId] || []).map((event) => ({
      ...event,
      projectId,
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
