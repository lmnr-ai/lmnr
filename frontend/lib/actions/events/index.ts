import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import { Event } from "@/lib/events/types";

const GetEventsSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  traceId: z.string().optional(),
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
      SELECT id, formatDateTime(timestamp , '%Y-%m-%dT%H:%i:%S.%fZ'), name, attributes, span_id spanId
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
