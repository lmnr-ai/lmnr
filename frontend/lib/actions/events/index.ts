import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import { Event, EventRow } from "@/lib/events/types";
import { db } from "@/lib/db/drizzle";
import { eventClusters } from "@/lib/db/migrations/schema";
import { and, eq } from "drizzle-orm";
import { Filter } from "@/lib/actions/common/filters";

import { buildEventsCountQueryWithParams, buildEventsQueryWithParams } from "./utils";

const GetEventsSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  traceId: z.string().optional(),
});

const GetLastEventSchema = z.object({
  projectId: z.string(),
  name: z.string(),
});

export async function getEvents(input: z.infer<typeof GetEventsSchema>): Promise<Event[]> {
  const { spanId, traceId, projectId } = GetEventsSchema.parse(input);

  const whereConditions = [`span_id = {spanId: UUID}`];
  const parameters: Record<string, any> = { spanId };

  if (traceId) {
    whereConditions.push(`trace_id = {traceId: UUID}`);
    parameters.traceId = traceId;
  }

  const events = await executeQuery<{
    id: string;
    timestamp: string;
    name: string;
    attributes: string;
    spanId: string;
  }>({
    query: `
      SELECT id, formatDateTime(timestamp , '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp, name, attributes, span_id spanId
      FROM events
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY timestamp ASC
    `,
    parameters,
    projectId,
  });

  return events.map((event) => ({
    ...event,
    projectId,
    attributes: tryParseJson(event.attributes),
  }));
}

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

  // Resolve cluster names to cluster IDs (lazy - only if cluster filters exist)
  let processedFilters = filters;

  const hasClusterFilter = filters.some((f) => f.column === "cluster");
  if (hasClusterFilter) {
    const clustersList = await db
      .select()
      .from(eventClusters)
      .where(and(eq(eventClusters.projectId, projectId), eq(eventClusters.eventName, eventName)));

    // Replace cluster names with cluster IDs, remove filters for non-existent clusters
    processedFilters = filters
      .map((filter) => {
        if (filter.column === "cluster") {
          const cluster = clustersList.find((c) => c.name === filter.value);
          if (cluster) {
            return { ...filter, value: cluster.id };
          } else {
            // Cluster doesn't exist - log warning and filter it out
            console.warn(`Cluster "${filter.value}" not found in event clusters`);
            return null;
          }
        }
        return filter;
      })
      .filter((f): f is Filter => f !== null);

  }

  const { query: mainQuery, parameters: mainParams } = buildEventsQueryWithParams({
    eventName,
    filters: processedFilters,
    limit,
    offset,
    startTime: startDate,
    endTime: endDate,
    pastHours,
  });

  const { query: countQuery, parameters: countParams } = buildEventsCountQueryWithParams({
    eventName,
    filters: processedFilters,
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

export const getLastEvent = async (input: z.infer<typeof GetLastEventSchema>) => {
  const { projectId, name } = GetLastEventSchema.parse(input);

  const query = `
      SELECT
          id,
          formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp, 
      name
      FROM events
      WHERE name = {name: String}
      ORDER BY timestamp DESC
      LIMIT 1
  `;

  const [result] = await executeQuery<{ name: string; id: string; timestamp: string }>({
    projectId,
    query,
    parameters: {
      name,
      projectId,
    },
  });

  return result;
};
