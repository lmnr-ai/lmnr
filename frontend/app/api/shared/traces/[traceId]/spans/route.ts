import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedSpans } from "@/lib/actions/shared/spans";

export async function GET(req: NextRequest, props: { params: Promise<{ traceId: string }> }): Promise<Response> {
  const params = await props.params;
  const traceId = params.traceId;

  try {
    const spans = await getSharedSpans({ traceId });

    return NextResponse.json(spans);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get shared spans." },
      { status: 500 }
    );
  }
}
