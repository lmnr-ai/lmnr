import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedDebuggerSessionTraces } from "@/lib/actions/shared/debugger-sessions";

export async function GET(_req: NextRequest, props: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const { sessionId } = await props.params;

  try {
    const result = await getSharedDebuggerSessionTraces({ sessionId });

    if (!result) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch session traces." },
      { status: 500 }
    );
  }
}
