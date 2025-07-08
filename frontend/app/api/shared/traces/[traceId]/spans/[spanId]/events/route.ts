import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedSpanEvents } from "@/lib/actions/shared/span";

export async function GET(
  _req: Request,
  props: { params: Promise<{ traceId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const traceId = params.traceId;
  const spanId = params.spanId;

  try {
    const events = await getSharedSpanEvents({ traceId, spanId });
    return NextResponse.json(events);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get shared span events." }, { status: 500 });
  }
}
