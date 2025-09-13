import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { Event } from "@/lib/events/types";

const GetEventsSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
});

export async function getEvents(input: z.infer<typeof GetEventsSchema>): Promise<Event[]> {
  const { spanId, projectId } = GetEventsSchema.parse(input);

  const chResult = await clickhouseClient.query({
    query: `
        SELECT id, timestamp, name, attributes, span_id spanId, project_id projectId
        FROM events
        WHERE span_id = {spanId: UUID} AND project_id = {projectId: UUID}
        ORDER BY timestamp ASC
      `,
    format: "JSONEachRow",
    query_params: { spanId, projectId },
  });

  const chEvents = (await chResult.json()) as Array<{
    id: string;
    timestamp: string;
    name: string;
    attributes: string;
    spanId: string;
    projectId: string;
  }>;

  return chEvents.map((event) => ({
    ...event,
    timestamp: new Date(`${event.timestamp}Z`).toISOString(),
    attributes: tryParseJson(event.attributes),
  }));
}
