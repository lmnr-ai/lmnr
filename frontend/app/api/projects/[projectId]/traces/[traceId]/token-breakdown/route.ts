import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getTraceTokenBreakdown } from "@/lib/actions/trace/token-breakdown";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const { projectId, traceId } = await props.params;

  try {
    const result = await getTraceTokenBreakdown({ projectId, traceId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute token breakdown." },
      { status: 500 }
    );
  }
}
