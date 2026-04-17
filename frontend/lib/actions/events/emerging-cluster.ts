import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { type EventRow } from "@/lib/events/types";

import { buildEventsCountQueryWithParams, buildEventsQueryWithParams } from "./utils";

export const GetEventsByEmergingClusterPaginatedSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
  emergingClusterId: z.guid(),
});

export async function getEventsByEmergingClusterPaginated(
  input: z.infer<typeof GetEventsByEmergingClusterPaginatedSchema>
): Promise<{ items: EventRow[]; count: number }> {
  const { projectId, signalId, emergingClusterId, pageSize, pageNumber, pastHours, startDate, endDate, filter } = input;

  const filters = compact(filter);
  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  // signal_events_all_v0 includes L0 cluster ids in the `clusters` array,
  // so the normal cluster filter path (hasAny) works for emerging clusters.
  const { query: mainQuery, parameters: mainParams } = buildEventsQueryWithParams({
    signalId,
    filters,
    limit,
    offset,
    startTime: startDate,
    endTime: endDate,
    pastHours,
    clusterFilter: [emergingClusterId],
    table: "signal_events_all",
  });

  const { query: countQuery, parameters: countParams } = buildEventsCountQueryWithParams({
    signalId,
    filters,
    startTime: startDate,
    endTime: endDate,
    pastHours,
    clusterFilter: [emergingClusterId],
    table: "signal_events_all",
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

export const GetEmergingClusterNameSchema = z.object({
  projectId: z.guid(),
  signalId: z.guid(),
  emergingClusterId: z.guid(),
});

export async function getEmergingClusterName(
  input: z.infer<typeof GetEmergingClusterNameSchema>
): Promise<{ name: string } | null> {
  const { projectId, signalId, emergingClusterId } = GetEmergingClusterNameSchema.parse(input);

  const query = `
    SELECT cluster_name AS name
    FROM event_clusters_all
    WHERE cluster_id = {emergingClusterId:UUID}
      AND signal_id = {signalId:UUID}
    LIMIT 1
  `;

  const rows = await executeQuery<{ name: string }>({
    query,
    parameters: { signalId, emergingClusterId },
    projectId,
  });

  if (rows.length === 0) return null;

  return { name: rows[0].name };
}
