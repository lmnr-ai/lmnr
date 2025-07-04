import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedSpanLabels } from "@/lib/actions/shared/span";

export async function GET(
  _req: Request,
  props: { params: Promise<{ traceId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const spanId = params.spanId;
  const traceId = params.traceId;

  try {
    const labels = await getSharedSpanLabels({ traceId, spanId });
    return NextResponse.json(labels);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get shared span labels." }, { status: 500 });
  }
}
