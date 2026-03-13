import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedSpan } from "@/lib/actions/shared/span";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ traceId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const traceId = params.traceId;
  const spanId = params.spanId;

  try {
    const span = await getSharedSpan({ traceId, spanId });
    return NextResponse.json(span);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json(e instanceof Error ? e.message : "Failed to get shared span.", { status: 500 });
  }
}
