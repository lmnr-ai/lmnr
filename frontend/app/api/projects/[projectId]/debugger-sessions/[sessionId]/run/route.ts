import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { runDebuggerSession } from "@/lib/actions/debugger-sessions";

export async function POST(req: Request, props: { params: Promise<{ projectId: string; sessionId: string }> }) {
  try {
    const params = await props.params;
    const { sessionId, projectId } = params;
    const body = await req.json();

    const result = await runDebuggerSession({
      projectId,
      sessionId,
      ...body,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    console.error("Debugger run error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to run debugger session.",
      },
      { status: 500 }
    );
  }
}
