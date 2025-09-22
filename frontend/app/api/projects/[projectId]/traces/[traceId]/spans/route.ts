import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getTraceSpans, GetTraceSpansSchema } from "@/lib/actions/spans";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetTraceSpansSchema.omit({ traceId: true, projectId: true })
  );

  if (!parseResult.success) {
    return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getTraceSpans({ ...parseResult.data, projectId, traceId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch trace spans." },
      { status: 500 }
    );
  }
}
