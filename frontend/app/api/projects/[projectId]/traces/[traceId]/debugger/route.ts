import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { linkTraceToPendingSession } from "@/lib/actions/rollout-sessions";

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const { projectId, traceId } = params;
    const body = (await req.json().catch(() => ({}))) as {
      startDate?: string;
      endDate?: string;
    };

    const result = await linkTraceToPendingSession({
      projectId,
      traceId,
      startDate: body.startDate,
      endDate: body.endDate,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to open trace in debugger." },
      { status: 500 }
    );
  }
}
