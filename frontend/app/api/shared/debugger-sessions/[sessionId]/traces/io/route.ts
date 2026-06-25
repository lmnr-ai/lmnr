import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedDebuggerSessionTraceIO } from "@/lib/actions/shared/debugger-sessions";

export async function POST(req: NextRequest, props: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const { sessionId } = await props.params;

  try {
    const body = await req.json();
    const result = await getSharedDebuggerSessionTraceIO({ sessionId, traceIds: body.traceIds });

    if (!result) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
