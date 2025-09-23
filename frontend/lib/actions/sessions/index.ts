import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { buildSessionsCountQueryWithParams, buildSessionsQueryWithParams } from "@/lib/actions/sessions/utils";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { searchTypeToQueryFilter } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { addTimeRangeToQuery, getTimeRange, TimeRange } from "@/lib/clickhouse/utils";
import { FilterDef } from "@/lib/db/modifiers";
import { SessionRow } from "@/lib/traces/types";

export const GetSessionsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export const DeleteSessionsSchema = z.object({
  projectId: z.string(),
  sessionIds: z.array(z.string()).min(1),
});

export async function getSessions(
  input: z.infer<typeof GetSessionsSchema>
): Promise<{ items: SessionRow[]; count: number }> {
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

  const traceIds = search
    ? await searchTraceIds({
      projectId,
      searchQuery: search,
      timeRange: getTimeRange(pastHours, startTime, endTime),
      searchType: searchIn as SpanSearchType[],
    })
    : [];

  if (search && traceIds?.length === 0) {
    return { items: [], count: 0 };
  }

  const { query: mainQuery, parameters: mainParams } = buildSessionsQueryWithParams({
    traceIds,
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
  });

  const { query: countQuery, parameters: countParams } = buildSessionsCountQueryWithParams({
    traceIds,
    filters,
    startTime,
    endTime,
    pastHours,
  });

  const [items, [count]] = await Promise.all([
    executeQuery<Omit<SessionRow, "subRows">>({ query: mainQuery, parameters: mainParams, projectId }),
    executeQuery<{ count: number }>({ query: countQuery, parameters: countParams, projectId }),
  ]);

  return {
    items: items.map((item) => ({ ...item, subRows: [] })),
    count: count?.count || 0,
  };
}

const searchTraceIds = async ({
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
      SELECT DISTINCT(trace_id) traceId
      FROM spans
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

  const result = (await response.json()) as { traceId: string }[];

  return result.map((i) => i.traceId);
};

export async function deleteSessions(input: z.infer<typeof DeleteSessionsSchema>) {
  const { projectId, sessionIds } = DeleteSessionsSchema.parse(input);

  await clickhouseClient.command({
    query: `
        DELETE FROM spans
        WHERE project_id = {projectId: UUID} 
            AND session_id in ({sessionIds: Array(String)})
      `,
    query_params: {
      sessionIds,
      projectId,
    },
  });
}
