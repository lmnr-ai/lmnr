import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/drizzle";
import { events, spans } from "@/lib/db/migrations/schema";

export async function GET(
  _req: Request,
  props: { params: Promise<{ traceId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const traceId = params.traceId;
  const spanId = params.spanId;

  const span = await db.query.spans.findFirst({
    where: and(eq(spans.spanId, spanId), eq(spans.traceId, traceId)),
    columns: {
      spanId: true,
    },
  });

  if (!span) {
    return new Response(JSON.stringify({ error: "Span not found or does not belong to the given trace" }), {
      status: 404,
    });
  }

  const rows = await db.query.events.findMany({
    where: and(eq(events.spanId, spanId)),
    orderBy: asc(events.timestamp),
  });

  return NextResponse.json(rows);
}
