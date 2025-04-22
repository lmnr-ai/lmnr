import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db/drizzle";
import { traces } from "@/lib/db/migrations/schema";

export async function GET(req: NextRequest, props: { params: Promise<{ traceId: string }> }): Promise<Response> {
  const params = await props.params;
  const traceId = params.traceId;

  const trace = await db.query.traces.findFirst({
    where: and(eq(traces.id, traceId)),
  });

  if (!trace) {
    return new Response(JSON.stringify({ error: "Trace not found" }), { status: 404 });
  }

  return NextResponse.json(trace);
}
