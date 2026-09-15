import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedTraceSignals } from "@/lib/actions/shared/signals";

export async function GET(req: NextRequest, props: { params: Promise<{ traceId: string }> }): Promise<Response> {
  const params = await props.params;
  const traceId = params.traceId;

  try {
    const result = await getSharedTraceSignals({ traceId });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Failed to get shared trace signals.",
      },
      { status: 500 }
    );
  }
}
