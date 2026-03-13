import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getTrace, updateTraceVisibility } from "@/lib/actions/trace";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  try {
    const trace = await getTrace({ traceId, projectId });

    if (!trace) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }

    return NextResponse.json(trace);
  } catch (error) {
    console.error("Error fetching trace:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch trace",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;

  const projectId = params.projectId;
  const traceId = params.traceId;

  const body = (await req.json()) as { visibility: "private" | "public" };

  try {
    await updateTraceVisibility({ projectId, visibility: body?.visibility, traceId });

    return NextResponse.json("Updated trace visibility successfully.");
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error updating visibility. Please try again." },
      {
        status: 500,
      }
    );
  }
}
