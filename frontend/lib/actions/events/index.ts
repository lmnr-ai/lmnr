import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { buildEventsCountQueryWithParams, buildEventsQueryWithParams } from "@/lib/actions/events/utils";
import { executeQuery } from "@/lib/actions/sql";
import { FilterDef } from "@/lib/db/modifiers";

export const GetEventsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  search: z.string().nullable().optional(),
});

export type EventsTableRow = {
  id: string;
  createdAt: string;
  timestamp: string;
  name: string;
  attributes: Record<string, any>;
  spanId: string;
  traceId: string;
  projectId: string;
};

export async function getEvents(input: z.infer<typeof GetEventsSchema>, apiKey: string) {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    pageNumber,
    pageSize,
    search,
    filter: inputFilters,
  } = input;

  const urlParamFilters: FilterDef[] = compact(inputFilters);

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const { query: mainQuery, parameters: mainParams } = buildEventsQueryWithParams(
    urlParamFilters,
    search || null,
    startTime || null,
    endTime || null,
    pastHours || null,
    limit,
    offset
  );

  const { query: countQuery, parameters: countParams } = buildEventsCountQueryWithParams(
    urlParamFilters,
    search || null,
    startTime || null,
    endTime || null,
    pastHours || null
  );

  const [items, countResult] = await Promise.all([
    executeQuery<any>({ query: mainQuery, parameters: mainParams, projectId, apiKey }),
    executeQuery<{ totalCount: number }>({ query: countQuery, parameters: countParams, projectId, apiKey }),
  ]);

  const transformedItems: EventsTableRow[] = items.map((item: any) => ({
    id: item.id,
    projectId: projectId,
    spanId: item.spanId,
    traceId: item.traceId,
    timestamp: item.timestamp,
    name: item.name,
    attributes:
      typeof item.attributes === "string"
        ? (() => {
          try {
            return JSON.parse(item.attributes || "{}");
          } catch {
            return {};
          }
        })()
        : item.attributes || {},
    createdAt: item.createdAt,
  }));

  return {
    items: transformedItems,
    totalCount: countResult[0]?.totalCount || 0,
  };
}
