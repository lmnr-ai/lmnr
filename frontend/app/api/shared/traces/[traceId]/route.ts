import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedTrace } from "@/lib/actions/shared/trace";

export async function GET(req: NextRequest, props: { params: Promise<{ traceId: string }> }): Promise<Response> {
  const params = await props.params;
  const traceId = params.traceId;

  try {
    const trace = await getSharedTrace({ traceId });

    if (!trace) {
      return new Response(JSON.stringify({ error: "Trace not found" }), { status: 404 });
    }

    return NextResponse.json(trace);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get shared trace." },
      { status: 500 }
    );
  }
}
