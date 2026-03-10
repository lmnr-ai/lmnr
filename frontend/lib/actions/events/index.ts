import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { type EventRow } from "@/lib/events/types";

import { buildEventsCountQueryWithParams, buildEventsQueryWithParams } from "./utils";

export const GetEventsPaginatedSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  signalId: z.string(),
  clusterId: z.array(z.string()).optional(),
  unclustered: z.coerce.boolean().optional(),
});

async function getEventIdsForClusters(projectId: string, clusterIds: string[]): Promise<string[]> {
  // Direct ClickHouse required: events_to_clusters is not in the query engine
  const result = await clickhouseClient.query({
    query: `SELECT DISTINCT event_id FROM events_to_clusters WHERE project_id = {projectId: UUID} AND cluster_id IN ({clusterIds: Array(UUID)})`,
    query_params: { projectId, clusterIds },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as Array<{ event_id: string }>;
  return rows.map((r) => r.event_id);
}

async function getUnclusteredEventIds(projectId: string, signalId: string): Promise<string[]> {
  // Direct ClickHouse required: events_to_clusters is not in the query engine
  const result = await clickhouseClient.query({
    query: `
      SELECT se.id as event_id
      FROM signal_events se
      LEFT JOIN events_to_clusters ec ON se.id = ec.event_id AND se.project_id = ec.project_id
      WHERE se.project_id = {projectId: UUID}
        AND se.signal_id = {signalId: UUID}
        AND ec.event_id IS NULL
    `,
    query_params: { projectId, signalId },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as Array<{ event_id: string }>;
  return rows.map((r) => r.event_id);
}

export async function getEventsPaginated(input: z.infer<typeof GetEventsPaginatedSchema>) {
  const {
    projectId,
    signalId,
    pageSize,
    pageNumber,
    pastHours,
    startDate,
    endDate,
    filter,
    clusterId: clusterIds,
    unclustered,
  } = input;

  const filters = compact(filter);
  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  // When cluster filtering, first resolve event IDs via clickhouse directly
  // (the query engine doesn't allow the events_to_clusters table)
  let eventIdsFilter: string[] | undefined;
  if (unclustered) {
    eventIdsFilter = await getUnclusteredEventIds(projectId, signalId);
    if (eventIdsFilter.length === 0) {
      return { items: [], count: 0 };
    }
  } else if (clusterIds && clusterIds.length > 0) {
    eventIdsFilter = await getEventIdsForClusters(projectId, clusterIds);
    if (eventIdsFilter.length === 0) {
      return { items: [], count: 0 };
    }
  }

  const { query: mainQuery, parameters: mainParams } = buildEventsQueryWithParams({
    signalId,
    filters,
    limit,
    offset,
    startTime: startDate,
    endTime: endDate,
    pastHours,
    eventIds: eventIdsFilter,
  });

  const { query: countQuery, parameters: countParams } = buildEventsCountQueryWithParams({
    signalId,
    filters,
    startTime: startDate,
    endTime: endDate,
    pastHours,
    eventIds: eventIdsFilter,
  });

  const [items, [countResult]] = await Promise.all([
    executeQuery<EventRow>({ query: mainQuery, parameters: mainParams, projectId }),
    executeQuery<{ count: number }>({ query: countQuery, parameters: countParams, projectId }),
  ]);

  return {
    items,
    count: countResult?.count || 0,
  };
}
