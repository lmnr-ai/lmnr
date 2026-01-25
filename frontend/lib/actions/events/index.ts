import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import { type Event, type EventRow } from "@/lib/events/types";

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

export const getLastEvent = async (input: z.infer<typeof GetLastEventSchema>) => {
  const { projectId, name } = GetLastEventSchema.parse(input);

  const query = `
      SELECT
          id,
          formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp, 
      name
      FROM events
      WHERE name = {name: String} AND source = 'SEMANTIC'
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
