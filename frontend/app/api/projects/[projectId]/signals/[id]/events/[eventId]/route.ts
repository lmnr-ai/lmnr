import { type NextRequest } from "next/server";

import { executeQuery } from "@/lib/actions/sql";
import { type EventRow } from "@/lib/events/types";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string; eventId: string }> }
): Promise<Response> {
  const { projectId, id: signalId, eventId } = await props.params;

  try {
    const query = `
      SELECT id, signal_id as signalId, trace_id as traceId, payload, timestamp
      FROM signal_events
      WHERE signal_id = '${signalId}'
        AND id = '${eventId}'
      LIMIT 1
    `;

    const results = await executeQuery<EventRow>({ query, projectId });

    if (results.length === 0) {
      return Response.json({ error: "Event not found" }, { status: 404 });
    }

    return Response.json(results[0]);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to fetch event." }, { status: 500 });
  }
}
