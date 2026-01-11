import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import { type Event, type EventRow } from "@/lib/events/types";

import { buildEventsCountQueryWithParams, buildEventsQueryWithParams, resolveClusterFilters } from "./utils";

const GetEventsSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  traceId: z.string().optional(),
});

const GetLastEventSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  eventSource: z.enum(["CODE", "SEMANTIC"]),
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
  eventSource: z.enum(["CODE", "SEMANTIC"]),
});

export async function getEventsPaginated(input: z.infer<typeof GetEventsPaginatedSchema>) {
  const { projectId, eventName, pageSize, pageNumber, pastHours, startDate, endDate, filter, eventSource } = input;

  const filters = compact(filter);
  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const processedFilters = await resolveClusterFilters({ filters, projectId, eventName });

  const { query: mainQuery, parameters: mainParams } = buildEventsQueryWithParams({
    eventName,
    filters: processedFilters,
    limit,
    offset,
    startTime: startDate,
    endTime: endDate,
    pastHours,
    eventSource,
  });

  const { query: countQuery, parameters: countParams } = buildEventsCountQueryWithParams({
    eventName,
    filters: processedFilters,
    startTime: startDate,
    endTime: endDate,
    pastHours,
    eventSource,
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
  const { projectId, name, eventSource } = GetLastEventSchema.parse(input);

  const query = `
      SELECT
          id,
          formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp, 
      name
      FROM events
      WHERE name = {name: String} AND source = {source: String}
      ORDER BY timestamp DESC
      LIMIT 1
  `;

  const [result] = await executeQuery<{ name: string; id: string; timestamp: string }>({
    projectId,
    query,
    parameters: {
      name,
      projectId,
      source: eventSource,
    },
  });

  return result;
};
