import { executeQuery } from "@/lib/actions/sql";
import { type EventRow } from "@/lib/events/types";

export type EventWithName = EventRow & { name: string };

const QUERY = `
SELECT
  id,
  signal_id as signalId,
  trace_id as traceId,
  name,
  formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp,
  payload
FROM signal_events
WHERE id = {eventId:UUID}
LIMIT 1
`;

export async function getEventById(projectId: string, eventId: string): Promise<EventWithName | null> {
  const rows = await executeQuery<EventWithName>({
    query: QUERY,
    parameters: { eventId },
    projectId,
  });

  return rows[0] ?? null;
}
