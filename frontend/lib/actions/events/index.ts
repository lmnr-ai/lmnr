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
});

async function getEventIdsForClusters(projectId: string, clusterIds: string[]): Promise<string[]> {
  const result = await clickhouseClient.query({
    query: `SELECT DISTINCT event_id FROM events_to_clusters WHERE project_id = {projectId: UUID} AND cluster_id IN ({clusterIds: Array(UUID)})`,
    query_params: { projectId, clusterIds },
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
  } = input;

  const filters = compact(filter);
  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  // When cluster filtering, first resolve event IDs via clickhouse directly
  // (the query engine doesn't allow the events_to_clusters table)
  let eventIdsFilter: string[] | undefined;
  if (clusterIds && clusterIds.length > 0) {
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
