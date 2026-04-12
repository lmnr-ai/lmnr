import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedSpanPreviews } from "@/lib/actions/shared/spans/previews.ts";

export async function POST(req: NextRequest, props: { params: Promise<{ traceId: string }> }): Promise<Response> {
  const params = await props.params;
  const { traceId } = params;

  try {
    const body = await req.json();
    const { spanIds, spanTypes, startDate, endDate, inputSpanIds } = body;

    const result = await getSharedSpanPreviews({
      traceId,
      spanIds,
      spanTypes,
      startDate,
      endDate,
      inputSpanIds,
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
