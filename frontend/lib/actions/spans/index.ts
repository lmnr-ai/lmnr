import { compact, groupBy } from "lodash";
import { z } from "zod/v4";

import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";
import { buildSelectQuery, SelectQueryOptions } from "@/lib/actions/common/query-builder";
import { FiltersSchema, PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { buildSpansQueryWithParams, createParentRewiring, transformSpanWithEvents } from "@/lib/actions/spans/utils";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { searchTypeToQueryFilter } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { Span } from "@/lib/traces/types";

import { searchSpans } from "../traces/search";
import { DEFAULT_SEARCH_MAX_HITS } from "../traces/utils";

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

function buildTraceSubquery({
  startTime,
  endTime,
  pastHours,
}: {
  startTime?: string;
  endTime?: string;
  pastHours?: string;
}): { condition: string; params: Record<string, any> } {
  const queryOptions: SelectQueryOptions = {
    select: {
      columns: ["id"],
      table: "traces",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "start_time",
    },
    customConditions: [
      {
        condition: `trace_type = {traceType:String}`,
        params: { traceType: "DEFAULT" },
      },
    ],
    orderBy: [
      {
        column: "start_time",
        direction: "DESC" as const,
      },
    ],
  };

  const { query, parameters } = buildSelectQuery(queryOptions);

  return {
    condition: `trace_id IN (${query})`,
    params: parameters,
  };
}

export async function getSpans(input: z.infer<typeof GetSpansSchema>): Promise<{ items: Span[] }> {
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

  const filters: Filter[] = compact(inputFilters);

  let limit = pageSize;
  let offset = Math.max(0, pageNumber * pageSize);

  const traceSubquery = buildTraceSubquery({
    startTime,
    endTime,
    pastHours,
  });

  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
      projectId,
      traceId: undefined,
      searchQuery: search,
      timeRange: { pastHours: "all" },
      searchType: searchIn as SpanSearchType[],
    })
    : [];
  let spanIds = spanHits.map((span) => span.span_id);

  if (search) {
    if (spanIds?.length === 0) {
      return { items: [] };
    } else {
      // no pagination for search results, use default limit
      limit = DEFAULT_SEARCH_MAX_HITS;
      offset = 0;
    }
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
    customConditions: [traceSubquery],
  });

  const items = await executeQuery<Span>({ query: mainQuery, parameters: mainParams, projectId });

  return {
    items,
  };
}

export const searchSpanIds = async ({
  projectId,
  searchQuery,
  traceId,
  searchType,
}: {
  projectId: string;
  searchQuery: string;
  traceId?: string;
  searchType?: SpanSearchType[];
}): Promise<string[]> => {
  let baseQuery = `
      SELECT DISTINCT(span_id) spanId FROM spans
      WHERE project_id = {projectId: UUID}
  `;

  if (traceId) {
    baseQuery += ` AND trace_id = {traceId: UUID}`;
  }

  const finalQuery = `${baseQuery} AND (${searchTypeToQueryFilter(searchType, "query")})`;

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

const getTraceTreeStructure = async ({
  projectId,
  traceId,
}: {
  projectId: string;
  traceId: string;
}): Promise<{ spanId: string; parentSpanId: string | undefined }[]> => {
  const { query, parameters } = buildSpansQueryWithParams({
    columns: ["span_id as spanId", "parent_span_id as parentSpanId"],
    projectId,
    filters: [{ value: traceId, operator: Operator.Eq, column: "trace_id" }],
  });

  return await executeQuery<{ spanId: string; parentSpanId: string }>({
    query,
    parameters,
    projectId,
  });
};

const fetchTraceEvents = async (projectId: string, traceId: string) =>
  executeQuery<{
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

const fetchTraceSpans = async ({
  projectId,
  traceId,
  spanIds,
  filters,
}: {
  projectId: string;
  traceId: string;
  spanIds: string[];
  filters: Filter[];
}) => {
  const { query, parameters } = buildSpansQueryWithParams({
    columns: [
      "span_id as spanId",
      "trace_id as traceId",
      "parent_span_id as parentSpanId",
      "name",
      "span_type as spanType",
      "formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime",
      "formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime",
      "attributes",
      "model",
      "status",
      "path",
    ],
    projectId,
    spanIds: spanIds.length > 0 ? spanIds : undefined,
    filters: [...filters, { value: traceId, operator: Operator.Eq, column: "trace_id" }],
  });

  return executeQuery<Omit<TraceViewSpan, "attributes"> & { attributes: string }>({
    query,
    parameters,
    projectId,
  });
};

export async function getTraceSpans(input: z.infer<typeof GetTraceSpansSchema>): Promise<TraceViewSpan[]> {
  const { projectId, search, traceId, searchIn, filter: inputFilters } = input;
  const filters: Filter[] = compact(inputFilters);

  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
      projectId,
      traceId,
      searchQuery: search,
      timeRange: { pastHours: "all" },
      searchType: searchIn as SpanSearchType[],
    })
    : [];
  let spanIds = spanHits.map((span) => span.span_id);

  if (search && spanIds?.length === 0) {
    return [];
  }

  const shouldApplyRewiring = search || filters.length > 0;

  const [spans, events, treeStructure] = await Promise.all([
    fetchTraceSpans({
      projectId,
      traceId,
      spanIds,
      filters,
    }),
    fetchTraceEvents(projectId, traceId),
    shouldApplyRewiring ? getTraceTreeStructure({ projectId, traceId }) : Promise.resolve([]),
  ]);

  if (spans.length === 0) {
    return [];
  }

  const parentRewiring =
    shouldApplyRewiring && treeStructure.length > 0
      ? createParentRewiring(
        spans.map((span) => span.spanId),
        treeStructure
      )
      : new Map<string, string | undefined>();

  const spanEventsMap = groupBy(events, (event) => event.spanId);
  return spans.map((span) => transformSpanWithEvents(span, spanEventsMap, parentRewiring, projectId));
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
