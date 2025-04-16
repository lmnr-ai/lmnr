import { NextRequest } from "next/server";

import { clickhouseClient } from "@/lib/clickhouse/client";

export async function GET(request: NextRequest) {
  const traceId = request.nextUrl.searchParams.get("traceId");

  if (!traceId) {
    return new Response(JSON.stringify({ error: "traceId is required" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  const res = await clickhouseClient.query({
    query: `
      SELECT 
        trace_id,
        timestamp,
        event_type,
        base64Encode(data) as data
      FROM browser_session_events
      WHERE trace_id = {traceId: UUID}
      ORDER BY timestamp ASC`,
    format: "JSONEachRow",
    query_params: {
      traceId: traceId,
    },
  });

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue("["); // Start JSON array

      let isFirst = true;
      const resultStream = res.stream();

      try {
        for await (const row of resultStream) {
          if (!isFirst) {
            controller.enqueue(",");
          }
          controller.enqueue(JSON.stringify(row));
          isFirst = false;
        }

        controller.enqueue("]"); // End JSON array
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
