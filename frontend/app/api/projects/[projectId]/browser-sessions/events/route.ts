import { NextRequest } from "next/server";
import { clickhouseClient } from "@/lib/clickhouse/client";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const { projectId } = params;
  const traceId = request.nextUrl.searchParams.get('traceId');

  const res = await clickhouseClient.query({
    query: `
      SELECT *
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
      const stream = res.stream();
      let totalSize = 0;

      try {
        for await (const row of stream) {
          if (!isFirst) {
            controller.enqueue(',');
          }
          controller.enqueue(JSON.stringify(row));
          totalSize += JSON.stringify(row).length;
          console.log(JSON.stringify(row).length / (1024 * 1024) + 'MB');
          isFirst = false;
        }

        controller.enqueue(']'); // End JSON array
        controller.close();
      } catch (error) {
        controller.error(error);
      }
      console.log("totalSize", totalSize / (1024 * 1024) + 'MB');

    }

  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
