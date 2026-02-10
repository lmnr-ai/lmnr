import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { type EventRow } from "@/lib/events/types";

import { buildEventsCountQueryWithParams, buildEventsQueryWithParams } from "./utils";

export const GetEventsPaginatedSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  eventName: z.string(),
});

export async function getEventsPaginated(input: z.infer<typeof GetEventsPaginatedSchema>) {
  const { projectId, eventName, pageSize, pageNumber, pastHours, startDate, endDate, filter } = input;

  const filters = compact(filter);
  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const { query: mainQuery, parameters: mainParams } = buildEventsQueryWithParams({
    eventName,
    filters,
    limit,
    offset,
    startTime: startDate,
    endTime: endDate,
    pastHours,
  });

  const { query: countQuery, parameters: countParams } = buildEventsCountQueryWithParams({
    eventName,
    filters,
    startTime: startDate,
    endTime: endDate,
    pastHours,
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
