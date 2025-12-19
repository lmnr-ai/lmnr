import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getRolloutSession, updateRolloutSession } from "@/lib/actions/rollout-sessions";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string; id: string }> }
): Promise<Response> {
  const { projectId, traceId, id } = await props.params;

  try {
    const result = await getRolloutSession({ projectId, traceId, id });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get rollout session." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string; id: string }> }
): Promise<Response> {
  const { projectId, traceId, id } = await props.params;

  try {
    const body = await req.json();
    const result = await updateRolloutSession({ ...body, projectId, traceId, id });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update rollout session." },
      { status: 500 }
    );
  }
}
