import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSpan, updateSpanOutput } from "@/lib/actions/span";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, traceId, spanId } = params;

  try {
    const span = await getSpan({ spanId, traceId, projectId });

    return NextResponse.json(span);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get span." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, spanId, traceId } = params;

  try {
    const body = await req.json();

    await updateSpanOutput({
      spanId,
      projectId,
      traceId,
      output: body?.output,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to update span" }, { status: 500 });
  }
}
