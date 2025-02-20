import { NextRequest } from "next/server";

import { clickhouseClient } from "@/lib/clickhouse/client";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const { projectId } = params;
  const traceId = request.nextUrl.searchParams.get('traceId');

  const res = await clickhouseClient.query({
    query: `
      SELECT 
        trace_id,
        timestamp,
        event_type,
        base64Encode(data) as data
      FROM browser_session_events
      WHERE trace_id = {id: UUID}
        AND project_id = {projectId: UUID}
      ORDER BY timestamp ASC`,
    format: 'JSONEachRow',
    query_params: {
      id: traceId,
      projectId: projectId,
    }
  });

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue('['); // Start JSON array

      let isFirst = true;
      const resultStream = res.stream();

      try {
        for await (const row of resultStream) {
          if (!isFirst) {
            controller.enqueue(',');
          }
          controller.enqueue(JSON.stringify(row));
          isFirst = false;
        }

        controller.enqueue(']'); // End JSON array
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }

  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
