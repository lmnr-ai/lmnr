import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getTraceSpanOutline } from "@/lib/actions/trace/span-outline";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, traceId } = params;

  try {
    const outline = await getTraceSpanOutline({ projectId, traceId });

    return NextResponse.json(outline);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch trace span outline." },
      { status: 500 }
    );
  }
}
