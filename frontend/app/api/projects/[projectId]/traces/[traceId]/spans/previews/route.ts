import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSpanPreviews } from "@/lib/actions/spans/previews";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, traceId } = params;

  try {
    const body = await req.json();
    const { spanIds, spanTypes, startDate, endDate, inputSpanIds, promptHashes } = body;

    const result = await getSpanPreviews({
      projectId,
      traceId,
      spanIds,
      spanTypes,
      startDate,
      endDate,
      inputSpanIds,
      promptHashes,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate span previews." },
      { status: 500 }
    );
  }
}
