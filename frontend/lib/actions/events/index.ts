import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { getSpanTypes } from "@/lib/actions/span";
import { executeQuery } from "@/lib/actions/sql";
import { type EventRow } from "@/lib/events/types";
import { parseSpanLinks } from "@/lib/traces/span-link-parsing";

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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function attachSpanTypes(projectId: string, items: EventRow[]): Promise<EventRow[]> {
  const idsByRow = new Map<string, string[]>();
  const allSpanIds = new Set<string>();

  for (const item of items) {
    // The span-link regex matches `[0-9a-f-]+`, which can capture non-UUID
    // fragments — keep only well-formed ids so the `Array(UUID)` query (and its
    // schema) don't reject the whole batch.
    const ids = parseSpanLinks(item.payload)
      .map((link) => link.spanId)
      .filter((id): id is string => Boolean(id) && UUID_REGEX.test(id!));
    if (ids.length > 0) {
      idsByRow.set(item.id, ids);
      ids.forEach((id) => allSpanIds.add(id));
    }
  }

  if (allSpanIds.size === 0) {
    return items;
  }

  const typeMap = await getSpanTypes({ projectId, spanIds: [...allSpanIds] });

  return items.map((item) => {
    const ids = idsByRow.get(item.id);
    if (!ids) return item;

    const spanTypes: Record<string, string> = {};
    for (const id of ids) {
      if (typeMap[id]) spanTypes[id] = typeMap[id];
    }
    return Object.keys(spanTypes).length > 0 ? { ...item, spanTypes } : item;
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
    const result = await getEventsByEmergingClusterPaginated({
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
    return { ...result, items: await attachSpanTypes(projectId, result.items) };
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

  const items = searchHits.length > 0 ? attachSnippets(rawItems, searchHits) : rawItems;

  return {
    items: await attachSpanTypes(projectId, items),
    count: countResult?.count || 0,
  };
}
