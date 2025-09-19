import { and, eq, inArray } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { buildTracesCountQueryWithParams, buildTracesQueryWithParams } from "@/lib/actions/traces/utils";
import { clickhouseClient } from "@/lib/clickhouse/client.ts";
import { searchTypeToQueryFilter } from "@/lib/clickhouse/spans.ts";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { addTimeRangeToQuery, getTimeRange, TimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { spans, traces } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { TraceRow } from "@/lib/traces/types.ts";

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

export async function getTraces(input: z.infer<typeof GetTracesSchema>): Promise<{ items: TraceRow[]; count: number }> {
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

  const filters = urlParamFilters.filter((filter) => filter.column !== "tags");

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const traceIds = search
    ? await searchSpans({
      projectId,
      searchQuery: search,
      timeRange: getTimeRange(pastHours, startTime, endTime),
      searchType: searchIn as SpanSearchType[],
      pageNumber,
      pageSize,
    })
    : [];

  const { query: mainQuery, parameters: mainParams } = buildTracesQueryWithParams({
    projectId,
    traceType,
    traceIds,
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
  });

  const { query: countQuery, parameters: countParams } = buildTracesCountQueryWithParams({
    projectId,
    traceType,
    traceIds,
    filters,
    startTime,
    endTime,
    pastHours,
  });

  const [items, [count]] = await Promise.all([
    executeQuery<TraceRow>({ query: mainQuery, parameters: mainParams, projectId }),
    executeQuery<{ count: number }>({ query: countQuery, parameters: countParams, projectId }),
  ]);

  return {
    items: items,
    count: count?.count || 0,
  };
}

const searchSpans = async ({
  projectId,
  searchQuery,
  timeRange,
  searchType,
  pageNumber,
  pageSize,
}: {
  projectId: string;
  searchQuery: string;
  timeRange: TimeRange;
  searchType?: SpanSearchType[];
  pageNumber: number;
  pageSize: number;
}): Promise<string[]> => {
  const baseQuery = `
      SELECT DISTINCT(trace_id) traceId FROM spans
      WHERE project_id = {projectId: UUID}
  `;

  const queryWithTime = addTimeRangeToQuery(baseQuery, timeRange, "start_time");

  const finalQuery = `${queryWithTime} AND (${searchTypeToQueryFilter(searchType, "query")})`;

  const response = await clickhouseClient.query({
    query: `${finalQuery}
     ORDER BY start_time DESC
     LIMIT {limit:UInt32}
     OFFSET {offset:UInt32}`,
    format: "JSONEachRow",
    query_params: {
      projectId,
      query: `%${searchQuery.toLowerCase()}%`,
      limit: pageSize,
      offset: pageNumber * pageSize,
    },
  });

  const result = (await response.json()) as { traceId: string }[];

  return result.map((i) => i.traceId);
};

export async function deleteTraces(input: z.infer<typeof DeleteTracesSchema>) {
  const { projectId, traceIds } = input;

  await db.transaction(async (tx) => {
    await tx.delete(spans).where(and(inArray(spans.traceId, traceIds), eq(spans.projectId, projectId)));
    await tx.delete(traces).where(and(inArray(traces.id, traceIds), eq(traces.projectId, projectId)));
  });

  await clickhouseClient.command({
    query: `
        DELETE FROM spans
        WHERE project_id = {projectId: UUID} 
            AND trace_id in ({traceIds: Array(UUID)})
      `,
    query_params: {
      traceIds,
      projectId,
    },
  });
}

export { TRACES_TRACE_VIEW_WIDTH };
