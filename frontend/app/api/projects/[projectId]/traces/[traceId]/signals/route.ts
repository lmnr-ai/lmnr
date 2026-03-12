import { type NextRequest } from "next/server";

import { clickhouseClient } from "@/lib/clickhouse/client";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const { projectId, traceId } = await props.params;

  try {
    const result = await clickhouseClient.query({
      query: `
        SELECT
          signal_id,
          name
        FROM signal_events
        WHERE project_id = {projectId: UUID}
          AND trace_id = {traceId: UUID}
        GROUP BY signal_id, name
      `,
      query_params: {
        projectId,
        traceId,
      },
      format: "JSONEachRow",
    });

    const rows = (await result.json()) as { signal_id: string; name: string }[];

    const signals = rows.map((row) => ({
      signalId: row.signal_id,
      signalName: row.name,
    }));

    return Response.json(signals);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch signals for trace." },
      { status: 500 }
    );
  }
}
