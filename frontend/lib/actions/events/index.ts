import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { type EventRow } from "@/lib/events/types";

import { getEventsByGroupPaginated } from "./group";
import { buildEventsCountQueryWithParams, buildEventsQueryWithParams } from "./utils";

export const GetEventsPaginatedSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
  clusterId: z.array(z.string()).optional(),
  unclustered: z.coerce.boolean().optional(),
  groupId: z.guid().optional(),
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
    groupId,
  } = input;

  if (groupId) {
    return getEventsByGroupPaginated({
      projectId,
      signalId,
      groupId,
      pageSize,
      pageNumber,
      pastHours,
      startDate,
      endDate,
      filter,
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

  const { query: mainQuery, parameters: mainParams } = buildEventsQueryWithParams({
    signalId,
    filters,
    limit,
    offset,
    startTime: startDate,
    endTime: endDate,
    pastHours,
    clusterFilter,
  });

  const { query: countQuery, parameters: countParams } = buildEventsCountQueryWithParams({
    signalId,
    filters,
    startTime: startDate,
    endTime: endDate,
    pastHours,
    clusterFilter,
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
