import { and, asc, eq, inArray } from "drizzle-orm";
import { compact, groupBy, isNil } from "lodash";
import { z } from "zod/v4";

import { FiltersSchema, PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import {
  buildSpansCountQueryWithParams,
  buildSpansQueryWithParams,
  processTraceSpanFilters,
} from "@/lib/actions/spans/utils";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange, TimeRange } from "@/lib/clickhouse/utils";
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
    ? await searchSpansForIds({
      projectId,
      searchQuery: search,
      timeRange: getTimeRange(pastHours, startTime, endTime),
      searchType: searchIn as SpanSearchType[],
    })
    : [];

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

const searchSpansForIds = async ({
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
  const searchResult = await searchSpans({
    projectId,
    searchQuery,
    timeRange,
    searchType,
  });
  return Array.from(searchResult.spanIds);
};

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

  const chResult = await clickhouseClient.query({
    query: `
      SELECT id, timestamp, span_id spanId, name
      FROM events
      WHERE span_id IN {spanIds: Array(UUID)} AND project_id = {projectId: UUID}
    `,
    format: "JSONEachRow",
    query_params: { spanIds: spanItems.map((span) => span.spanId), projectId },
  });

  const spanEvents = (await chResult.json()) as { id: string; timestamp: string; spanId: string; name: string }[];

  const spanEventsMap = groupBy(spanEvents, (event) => event.spanId);

  // For now, we flatten the span tree in the front-end if there is a search query,
  // so we explicitly set the parentSpanId to null
  return spanItems.map((span) => ({
    ...span,
    events: (spanEventsMap[span.spanId] || []).map((event) => ({
      ...event,
      timestamp: new Date(`${event.timestamp}Z`),
    })),
    parentSpanId: searchSpanIds.length > 0 || urlParamFilters.length > 0 ? null : span.parentSpanId,
  }));
}

export async function deleteSpans(input: z.infer<typeof DeleteSpansSchema>) {
  const { projectId, spanIds } = input;

  await db.delete(spans).where(and(inArray(spans.spanId, spanIds), eq(spans.projectId, projectId)));
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
