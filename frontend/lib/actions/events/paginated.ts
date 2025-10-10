import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { buildSelectQuery, createStringFilter, QueryParams } from "@/lib/actions/common/query-builder";
import { executeQuery } from "@/lib/actions/sql";
import { EventRow } from "@/lib/events/types";

export const GetEventsSchema = TimeRangeSchema.merge(PaginationFiltersSchema).extend({
  projectId: z.string(),
  name: z.string().nullable().optional(),
  search: z.string().nullable().optional(),
});

export async function getEventsPaginated(input: z.infer<typeof GetEventsSchema>) {
  const {
    projectId,
    name,
    pageSize,
    pageNumber,
    pastHours,
    startDate,
    endDate,
    filter,
    search
  } = GetEventsSchema.parse(input);

  const urlParamFilters = compact(filter);

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const customConditions = [];
  const customParams: QueryParams = { projectId };

  if (name) {
    customConditions.push({
      condition: "name = {eventName:String}",
      params: { eventName: name },
    });
  }

  if (search && search.trim() !== "") {
    customConditions.push({
      condition: "(name ILIKE {searchQuery:String} OR user_id ILIKE {searchQuery:String} OR session_id ILIKE {searchQuery:String})",
      params: { searchQuery: `%${search.trim()}%` },
    });
  }

  const columnFilterConfig = {
    processors: new Map([
      ["name", createStringFilter],
      ["user_id", createStringFilter],
      ["session_id", createStringFilter],
    ]),
  };

  const { query: mainQuery, parameters: mainParams } = buildSelectQuery({
    select: {
      columns: [
        "id",
        "project_id projectId",
        "span_id spanId",
        "trace_id traceId",
        "formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp",
        "name",
        "attributes",
        "user_id userId",
        "session_id sessionId",
        "size_bytes sizeBytes",
      ],
      table: "events",
    },
    timeRange: {
      startTime: startDate,
      endTime: endDate,
      pastHours,
      timeColumn: "timestamp",
    },
    filters: urlParamFilters,
    columnFilterConfig,
    customConditions: [
      {
        condition: "project_id = {projectId:UUID}",
        params: customParams,
      },
      ...customConditions,
    ],
    orderBy: {
      column: "timestamp",
      direction: "DESC",
    },
    pagination: {
      limit,
      offset,
    },
  });

  const { query: countQuery, parameters: countParams } = buildSelectQuery({
    select: {
      columns: ["count(*) as count"],
      table: "events",
    },
    timeRange: {
      startTime: startDate,
      endTime: endDate,
      pastHours,
      timeColumn: "timestamp",
    },
    filters: urlParamFilters,
    columnFilterConfig,
    customConditions: [
      {
        condition: "project_id = {projectId:UUID}",
        params: customParams,
      },
      ...customConditions,
    ],
  });

  const [items, [countResult]] = await Promise.all([
    executeQuery<EventRow>({ query: mainQuery, parameters: mainParams, projectId }),
    executeQuery<{ count: number }>({ query: countQuery, parameters: countParams, projectId }),
  ]);

  return {
    items,
    totalCount: countResult?.count || 0,
  };
}

export async function getEventNames(projectId: string) {
  const query = `
    SELECT 
      name,
      count(*) as count,
      max(timestamp) as lastEventTimestamp
    FROM events
    WHERE project_id = {projectId:UUID}
    GROUP BY name
    ORDER BY lastEventTimestamp DESC
  `;

  const results = await executeQuery<{
    name: string;
    count: number;
    lastEventTimestamp: string;
  }>({
    query,
    parameters: { projectId },
    projectId,
  });

  return results;
}

