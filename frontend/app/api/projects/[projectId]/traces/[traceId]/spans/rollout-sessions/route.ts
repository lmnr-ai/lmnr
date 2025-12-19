import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createRolloutSession } from "@/lib/actions/rollout-sessions";

export async function POST(req: Request, props: { params: Promise<{ projectId: string; traceId: string }> }) {
  try {
    const params = await props.params;
    const { projectId, traceId } = params;
    const body = await req.json();

    const result = await createRolloutSession({
      projectId,
      traceId,
      pathToCount: body.pathToCount,
      cursorTimestamp: body.cursorTimestamp,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create rollout session." },
      { status: 500 }
    );
  }
}
