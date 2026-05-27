import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { type EventRow } from "@/lib/events/types";

import { getEventsByEmergingClusterPaginated } from "./emerging-cluster";
import { searchSignalEvents, type SignalEventSearchHit } from "./search";
import { buildEventsCountQueryWithParams, buildEventsQueryWithParams } from "./utils";

export const GetEventsPaginatedSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
  clusterId: z.array(z.string()).optional(),
  unclustered: z.coerce.boolean().optional(),
  emergingClusterId: z.guid().optional(),
  search: z.string().optional(),
  // Schema field names rendered as table columns — passed through to the
  // search endpoint to scope the per-field snippet extracts. The client owns
  // this list (it's derived from `signal.structuredOutput`); piping it via URL
  // params avoids an extra Postgres signal lookup on every paged events fetch.
  payloadField: z.array(z.string()).optional(),
});

/** Merges per-event field snippets onto already-hydrated EventRows by id. */
export function attachSnippets(items: EventRow[], hits: SignalEventSearchHit[]): EventRow[] {
  const lookup = new Map(hits.map((h) => [h.id, h]));
  return items.map((item) => {
    const hit = lookup.get(item.id);
    if (!hit) return item;
    return { ...item, fieldSnippets: hit.fieldSnippets };
  });
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
    emergingClusterId,
    search,
    payloadField,
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
      search,
      payloadField,
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
  let searchHits: SignalEventSearchHit[] = [];
  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    searchHits = await searchSignalEvents({
      projectId,
      signalId,
      searchQuery: trimmedSearch,
      payloadFields: payloadField ?? [],
      pastHours,
      startDate,
      endDate,
    });
    if (searchHits.length === 0) {
      // No Quickwit hits — short-circuit to avoid emitting `id IN ()` (CH syntax error)
      // and to skip the redundant CH round-trip.
      return { items: [], count: 0 };
    }
    idFilter = searchHits.map((h) => h.id);
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

  const [rawItems, [countResult]] = await Promise.all([
    executeQuery<EventRow>({ query: mainQuery, parameters: mainParams, projectId }),
    executeQuery<{ count: number }>({ query: countQuery, parameters: countParams, projectId }),
  ]);

  return {
    items: searchHits.length > 0 ? attachSnippets(rawItems, searchHits) : rawItems,
    count: countResult?.count || 0,
  };
}
