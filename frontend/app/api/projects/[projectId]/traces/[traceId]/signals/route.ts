import { type NextRequest, NextResponse } from "next/server";

import { executeQuery } from "@/lib/actions/sql";

/**
 * GET /api/projects/{projectId}/traces/{traceId}/signals
 *
 * Returns signals and their events associated with a trace.
 * Queries signal_events by trace_id, then fetches signal metadata from postgres.
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string; traceId: string }> }) {
  const { projectId, traceId } = await props.params;

  try {
    // Query signal_events for this trace to get distinct signals and their events
    const events = await executeQuery<{
      id: string;
      signal_id: string;
      signal_name: string;
      trace_id: string;
      payload: string;
      timestamp: string;
    }>({
      projectId,
      query: `
        SELECT
          id,
          signal_id,
          name as signal_name,
          trace_id,
          payload,
          formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp
        FROM signal_events
        WHERE trace_id = {traceId:UUID}
        ORDER BY timestamp DESC
      `,
      parameters: { traceId },
    });

    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch trace signals." },
      { status: 500 }
    );
  }
}
