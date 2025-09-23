import { compact, groupBy } from "lodash";
import { z } from "zod/v4";

import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Operator } from "@/components/ui/datatable-filter/utils.ts";
import { buildSelectQuery } from "@/lib/actions/common/query-builder";
import { FiltersSchema, PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import {
  buildSpansCountQueryWithParams,
  buildSpansQueryWithParams,
  processSpanSelection,
  transformSpanWithEvents,
} from "@/lib/actions/spans/utils";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { searchTypeToQueryFilter } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { addTimeRangeToQuery, getTimeRange, TimeRange } from "@/lib/clickhouse/utils";
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

async function getDefaultTraceIds({
  projectId,
  filters,
  startTime,
  endTime,
  pastHours,
}: {
  projectId: string;
  filters: FilterDef[];
  startTime?: string;
  endTime?: string;
  pastHours?: string;
}): Promise<string[]> {
  const customConditions = [
    {
      condition: `trace_type = {traceType:String}`,
      params: { traceType: "DEFAULT" },
    },
  ];

  const queryOptions = {
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
    filters,
    columnFilterConfig: {
      processors: new Map(),
    },
    customConditions,
    orderBy: {
      column: "start_time",
      direction: "DESC" as const,
    },
  };

  const { query, parameters } = buildSelectQuery(queryOptions);

  const result = await executeQuery<{ id: string }>({
    query,
    parameters,
    projectId,
  });

  return result.map((row) => row.id);
}

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

  const defaultTraceIds = await getDefaultTraceIds({
    projectId,
    filters,
    startTime,
    endTime,
    pastHours,
  });

  if (defaultTraceIds.length === 0) {
    return { items: [], count: 0 };
  }

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

  const traceIdCustomCondition = {
    condition: `trace_id IN ({defaultTraceIds:Array(UUID)})`,
    params: { defaultTraceIds },
  };

  const { query: mainQuery, parameters: mainParams } = buildSpansQueryWithParams({
    projectId,
    spanIds,
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
    customConditions: [traceIdCustomCondition],
  });

  const { query: countQuery, parameters: countParams } = buildSpansCountQueryWithParams({
    projectId,
    spanIds,
    filters,
    startTime,
    endTime,
    pastHours,
    customConditions: [traceIdCustomCondition],
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

export const searchSpanIds = async ({
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

const getTraceTreeStructure = async (
  projectId: string,
  traceId: string
): Promise<{ spanId: string; parentSpanId: string | undefined }[]> => {
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

export async function getTraceSpans(input: z.infer<typeof GetTraceSpansSchema>) {
  const { projectId, search, traceId, searchIn, filter: inputFilters } = input;
  const filters: FilterDef[] = compact(inputFilters);

  let finalSpanIds: string[] = [];
  let parentRewiring: Map<string, string | undefined> = new Map();

  // Apply rewiring when we have search or filters (or both)
  const shouldApplyRewiring = search || filters.length > 0;

  if (shouldApplyRewiring) {
    let matchingSpanIds: string[] = [];

    if (search) {
      // Get spans that match the search
      matchingSpanIds = await searchSpanIds({
        projectId,
        traceId,
        searchQuery: search,
        timeRange: { pastHours: "all" },
        searchType: searchIn as SpanSearchType[],
      });

      if (matchingSpanIds.length === 0) {
        return { items: [], count: 0 };
      }
    } else {
      // No search, but we have filters - query to get matching spans
      const { query: filterQuery, parameters: filterParams } = buildSpansQueryWithParams({
        columns: ["span_id as spanId"],
        projectId,
        filters: [...filters, { value: traceId, operator: Operator.Eq, column: "trace_id" }],
      });

      const filteredSpans = await executeQuery<{ spanId: string }>({
        query: filterQuery,
        parameters: filterParams,
        projectId,
      });

      matchingSpanIds = filteredSpans.map((span) => span.spanId);

      if (matchingSpanIds.length === 0) {
        return { items: [], count: 0 };
      }
    }

    // Get the complete tree structure and apply rewiring
    const treeStructure = await getTraceTreeStructure(projectId, traceId);
    const result = processSpanSelection(matchingSpanIds, treeStructure);
    finalSpanIds = result.spanIds;
    parentRewiring = result.parentRewiring;
  }

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
    spanIds: finalSpanIds.length > 0 ? finalSpanIds : undefined,
    filters: [...filters, { value: traceId, operator: Operator.Eq, column: "trace_id" }],
  });

  const [spans, events] = await Promise.all([
    executeQuery<Omit<TraceViewSpan, "attributes"> & { attributes: string }>({
      query,
      parameters,
      projectId,
    }),
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
    }),
  ]);

  if (spans.length === 0) {
    return [];
  }

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
