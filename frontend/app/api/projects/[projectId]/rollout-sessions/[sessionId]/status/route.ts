import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { updateRolloutSessionStatus } from "@/lib/actions/rollout-sessions";

export async function PATCH(req: Request, props: { params: Promise<{ projectId: string; sessionId: string }> }) {
  try {
    const params = await props.params;
    const { sessionId, projectId } = params;
    const body = await req.json();

    const result = await updateRolloutSessionStatus({
      projectId,
      sessionId,
      ...body,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update rollout session status.",
      },
      { status: 500 }
    );
  }
}
