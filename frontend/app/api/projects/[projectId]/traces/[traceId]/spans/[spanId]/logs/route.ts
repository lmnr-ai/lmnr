import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSpanLogs } from "@/lib/actions/logs";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, traceId, spanId } = params;

  try {
    const logs = await getSpanLogs({ spanId, traceId, projectId });

    return NextResponse.json(logs);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get span logs." }, { status: 500 });
  }
}
