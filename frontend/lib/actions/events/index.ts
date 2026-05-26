import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { type EventRow } from "@/lib/events/types";

import { getEventsByEmergingClusterPaginated } from "./emerging-cluster";
import { searchSignalEventIds } from "./search";
import { buildEventsCountQueryWithParams, buildEventsQueryWithParams } from "./utils";

export const GetEventsPaginatedSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
  clusterId: z.array(z.string()).optional(),
  unclustered: z.coerce.boolean().optional(),
  emergingClusterId: z.guid().optional(),
  searchQuery: z.string().optional(),
});

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
    emergingClusterId,
    searchQuery,
  } = input;

  if (emergingClusterId) {
    return getEventsByEmergingClusterPaginated({
      projectId,
      signalId,
      emergingClusterId,
      pageSize,
      pageNumber,
      pastHours,
      startDate,
      endDate,
      filter,
      searchQuery,
    });
  }

  const filters = compact(filter);
  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  // Use the `clusters` array column on signal_events for filtering
  let clusterFilter: "unclustered" | string[] | undefined;
  if (unclustered) {
    clusterFilter = "unclustered";
  } else if (clusterIds && clusterIds.length > 0) {
    clusterFilter = clusterIds;
  }

  let idFilter: string[] | undefined;
  const trimmedSearchQuery = searchQuery?.trim();
  if (trimmedSearchQuery) {
    const ids = await searchSignalEventIds({
      projectId,
      signalId,
      searchQuery: trimmedSearchQuery,
      pastHours,
      startDate,
      endDate,
    });
    if (ids.length === 0) {
      // No Quickwit hits — short-circuit to avoid emitting `id IN ()` (CH syntax error)
      // and to skip the redundant CH round-trip.
      return { items: [], count: 0 };
    }
    idFilter = ids;
  }

  const { query: mainQuery, parameters: mainParams } = buildEventsQueryWithParams({
    signalId,
    filters,
    limit,
    offset,
    startTime: startDate,
    endTime: endDate,
    pastHours,
    clusterFilter,
    idFilter,
  });

  const { query: countQuery, parameters: countParams } = buildEventsCountQueryWithParams({
    signalId,
    filters,
    startTime: startDate,
    endTime: endDate,
    pastHours,
    clusterFilter,
    idFilter,
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
