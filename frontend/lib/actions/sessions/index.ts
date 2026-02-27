import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { buildSessionsQueryWithParams } from "@/lib/actions/sessions/utils";
import { searchTypeToQueryFilter } from "@/lib/actions/spans/utils";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange, type TimeRange } from "@/lib/clickhouse/utils";
import { toClickHouseParam } from "@/lib/time/timestamp";
import { type SessionRow } from "@/lib/traces/types";

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

export async function getSessions(input: z.infer<typeof GetSessionsSchema>): Promise<{ items: SessionRow[] }> {
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
    return { items: [] };
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

  const items = await executeQuery<Omit<SessionRow, "subRows">>({
    query: mainQuery,
    parameters: mainParams,
    projectId,
  });

  return {
    items: items.map((item) => ({ ...item, subRows: [] })),
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
  timeRange?: TimeRange;
  searchType?: SpanSearchType[];
}): Promise<string[]> => {
  let query = `
      SELECT DISTINCT(trace_id) traceId
      FROM spans
      WHERE project_id = {projectId: UUID}
  `;

  const queryParams: Record<string, any> = {
    projectId,
    query: `%${searchQuery.toLowerCase()}%`,
  };

  if (timeRange) {
    if ("start" in timeRange && "end" in timeRange) {
      query += ` AND start_time >= {startTime:String} AND start_time <= {endTime:String}`;
      queryParams.startTime = toClickHouseParam(timeRange.start.toISOString());
      queryParams.endTime = toClickHouseParam(timeRange.end.toISOString());
    } else if ("pastHours" in timeRange) {
      query += ` AND start_time >= now() - INTERVAL {pastHours:UInt32} HOUR`;
      queryParams.pastHours = timeRange.pastHours;
    }
  }

  query += ` AND (${searchTypeToQueryFilter(searchType, "query")})`;

  const response = await clickhouseClient.query({
    query: `${query}
     ORDER BY start_time DESC
     LIMIT 1000`,
    format: "JSONEachRow",
    query_params: queryParams,
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
