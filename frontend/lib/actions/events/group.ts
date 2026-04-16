import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { buildWhereClause, type QueryParams, type QueryResult } from "@/lib/actions/common/query-builder";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { type EventRow } from "@/lib/events/types";

import { eventsColumnFilterConfig } from "./utils";

export const GetEventsByGroupPaginatedSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
  groupId: z.guid(),
});

interface BuildGroupEventsQueryOptions {
  projectId: string;
  signalId: string;
  groupId: string;
  filters: Filter[];
  limit: number;
  offset: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
}

const GROUP_EVENTS_BASE = `
  FROM signal_events AS se
  INNER JOIN events_to_clusters AS etc FINAL
    ON se.project_id = etc.project_id
    AND se.id = etc.event_id
`;

const buildGroupEventsWhere = (options: BuildGroupEventsQueryOptions): QueryResult => {
  const { projectId, signalId, groupId, filters, startTime, endTime, pastHours } = options;

  const customConditions: Array<{ condition: string; params: QueryParams }> = [
    {
      condition: "se.project_id = {projectId:UUID}",
      params: { projectId },
    },
    {
      condition: "etc.project_id = {projectId:UUID}",
      params: { projectId },
    },
    {
      condition: "se.signal_id = {signalId:UUID}",
      params: { signalId },
    },
    {
      condition: "etc.cluster_id = {groupId:UUID}",
      params: { groupId },
    },
  ];

  return buildWhereClause({
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "se.timestamp",
    },
    filters,
    columnFilterConfig: eventsColumnFilterConfig,
    customConditions,
  });
};

const buildGroupEventsSelect = (options: BuildGroupEventsQueryOptions): QueryResult => {
  const { limit, offset } = options;
  const { query: whereClause, parameters } = buildGroupEventsWhere(options);

  const query = `
    SELECT
      se.id as id,
      se.signal_id as signalId,
      se.trace_id as traceId,
      formatDateTime(se.timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp,
      se.payload as payload,
      se.severity as severity
    ${GROUP_EVENTS_BASE}
    ${whereClause}
    ORDER BY se.timestamp DESC
    LIMIT {limit:UInt32} OFFSET {offset:UInt32}
  `;

  return {
    query,
    parameters: { ...parameters, limit, offset },
  };
};

const buildGroupEventsCount = (options: BuildGroupEventsQueryOptions): QueryResult => {
  const { query: whereClause, parameters } = buildGroupEventsWhere(options);

  const query = `
    SELECT count() as count
    ${GROUP_EVENTS_BASE}
    ${whereClause}
  `;

  return { query, parameters };
};

export async function getEventsByGroupPaginated(
  input: z.infer<typeof GetEventsByGroupPaginatedSchema>
): Promise<{ items: EventRow[]; count: number }> {
  const { projectId, signalId, groupId, pageSize, pageNumber, pastHours, startDate, endDate, filter } = input;

  const filters = compact(filter);
  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const queryOptions: BuildGroupEventsQueryOptions = {
    projectId,
    signalId,
    groupId,
    filters,
    limit,
    offset,
    startTime: startDate,
    endTime: endDate,
    pastHours,
  };

  const mainQuery = buildGroupEventsSelect(queryOptions);
  const countQuery = buildGroupEventsCount(queryOptions);

  const [mainResult, countResult] = await Promise.all([
    clickhouseClient.query({
      query: mainQuery.query,
      format: "JSONEachRow",
      query_params: mainQuery.parameters,
    }),
    clickhouseClient.query({
      query: countQuery.query,
      format: "JSONEachRow",
      query_params: countQuery.parameters,
    }),
  ]);

  const items = (await mainResult.json()) as EventRow[];
  const [countRow] = (await countResult.json()) as Array<{ count: string | number }>;

  return {
    items,
    count: Number(countRow?.count ?? 0),
  };
}

export const GetGroupNameSchema = z.object({
  projectId: z.guid(),
  signalId: z.guid(),
  groupId: z.guid(),
});

export async function getGroupName(input: z.infer<typeof GetGroupNameSchema>): Promise<{ name: string } | null> {
  const { projectId, signalId, groupId } = GetGroupNameSchema.parse(input);

  const query = `
    SELECT name
    FROM signal_event_clusters FINAL
    WHERE project_id = {projectId:UUID}
      AND signal_id = {signalId:UUID}
      AND id = {groupId:UUID}
    LIMIT 1
  `;

  const result = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
    query_params: { projectId, signalId, groupId },
  });

  const rows = (await result.json()) as Array<{ name: string }>;
  if (rows.length === 0) return null;

  return { name: rows[0].name };
}
