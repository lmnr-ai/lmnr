import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedSpanOutputs } from "@/lib/actions/shared/spans/outputs.ts";

export async function POST(req: NextRequest, props: { params: Promise<{ traceId: string }> }): Promise<Response> {
  const params = await props.params;
  const { traceId } = params;

  try {
    const body = await req.json();
    const { spanIds, startDate, endDate } = body;

    const outputs = await getSharedSpanOutputs({ traceId, spanIds, startDate, endDate });

    return NextResponse.json({ outputs });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch span outputs." },
      { status: 500 }
    );
  }
}
