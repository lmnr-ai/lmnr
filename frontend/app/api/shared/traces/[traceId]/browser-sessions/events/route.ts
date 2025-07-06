import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedBrowserSessionEvents } from "@/lib/actions/shared/browser-session-events";

export async function GET(_request: NextRequest, props: { params: Promise<{ traceId: string }> }) {
  const params = await props.params;
  const traceId = params.traceId;

  try {
    const res = await getSharedBrowserSessionEvents({ traceId });

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
  } catch (e) {
    if (e instanceof ZodError) {
      return new Response(JSON.stringify({ error: prettifyError(e) }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Failed to fetch browser session events." }), {
      status: 500,
    });
  }
}
