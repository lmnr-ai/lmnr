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
    // Step 1: Get all signal events for this trace in one query
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
        WHERE trace_id = {traceId: UUID}
        ORDER BY timestamp DESC
      `,
      parameters: { traceId },
    });

    if (eventRows.length === 0) {
      return NextResponse.json([]);
    }

    // Extract unique signal IDs and group events
    const eventsBySignal = new Map<string, EventRow[]>();
    for (const event of eventRows) {
      const existing = eventsBySignal.get(event.signalId) ?? [];
      existing.push(event);
      eventsBySignal.set(event.signalId, existing);
    }

    const signalIds = [...eventsBySignal.keys()];

    // Step 2: Get signal metadata from PostgreSQL
    const signalRows = await db
      .select({
        id: signals.id,
        name: signals.name,
        prompt: signals.prompt,
        structuredOutputSchema: signals.structuredOutputSchema,
        color: signals.color,
      })
      .from(signals)
      .where(and(eq(signals.projectId, projectId), inArray(signals.id, signalIds)));

    const result = signalRows.map((signal) => ({
      signalId: signal.id,
      signalName: signal.name,
      prompt: signal.prompt,
      structuredOutput: signal.structuredOutputSchema,
      color: signal.color,
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
