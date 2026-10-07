import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSpanType } from "@/lib/actions/span";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string; spanId: string }> }
): Promise<Response> {
  const { projectId, traceId, spanId } = await props.params;

  try {
    const spanType = await getSpanType({ projectId, traceId, spanId });

    if (!spanType) {
      return NextResponse.json({ error: "Span not found" }, { status: 404 });
    }

    return NextResponse.json({ spanType });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get span type." }, { status: 500 });
  }
}
