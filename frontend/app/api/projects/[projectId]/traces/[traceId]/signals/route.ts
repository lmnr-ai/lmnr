import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { signals } from "@/lib/db/migrations/schema";
import { type EventRow } from "@/lib/events/types";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  try {
    // Step 1: Get distinct signal IDs from signal_events for this trace
    const signalIdRows = await executeQuery<{ signal_id: string }>({
      projectId,
      query: `
        SELECT DISTINCT signal_id
        FROM signal_events
        WHERE trace_id = {traceId: UUID}
      `,
      parameters: { traceId },
    });

    if (signalIdRows.length === 0) {
      return NextResponse.json([]);
    }

    const signalIds = signalIdRows.map((r) => r.signal_id);

    // Step 2: Get signal metadata from PostgreSQL
    const signalRows = await db
      .select({
        id: signals.id,
        name: signals.name,
        prompt: signals.prompt,
        structuredOutputSchema: signals.structuredOutputSchema,
      })
      .from(signals)
      .where(and(eq(signals.projectId, projectId), inArray(signals.id, signalIds)));

    // Step 3: Get events for each signal in this trace
    const eventRows = await executeQuery<EventRow>({
      projectId,
      query: `
        SELECT
          id,
          signal_id as signalId,
          trace_id as traceId,
          payload,
          formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp
        FROM signal_events
        WHERE signal_id IN ({signalIds: Array(UUID)})
          AND trace_id = {traceId: UUID}
        ORDER BY timestamp DESC
      `,
      parameters: { signalIds, traceId },
    });

    // Step 4: Group events by signal and build response
    const eventsBySignal = new Map<string, EventRow[]>();
    for (const event of eventRows) {
      const existing = eventsBySignal.get(event.signalId) ?? [];
      existing.push(event);
      eventsBySignal.set(event.signalId, existing);
    }

    const result = signalRows.map((signal) => ({
      signalId: signal.id,
      signalName: signal.name,
      prompt: signal.prompt,
      structuredOutput: signal.structuredOutputSchema,
      events: eventsBySignal.get(signal.id) ?? [],
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching trace signals:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch trace signals" },
      { status: 500 }
    );
  }
}
